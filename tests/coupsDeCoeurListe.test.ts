import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import {
  AVERTISSEMENT_COUPS_DE_COEUR,
  avertissementCoupsDeCoeur,
  gesteCoupDeCoeur,
  libelleCompteCoupsDeCoeur,
} from "@/src/lib/coupsDeCoeurLogique";
import { compterCoupsDeCoeur } from "@/src/lib/listeArticlesAdmin";
import { pastilleOffre, pourcentageOffre, prixApplicable } from "@/src/lib/prixLogique";

// Le journal lit sa table par la clé de service : ici, seuls ses libellés comptent.
vi.mock("@/src/lib/supabase-admin", () => ({ supabaseAdmin: {} }));
const { libelleEvenement } = await import("@/src/lib/journalEvenements");

/** APP 62 — la liste des articles (admin) et la pastille du catalogue. */

describe("le compte des coups de cœur, au-dessus de la liste filtrée", () => {
  it("s'accorde : un, plusieurs, aucun", () => {
    expect(libelleCompteCoupsDeCoeur(0)).toBe("Aucun coup de cœur");
    expect(libelleCompteCoupsDeCoeur(1)).toBe("1 coup de cœur");
    expect(libelleCompteCoupsDeCoeur(6)).toBe("6 coups de cœur");
  });

  it("ne compte que les articles actifs : un article retiré ne sort plus en vitrine", () => {
    expect(compterCoupsDeCoeur([
      { actif: true, coup_de_coeur: true },
      { actif: false, coup_de_coeur: true },
      { actif: true, coup_de_coeur: false },
      { actif: true },
    ])).toBe(1);
  });

  it("avertit doucement AU-DELÀ de 8, et pas à 8", () => {
    expect(avertissementCoupsDeCoeur(8)).toBeNull();
    expect(avertissementCoupsDeCoeur(9)).toBe(AVERTISSEMENT_COUPS_DE_COEUR);
    expect(AVERTISSEMENT_COUPS_DE_COEUR).toBe("Au-delà de 8, la section devient longue sur téléphone.");
  });

  it("n'est qu'un avertissement : rien dans l'action ne refuse un neuvième", () => {
    const action = readFileSync(join(__dirname, "..", "app/(admin)/boutique/actions.ts"), "utf8");
    expect(action).not.toMatch(/SEUIL_COUPS_DE_COEUR|avertissementCoupsDeCoeur/);
  });
});

describe("le geste au journal", () => {
  it("ne naît que d'un changement", () => {
    expect(gesteCoupDeCoeur(false, true)).toBe("coup_de_coeur_ajoute");
    expect(gesteCoupDeCoeur(true, false)).toBe("coup_de_coeur_retire");
    expect(gesteCoupDeCoeur(true, true)).toBeNull();
    expect(gesteCoupDeCoeur(null, false)).toBeNull();
    expect(gesteCoupDeCoeur(undefined, true)).toBe("coup_de_coeur_ajoute");
  });

  it("se lit en toutes lettres dans le journal des gestes", () => {
    expect(libelleEvenement("coup_de_coeur_ajoute", "article")).toBe("Mis en coup de cœur");
    expect(libelleEvenement("coup_de_coeur_retire", "article")).toBe("Retiré des coups de cœur");
  });
});

describe("la pastille « −n % » du catalogue lit prixApplicable", () => {
  const offre = {
    id: "o", nom: "Action du mois", type: "action", pourcentage: 20,
    date_debut: "2026-10-01", date_fin: "2026-10-31", cible: "tous", actif: true,
  };
  const article = (pct: number | null) => ({
    id: "a", prix_vente: 10, categorie: "friandises",
    promotions: pct === null ? [] : [{ ...offre, pourcentage: pct }],
    remise_membre_pourcent: 10,
  });
  const date = "2026-10-03";

  it("une offre retenue donne sa pastille", () => {
    const p = prixApplicable({ article: article(20), client: null, date });
    expect(pourcentageOffre(p)).toBe(20);
    expect(pastilleOffre(20)).toBe("−20 %");
    expect(pastilleOffre(7.5)).toBe("−7,5 %");
  });

  it("sans offre, ou quand l'adhésion l'emporte : pas de pastille d'offre", () => {
    expect(pourcentageOffre(prixApplicable({ article: article(null), client: null, date }))).toBeNull();
    expect(pourcentageOffre(prixApplicable({ article: article(5), client: { estMembre: true }, date }))).toBeNull();
  });

  it("est rose, texte blanc", () => {
    const carte = readFileSync(join(__dirname, "..", "app/(public)/catalogue/CatalogueBoutique.tsx"), "utf8");
    expect(carte).toContain('const ROSE_OFFRE = "#E8847A"');
    expect(carte).toMatch(/backgroundColor: ROSE_OFFRE, color: "#FFFFFF"/);
  });
});
