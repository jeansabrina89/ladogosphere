import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { prixDansContexte, type Promotion } from "@/src/lib/prixLogique";

/**
 * APP 62 — non-régression des prix, à la caisse et en ligne.
 *
 * Le lot n'a rien changé au calcul : l'offre du mois est une Action, que
 * `prixApplicable` appliquait déjà partout. Ce fichier le garde de deux
 * façons :
 *
 *   1. les DEUX chemins — la commande en ligne (`prixDe`, au serveur) et la
 *      caisse (`prixDansContexte`, dans le navigateur, sur le contexte mis à
 *      plat) — rendent le même prix qu'avant pour un article sans offre, et la
 *      meilleure remise, sans cumul, pour un membre sur un article en offre ;
 *   2. aucun code de l'app ne lit `offre_prix` pour calculer : cette colonne
 *      est pour le SITE. Le jour où l'app la lirait, il y aurait deux règles.
 */

vi.mock("@/src/lib/supabase-admin", () => ({ supabaseAdmin: {} }));

const { prixDe, aplatirContextePrix } = await import("@/src/lib/prix");
type ContextePrix = Parameters<typeof prixDe>[0];

const JOUR = "2026-10-03";

const action = (pct: number): Promotion => ({
  id: `action-${pct}`, nom: "Action du mois", type: "action", pourcentage: pct,
  date_debut: "2026-10-01", date_fin: "2026-10-31", cible: "tous", actif: true,
});

const SANS_OFFRE = { id: "a-sans", prix_vente: 12.9, categorie: "friandises", remise_membre_exclue: false };
const EN_OFFRE = { id: "a-offre", prix_vente: 10, categorie: "friandises", remise_membre_exclue: false };
const PETITE_OFFRE = { id: "a-petite", prix_vente: 10, categorie: "friandises", remise_membre_exclue: false };

const ctx: ContextePrix = {
  date: JOUR,
  promotions: [action(20), action(5)],
  parArticle: new Map([["a-offre", [action(20)]], ["a-petite", [action(5)]]]),
  remiseParCategorie: new Map([["friandises", 10]]),
};

const VISITEUR = { estMembre: false };
const MEMBRE = { estMembre: true };

/** Le même prix, par la commande en ligne ET par la caisse. */
function lesDeuxChemins(article: typeof SANS_OFFRE, client: { estMembre: boolean }) {
  const enLigne = prixDe(ctx, article, client);
  const caisse = prixDansContexte(aplatirContextePrix(ctx), article, client);
  expect(caisse, "la caisse et la commande en ligne doivent dire la même chose").toEqual(enLigne);
  return enLigne;
}

describe("un article SANS offre : le prix d'avant", () => {
  it("visiteur : le prix de vente, sans remise", () => {
    const p = lesDeuxChemins(SANS_OFFRE, VISITEUR);
    expect(p.prixFinal).toBe(12.9);
    expect(p.origine).toBeNull();
  });

  it("membre : sa remise d'adhésion, comme avant", () => {
    const p = lesDeuxChemins(SANS_OFFRE, MEMBRE);
    expect(p.origine).toBe("membre");
    expect(p.prixFinal).toBe(11.61);
  });
});

describe("un membre sur un article EN OFFRE : la meilleure, jamais les deux", () => {
  it("l'offre −20 % l'emporte sur l'adhésion −10 % : 8.00, pas 7.20", () => {
    const p = lesDeuxChemins(EN_OFFRE, MEMBRE);
    expect(p.origine).toBe("action");
    expect(p.prixFinal).toBe(8);
    expect(p.cumulEvite).toBe(true);
  });

  it("l'adhésion −10 % l'emporte sur une offre −5 % : 9.00, pas 8.55", () => {
    const p = lesDeuxChemins(PETITE_OFFRE, MEMBRE);
    expect(p.origine).toBe("membre");
    expect(p.prixFinal).toBe(9);
  });

  it("un visiteur sur l'article en offre paie le prix remisé", () => {
    expect(lesDeuxChemins(EN_OFFRE, VISITEUR).prixFinal).toBe(8);
  });
});

// ── Aucun code de l'app ne calcule depuis la vue ───────────────────────────

const RACINE = join(__dirname, "..");

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const chemin = join(dossier, n);
    if (statSync(chemin).isDirectory()) return n === "node_modules" ? [] : fichiers(chemin);
    return /\.(ts|tsx)$/.test(n) ? [chemin] : [];
  });
}

/** Le fichier sans ses commentaires : une explication n'est pas un usage. */
const codeSeul = (chemin: string) =>
  readFileSync(chemin, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("les deux chemins de vente passent par la fonction unique", () => {
  it("la caisse fige le prix par prixDe", () => {
    expect(codeSeul(join(RACINE, "src/lib/caisse.ts"))).toMatch(/prixDe\(ctx, article, client\)/);
  });

  it("la commande en ligne aussi", () => {
    expect(codeSeul(join(RACINE, "src/lib/panier/catalogue.ts"))).toMatch(/prixDe\(ctx, brut as never, \{ estMembre: membre \}\)/);
  });

  it("offre_prix n'est lu nulle part dans l'app — seulement déclaré pour le site", () => {
    const permis = new Set(["src/lib/vitrineColonnes.ts", "src/lib/vitrine.ts"]);
    const lecteurs = [...fichiers(join(RACINE, "app")), ...fichiers(join(RACINE, "src"))]
      .map((f) => relative(RACINE, f).replace(/\\/g, "/"))
      .filter((f) => !permis.has(f))
      .filter((f) => /\boffre_prix\b/.test(codeSeul(join(RACINE, f))));
    expect(lecteurs).toEqual([]);
  });
});
