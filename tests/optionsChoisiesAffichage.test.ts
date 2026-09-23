import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Les options choisies d'un article sur mesure, visibles partout où la ligne
 * apparaît. Une seule fonction écrit le libellé (libellesConfiguration) ; on
 * la teste, puis on regarde le panier et l'e-mail de confirmation la montrer.
 */

const H = vi.hoisted(() => ({
  html: [] as string[],
  un: {} as Record<string, unknown>,
  liste: {} as Record<string, unknown[]>,
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (p: { html: string }) => {
        H.html.push(p.html);
        return { data: { id: "re_test" }, error: null };
      },
    };
  },
}));

vi.mock("@/src/lib/supabase-admin", () => {
  function from(table: string) {
    const chain: Record<string, unknown> = {};
    const soi = () => chain;
    Object.assign(chain, {
      select: soi, eq: soi, in: soi, order: soi, neq: soi, limit: soi, is: soi, not: soi,
      update: soi,
      insert: () => Promise.resolve({ error: null }),
      maybeSingle: () => Promise.resolve({ data: H.un[table] ?? null, error: null }),
      single: () => Promise.resolve({ data: H.un[table] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
        Promise.resolve({ data: H.liste[table] ?? [], error: null }).then(ok, ko),
    });
    return chain;
  }
  return { supabaseAdmin: { from, rpc: async () => ({ data: null, error: null }) } };
});

vi.mock("@/src/lib/entiteJuridique", () => ({ entiteA: async () => ({}) }));
vi.mock("@/src/lib/entiteJuridiqueLogique", () => ({ raisonSocialeAffichee: () => "La Dogosphère" }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import {
  libellesConfiguration,
  libelleConfiguration,
  choixLus,
  TEXTE_MAX_LISTE,
} from "@/src/lib/personnalisationLogique";
import OptionsChoisies from "@/app/components/OptionsChoisies";
import { envoyerEmailCommandeConfirmee } from "@/src/lib/email";

const lire = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const choix = (
  groupe_nom: string, valeur_libelle: string, ordre: number,
  autres: { valeur_texte?: string | null; supplement_prix?: number } = {},
) => ({
  groupe_nom, valeur_libelle, ordre,
  valeur_texte: autres.valeur_texte ?? null,
  supplement_prix: autres.supplement_prix ?? 0,
  code_couleur: null, composant_article_id: null, composant_quantite: null,
});

/** Le collier du panier 7a820aa4, tel qu'il est stocké. */
const COLLIER = [
  choix("Largeur", "16 mm", 1),
  choix("Couleur de la base du collier", "VI521 violet", 2),
];

// ── Le libellé ─────────────────────────────────────────────────────────────

describe("libellé lisible d'une configuration", () => {
  it("une option", () => {
    expect(libellesConfiguration([choix("Largeur", "16 mm", 1)])).toEqual(["Largeur : 16 mm"]);
  });

  it("trois options, dans l'ordre des questions même si le stockage les mélange", () => {
    const config = [
      choix("Longueur", "42 cm", 3),
      choix("Largeur", "16 mm", 1),
      choix("Couleur de la base", "bleu marine", 2),
    ];
    expect(libelleConfiguration(config)).toBe(
      "Largeur : 16 mm · Couleur de la base : bleu marine · Longueur : 42 cm",
    );
  });

  it("un supplément est indiqué, pas recompté", () => {
    expect(libellesConfiguration([
      choix("Couleur", "bleu marine", 1, { supplement_prix: 5 }),
      choix("Largeur", "16 mm", 2, { supplement_prix: 0 }),
      choix("Boucle", "plastique", 3, { supplement_prix: -2.5 }),
    ])).toEqual([
      "Couleur : bleu marine (+5.00 CHF)",
      "Largeur : 16 mm",
      "Boucle : plastique (−2.50 CHF)",
    ]);
  });

  it("une gravure longue : entre guillemets, coupée à 60 caractères dans une liste, entière sur la fiche", () => {
    const texte = "Pixel, le meilleur chien du monde entier, appelez le 079 000 00 00 s'il est perdu";
    expect(texte.length).toBeGreaterThan(TEXTE_MAX_LISTE);
    const config = [choix("Gravure", texte, 1, { valeur_texte: texte })];

    const [liste] = libellesConfiguration(config);
    expect(liste.startsWith("Gravure : « ")).toBe(true);
    expect(liste.endsWith("… »")).toBe(true);
    const cite = liste.slice("Gravure : « ".length, -" »".length);
    expect(cite.length).toBeLessThanOrEqual(TEXTE_MAX_LISTE + 1);
    expect(cite).toBe(`${texte.slice(0, TEXTE_MAX_LISTE).trimEnd()}…`);

    expect(libellesConfiguration(config, { complet: true })).toEqual([`Gravure : « ${texte} »`]);
    expect(libellesConfiguration([choix("Gravure", "Pixel", 1, { valeur_texte: "Pixel" })]))
      .toEqual(["Gravure : « Pixel »"]);
  });

  it("rien à lire : rien à dire (article standard, jsonb inattendu)", () => {
    for (const vide of [null, undefined, [], {}, "texte", [{ valeur_libelle: "sans groupe" }]]) {
      expect(libellesConfiguration(vide)).toEqual([]);
      expect(libelleConfiguration(vide)).toBe("");
    }
    expect(choixLus([null, 3, { groupe_nom: "Largeur", valeur_libelle: "16 mm" }])).toHaveLength(1);
  });
});

// ── Le panier ──────────────────────────────────────────────────────────────

describe("le panier montre les choix sous le nom de l'article", () => {
  it("le rendu contient « Largeur : 16 mm » et les autres choix", () => {
    const html = renderToStaticMarkup(createElement(OptionsChoisies, { options: libellesConfiguration(COLLIER) }));
    expect(html).toContain("Largeur : 16 mm · Couleur de la base du collier : VI521 violet");
  });

  it("une ligne d'article standard n'affiche rien de plus", () => {
    expect(renderToStaticMarkup(createElement(OptionsChoisies, { options: libellesConfiguration(null) }))).toBe("");
    expect(renderToStaticMarkup(createElement(OptionsChoisies, { options: undefined }))).toBe("");
  });

  it("panier connecté, panier visiteur, Mes commandes, commandes en ligne et bon passent par la même fonction", () => {
    const panierPage = lire("app/(public)/catalogue/panier/page.tsx");
    expect(panierPage).toMatch(/choixDesLignes\(lignesDb\)/);
    expect(panierPage).toMatch(/options: libellesConfiguration\(/);
    expect(lire("app/(public)/catalogue/panier/Panier.tsx")).toMatch(/<OptionsChoisies options=\{l\.options\} \/>/);
    expect(lire("app/(public)/catalogue/PanierVisiteur.tsx"))
      .toMatch(/<OptionsChoisies options=\{libellesConfiguration\(apercu\)\} \/>/);
    expect(lire("app/(client)/mon-compte/commandes/page.tsx")).toMatch(/libellesConfiguration\(choix\.get\(l\.id\)\)/);
    expect(lire("app/(admin)/boutique/commandes-en-ligne/page.tsx")).toMatch(/libellesConfiguration\(choix\.get\(l\.id\)\)/);
    expect(lire("app/(admin)/boutique/commandes-en-ligne/CarteCommandeEnLigne.tsx")).toMatch(/<OptionsChoisies options=\{l\.options\} \/>/);
    // Le bon les donne en entier.
    expect(lire("app/(admin)/boutique/commandes-en-ligne/[id]/bon/page.tsx"))
      .toMatch(/libellesConfiguration\(choix\.get\(l\.id\), \{ complet: true \}\)/);
  });

  it("la facture : une seule ligne de détail, lue sans rien écrire", () => {
    const doc = lire("src/lib/factureDocument.ts");
    expect(doc).toMatch(/detail: details\.get\(Number\(l\.ordre\)\)/);
    const pdf = lire("src/lib/facturePdf.tsx");
    expect(pdf).toMatch(/\{pourPdf\(l\.detail\)\}/);
    const perso = lire("src/lib/personnalisation.ts");
    const fonction = perso.slice(perso.indexOf("export async function detailsConfigurationFacture"));
    const corps = fonction.slice(0, fonction.indexOf("\nexport "));
    expect(corps).toMatch(/libelleConfiguration\(choix\.get\(l\.id\), \{ complet: true \}\)/);
    expect(corps).not.toMatch(/\.(insert|update|delete|upsert)\(/);
  });
});

// ── L'e-mail de confirmation ───────────────────────────────────────────────

describe("l'e-mail de confirmation de commande", () => {
  beforeEach(() => {
    H.html = [];
    H.un = {
      commandes: {
        id: "cmd-1", numero: "CMD-2026-0001", mode_remise: "retrait", mode_paiement: "retrait",
        frais_port: 0, remise_membre: 0, montant_total: 67, client_id: "cli-1",
      },
      clients: { prenom: "Camille", email: "client@exemple.test" },
    };
    H.liste = {
      commandes_lignes: [
        { id: "l-1", libelle: "Laisse 2 m", quantite: 1, prix_unitaire: 24, montant: 24, configuration: null, commande_personnalisee_id: null },
        { id: "l-2", libelle: "collier 23 — sur mesure", quantite: 1, prix_unitaire: 43, montant: 43, configuration: null, commande_personnalisee_id: "cp-1" },
      ],
      commandes_choix: [
        { commande_id: "cp-1", ...choix("Couleur de la base du collier", "VI521 violet", 2) },
        { commande_id: "cp-1", ...choix("Largeur", "16 mm", 1) },
        { commande_id: "cp-1", ...choix("Gravure", "<b>Pixel</b>", 3, { valeur_texte: "<b>Pixel</b>" }) },
      ],
    };
  });

  it("les choix figurent sous l'article sur mesure, en entier et échappés", async () => {
    const r = await envoyerEmailCommandeConfirmee("cmd-1");
    expect(r.envoye).toBe(true);
    expect(H.html).toHaveLength(1);
    const html = H.html[0];
    expect(html).toContain(
      "Largeur : 16 mm · Couleur de la base du collier : VI521 violet · Gravure : « &lt;b&gt;Pixel&lt;/b&gt; »",
    );
    expect(html).not.toContain("<b>Pixel</b>");
  });

  it("la ligne standard n'a rien de plus", async () => {
    await envoyerEmailCommandeConfirmee("cmd-1");
    const html = H.html[0];
    const laisse = html.slice(html.indexOf("Laisse 2 m"), html.indexOf("collier 23"));
    expect(laisse).not.toContain("font-size:13px");
    expect(html.match(/<span style="color:#6B7280; font-size:13px;">/g) ?? []).toHaveLength(1);
  });
});
