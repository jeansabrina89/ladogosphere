import { describe, it, expect } from "vitest";
import { ventilerPanier, TAUX_NORMAL, TAUX_REDUIT } from "@/src/lib/tvaLogique";
import { prixApplicable, remiseLigne, type Promotion } from "@/src/lib/prixLogique";
import {
  remisesParOrigine,
  remiseTotale,
  sousTotalBase,
  totalCommande,
  type LignePanier,
} from "@/src/lib/venteEnLigneLogique";

/**
 * Une remise de LIGNE diminue la base de SA ligne, à SON taux.
 *
 * Elle ne passe pas par le prorata d'APP 14, qui est fait pour un rabais de
 * panier. Les deux mécanismes cohabitent pourtant dans la même facture — le
 * port se répartit au prorata, les remises restent sur leurs lignes — et le
 * total ventilé doit continuer de valoir exactement le total de la pièce.
 */

const JOUR = "2026-10-05";
const cents = (n: number) => Math.round(n * 100) / 100;

const action: Promotion = {
  id: "p1", nom: "Action du mois", type: "action", pourcentage: 20,
  date_debut: "2026-10-01", date_fin: "2026-10-31", cible: "tous",
  texte: null, actif: true, ordre: 0,
};

/** Le panier de l'exemple : une friandise en action, un collier au plein tarif. */
function panierMembre() {
  const friandise = prixApplicable({
    article: {
      id: "a1", prix_vente: 10, categorie: "friandises",
      promotions: [action], remise_membre_pourcent: 10,
    },
    client: { estMembre: true },
    date: JOUR,
  });
  const collier = prixApplicable({
    article: {
      id: "a2", prix_vente: 45, categorie: "colliers",
      promotions: [], remise_membre_pourcent: 10,
    },
    client: { estMembre: true },
    date: JOUR,
  });
  return { friandise, collier };
}

describe("l’exemple de Sabrina, ligne par ligne", () => {
  const { friandise, collier } = panierMembre();

  it("la friandise à 10.00 en action −20 % tombe à 8.00 pour un membre", () => {
    expect(friandise.prixFinal).toBe(8);
    expect(friandise.origine).toBe("action");
  });

  it("le reste du panier garde bien sa remise membre de −10 %", () => {
    expect(collier.prixFinal).toBe(40.5);
    expect(collier.origine).toBe("membre");
  });

  it("le panier montre les deux remises, nommées séparément", () => {
    const lignes: LignePanier[] = [
      ligne("Friandises", 1, friandise),
      ligne("Collier", 1, collier),
    ];
    expect(sousTotalBase(lignes)).toBe(55);
    expect(remiseTotale(lignes)).toBe(6.5);
    expect(remisesParOrigine(lignes)).toEqual([
      { libelle: "Action du mois −20 %", montant: 2 },
      { libelle: "Remise membre −10 %", montant: 4.5 },
    ]);
    expect(totalCommande({ lignes, fraisPort: 0 }).aPayer).toBe(48.5);
  });
});

describe("la ventilation de TVA", () => {
  const { friandise, collier } = panierMembre();

  // Friandises à 2,6 %, collier à 8,1 % : deux taux dans le même panier.
  const lignesTva = [
    { montant: friandise.prixFinal, taux_tva: TAUX_REDUIT },
    { montant: collier.prixFinal, taux_tva: TAUX_NORMAL },
  ];

  it("part des montants NETS : la remise a déjà diminué la base de sa ligne", () => {
    const v = ventilerPanier({ lignes: lignesTva, port: 0, remise: 0 });
    const reduit = v.parts.find((p) => p.taux === TAUX_REDUIT)!;
    const normal = v.parts.find((p) => p.taux === TAUX_NORMAL)!;
    // 8.00 à 2,6 % et 40.50 à 8,1 % — chaque remise est restée sur SA ligne.
    expect(reduit.ttc).toBe(8);
    expect(normal.ttc).toBe(40.5);
  });

  it("le total ventilé vaut exactement le total de la pièce", () => {
    const v = ventilerPanier({ lignes: lignesTva, port: 0, remise: 0 });
    expect(v.totalTtc).toBe(48.5);
    expect(cents(v.totalHt + v.totalTva)).toBe(48.5);
    expect(cents(v.parts.reduce((s, p) => s + p.ttc, 0))).toBe(v.totalTtc);
  });

  it("le port continue de se répartir au prorata : les deux mécanismes cohabitent", () => {
    const v = ventilerPanier({ lignes: lignesTva, port: 9, remise: 0 });
    expect(v.totalTtc).toBe(57.5);
    expect(cents(v.parts.reduce((s, p) => s + p.port, 0))).toBe(9);
    expect(cents(v.parts.reduce((s, p) => s + p.ttc, 0))).toBe(v.totalTtc);
    // Aucune remise de panier ici : elles sont toutes restées sur les lignes.
    expect(cents(v.parts.reduce((s, p) => s + p.remise, 0))).toBe(0);
  });

  it("un rabais de PANIER passe toujours par le prorata, lui", () => {
    // Le mécanisme d'APP 14 n'est pas retiré : il sert encore, ailleurs.
    const v = ventilerPanier({ lignes: lignesTva, port: 0, remise: 5 });
    expect(cents(v.parts.reduce((s, p) => s + p.remise, 0))).toBe(5);
    expect(v.totalTtc).toBe(43.5);
    expect(cents(v.parts.reduce((s, p) => s + p.ttc, 0))).toBe(v.totalTtc);
  });
});

describe("ce que la ligne emporte à la vente", () => {
  it("le prix payé, le prix de base et l’origine nommée", () => {
    const { friandise } = panierMembre();
    expect(remiseLigne(friandise)).toEqual({
      prix_base: 10,
      remise_pourcentage: 20,
      remise_origine: "action",
      remise_libelle: "Action du mois −20 %",
    });
  });

  it("rien du tout quand aucune remise ne s’applique", () => {
    const plein = prixApplicable({
      article: { id: "a3", prix_vente: 12, categorie: "jouets", promotions: [], remise_membre_pourcent: 10 },
      client: { estMembre: false },
      date: JOUR,
    });
    expect(remiseLigne(plein)).toBeNull();
  });
});

function ligne(
  libelle: string,
  quantite: number,
  prix: ReturnType<typeof prixApplicable>
): LignePanier {
  const remise = remiseLigne(prix);
  return {
    article_id: libelle.toLowerCase(),
    libelle,
    quantite,
    prix_unitaire: prix.prixFinal,
    taux_tva: 0,
    prix_base: remise?.prix_base ?? null,
    remise_pourcentage: remise?.remise_pourcentage ?? null,
    remise_origine: remise?.remise_origine ?? null,
    remise_libelle: remise?.remise_libelle ?? null,
  };
}
