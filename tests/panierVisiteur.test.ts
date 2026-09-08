import { describe, it, expect } from "vitest";
import {
  CLE_PANIER_LOCAL,
  ajouterLocalement,
  changerQuantiteLocale,
  fusionnerPaniers,
  lirePanierLocal,
  messageFusion,
  messageRecalcul,
  nombreArticlesLocal,
  recalculerPanier,
  retirerLocalement,
  type LigneCompte,
  type LigneAValider,
  type PanierLocal,
} from "@/src/lib/panierLocalLogique";
import { COLONNES_INTERDITES_AU_PUBLIC, COLONNES_VITRINE } from "@/src/lib/vitrineColonnes";
import { disponibiliteVitrine, mentionRemiseMembre } from "@/src/lib/venteEnLigneLogique";
import { adresseDeRetour } from "@/src/lib/retourApresConnexion";

const COLLIER = "11111111-1111-4111-8111-111111111111";
const LAISSE = "22222222-2222-4222-8222-222222222222";
const PARTI = "33333333-3333-4333-8333-333333333333";

const panier = (lignes: PanierLocal["lignes"]): PanierLocal => ({ lignes });

describe("le panier du navigateur", () => {
  it("se lit même quand le navigateur rend n’importe quoi", () => {
    expect(lirePanierLocal(null).lignes).toEqual([]);
    expect(lirePanierLocal("pas du json").lignes).toEqual([]);
    expect(lirePanierLocal('{"lignes":"non"}').lignes).toEqual([]);
    // Un identifiant qui n’est pas un UUID ne rentre pas.
    expect(lirePanierLocal('{"lignes":[{"article_id":"../admin","quantite":1}]}').lignes)
      .toEqual([]);
  });

  it("ne reprend JAMAIS un prix venu du navigateur", () => {
    const lu = lirePanierLocal(
      JSON.stringify({ lignes: [{ article_id: COLLIER, quantite: 2, prix_unitaire: 0.01 }] })
    );
    expect(lu.lignes).toHaveLength(1);
    expect(JSON.stringify(lu)).not.toContain("prix");
  });

  it("regroupe le même article au lieu d’empiler les lignes", () => {
    let p = ajouterLocalement(panier([]), { article_id: COLLIER, quantite: 1 });
    p = ajouterLocalement(p, { article_id: COLLIER, quantite: 2 });
    expect(p.lignes).toHaveLength(1);
    expect(p.lignes[0].quantite).toBe(3);
  });

  it("garde chaque sur-mesure à part : deux configurations, deux lignes", () => {
    let p = ajouterLocalement(panier([]), { article_id: COLLIER, quantite: 1, configuration: [{ a: 1 }] });
    p = ajouterLocalement(p, { article_id: COLLIER, quantite: 1, configuration: [{ a: 2 }] });
    expect(p.lignes).toHaveLength(2);
  });

  it("retire la ligne quand la quantité tombe à zéro", () => {
    const p = changerQuantiteLocale(panier([{ article_id: COLLIER, quantite: 1 }]), 0, 0);
    expect(p.lignes).toEqual([]);
  });

  it("compte les articles, pas les lignes", () => {
    expect(nombreArticlesLocal(panier([
      { article_id: COLLIER, quantite: 2 },
      { article_id: LAISSE, quantite: 3 },
    ]))).toBe(5);
  });

  it("supporte un retrait sur un index qui n’existe pas", () => {
    const p = panier([{ article_id: COLLIER, quantite: 1 }]);
    expect(retirerLocalement(p, 9).lignes).toHaveLength(1);
  });

  it("range le panier sous une clé stable", () => {
    expect(CLE_PANIER_LOCAL).toBe("boutique.panier.visiteur");
  });
});

describe("la fusion à la connexion", () => {
  const vendables = new Set([COLLIER, LAISSE]);

  it("prend la quantité LA PLUS ÉLEVÉE, jamais la somme", () => {
    const compte: LigneCompte[] = [
      { id: "ligne-1", article_id: COLLIER, quantite: 1, configuration: null },
    ];
    const f = fusionnerPaniers(panier([{ article_id: COLLIER, quantite: 3 }]), compte, vendables);

    expect(f.aCreer).toEqual([]);
    expect(f.aMonter).toEqual([{ id: "ligne-1", quantite: 3 }]);
  });

  it("ne redescend pas la quantité déjà au compte", () => {
    const compte: LigneCompte[] = [
      { id: "ligne-1", article_id: COLLIER, quantite: 4, configuration: null },
    ];
    const f = fusionnerPaniers(panier([{ article_id: COLLIER, quantite: 2 }]), compte, vendables);

    expect(f.aMonter).toEqual([]);
    expect(f.aCreer).toEqual([]);
  });

  it("ajoute ce que le compte n’avait pas", () => {
    const f = fusionnerPaniers(panier([{ article_id: LAISSE, quantite: 2 }]), [], vendables);
    expect(f.aCreer).toHaveLength(1);
    expect(f.aCreer[0]).toMatchObject({ article_id: LAISSE, quantite: 2 });
  });

  it("écarte un article désactivé entre-temps, sans bloquer le reste", () => {
    const f = fusionnerPaniers(
      panier([
        { article_id: PARTI, quantite: 1 },
        { article_id: LAISSE, quantite: 1 },
      ]),
      [],
      vendables
    );
    expect(f.ecartes).toEqual([PARTI]);
    expect(f.aCreer).toHaveLength(1);
    expect(f.aCreer[0].article_id).toBe(LAISSE);
  });

  it("dit en UNE ligne ce qui s’est passé", () => {
    const f = fusionnerPaniers(
      panier([{ article_id: LAISSE, quantite: 1 }, { article_id: PARTI, quantite: 1 }]),
      [],
      vendables
    );
    const message = messageFusion(f, ["Collier retiré"]);
    expect(message).toContain("1 article de votre panier a rejoint votre compte.");
    expect(message).toContain("n'est plus proposé");
    expect(message!.split("\n")).toHaveLength(1);
  });

  it("ne dit rien quand il n’y avait rien à reprendre", () => {
    expect(messageFusion(fusionnerPaniers(panier([]), [], vendables))).toBeNull();
  });
});

describe("le recalcul des prix à la validation", () => {
  const ligne = (p: Partial<LigneAValider> = {}): LigneAValider => ({
    id: "l1", article_id: COLLIER, libelle: "Collier cuir",
    quantite: 2, prix_unitaire: 30, ...p,
  });

  it("facture le prix D’AUJOURD’HUI, pas celui du panier endormi", () => {
    const r = recalculerPanier(
      [ligne()],
      [{ id: COLLIER, nom: "Collier cuir", prix_vente: 35, disponible: true }]
    );
    expect(r.lignes[0].prix_actuel).toBe(35);
    expect(r.prixChanges).toEqual([{ libelle: "Collier cuir", avant: 30, apres: 35 }]);
    expect(r.aSignaler).toBe(true);
  });

  it("ne signale rien quand le prix n’a pas bougé", () => {
    const r = recalculerPanier(
      [ligne()],
      [{ id: COLLIER, nom: "Collier cuir", prix_vente: 30, disponible: true }]
    );
    expect(r.aSignaler).toBe(false);
    expect(messageRecalcul(r)).toBeNull();
  });

  it("sort l’article devenu indisponible sans bloquer le reste", () => {
    const r = recalculerPanier(
      [
        ligne(),
        ligne({ id: "l2", article_id: PARTI, libelle: "Laisse d’été", prix_unitaire: 20 }),
      ],
      [
        { id: COLLIER, nom: "Collier cuir", prix_vente: 30, disponible: true },
        { id: PARTI, nom: "Laisse d’été", prix_vente: 20, disponible: false },
      ]
    );
    expect(r.lignes).toHaveLength(1);
    expect(r.lignes[0].id).toBe("l1");
    expect(r.retires).toEqual(["Laisse d’été"]);
    expect(messageRecalcul(r)).toContain("n'est plus proposé");
  });

  it("garde au sur-mesure le prix figé de sa configuration", () => {
    const r = recalculerPanier(
      [ligne({ prix_unitaire: 88, configuration: [{ groupe: "taille", choix: "M" }] })],
      [{ id: COLLIER, nom: "Collier cuir", prix_vente: 30, disponible: true }]
    );
    expect(r.lignes[0].prix_actuel).toBe(88);
    expect(r.prixChanges).toEqual([]);
  });

  it("annonce l’ancien ET le nouveau prix, avant de laisser valider", () => {
    const r = recalculerPanier(
      [ligne()],
      [{ id: COLLIER, nom: "Collier cuir", prix_vente: 35, disponible: true }]
    );
    expect(messageRecalcul(r)).toBe(
      "« Collier cuir » est passé de 30.00 à 35.00 CHF."
    );
  });
});

describe("le retour après la connexion", () => {
  it("ramène le visiteur exactement là où il en était", () => {
    expect(adresseDeRetour("?suite=/catalogue/panier")).toBe("/catalogue/panier");
  });

  it("ne ramène nulle part quand rien n’est demandé", () => {
    expect(adresseDeRetour("")).toBeNull();
    expect(adresseDeRetour("?autre=1")).toBeNull();
  });

  it("refuse de renvoyer ailleurs que sur le site", () => {
    expect(adresseDeRetour("?suite=//exemple.test/piege")).toBeNull();
    expect(adresseDeRetour("?suite=https://exemple.test")).toBeNull();
    expect(adresseDeRetour("?suite=/\\exemple.test")).toBeNull();
  });
});

describe("ce qu’un visiteur reçoit", () => {
  it("ne demande AUCUNE colonne sensible à la base", () => {
    for (const colonne of COLONNES_INTERDITES_AU_PUBLIC) {
      expect(COLONNES_VITRINE).not.toContain(colonne);
    }
    // Le filtrage est dans la requête : les colonnes sont nommées une à une.
    expect(COLONNES_VITRINE).not.toContain("*");
  });

  it("dit la disponibilité en MOTS, jamais en chiffres", () => {
    expect(disponibiliteVitrine(true, "standard").libelle).toBe("En stock");
    expect(disponibiliteVitrine(false, "standard").libelle).toBe("Épuisé");
    expect(disponibiliteVitrine(false, "personnalisable").libelle).toBe("Sur commande");
    for (const etat of [true, false]) {
      expect(disponibiliteVitrine(etat, "standard").libelle).not.toMatch(/\d/);
    }
  });

  it("mentionne la remise membre sans jamais l’appliquer", () => {
    expect(mentionRemiseMembre(10)).toBe("Membres : −10 % sur la boutique");
    expect(mentionRemiseMembre(0)).toBeNull();
  });
});
