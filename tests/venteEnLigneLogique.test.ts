import { describe, it, expect } from "vitest";
import {
  disponibilite,
  estCommandable,
  sousTotal,
  nombreArticles,
  remiseMembre,
  libelleRemiseMembre,
  poidsTotal,
  lignesSansPoids,
  lireGrillePort,
  fraisPort,
  formatPoids,
  optionsRemise,
  optionRemise,
  totalCommande,
  refusConfirmation,
  reserveLeStock,
  statutSortie,
  libelleModeRemise,
  libelleStatutLigne,
  adresseComplete,
  formatAdresse,
  MODES_PAIEMENT_LIGNE,
  type LignePanier,
  type PalierPort,
} from "@/src/lib/venteEnLigneLogique";

/** La grille par défaut posée en paramètre à la migration. */
const GRILLE: PalierPort[] = [
  { jusqu_a_grammes: 1000, prix: 9 },
  { jusqu_a_grammes: 2000, prix: 11 },
  { jusqu_a_grammes: 5000, prix: 14 },
  { jusqu_a_grammes: 10000, prix: 20 },
];

function ligne(p: Partial<LignePanier> & { libelle: string }): LignePanier {
  return {
    article_id: p.libelle.toLowerCase().replace(/\s/g, "-"),
    quantite: 1,
    prix_unitaire: 20,
    taux_tva: 8.1,
    poids_grammes: 300,
    expediable: true,
    type_article: "standard",
    ...p,
  };
}

const COLLIER = ligne({ libelle: "Collier bleu nuit", prix_unitaire: 45, poids_grammes: 120 });
const CROQUETTES = ligne({
  libelle: "Croquettes Robur 12 kg", prix_unitaire: 89,
  poids_grammes: 12000, expediable: false,
});

// ── Disponibilité ──────────────────────────────────────────────────────────

describe("disponibilité affichée au client", () => {
  it("ne donne jamais la quantité exacte au-delà de trois", () => {
    expect(disponibilite(47)).toEqual({ etat: "en_stock", libelle: "En stock" });
    expect(disponibilite(4)).toEqual({ etat: "en_stock", libelle: "En stock" });
  });

  it("presse utilement quand il en reste peu", () => {
    expect(disponibilite(3).libelle).toBe("Plus que 3");
    expect(disponibilite(2).libelle).toBe("Plus que 2");
    expect(disponibilite(1).libelle).toBe("Dernier exemplaire");
  });

  it("dit « Épuisé » à zéro et en dessous", () => {
    expect(disponibilite(0).etat).toBe("epuise");
    expect(disponibilite(-2).etat).toBe("epuise");
    expect(disponibilite(null).etat).toBe("epuise");
    expect(estCommandable(0)).toBe(false);
  });

  it("laisse commander un article personnalisable, qui n'a pas de stock", () => {
    expect(disponibilite(0, "personnalisable")).toEqual({
      etat: "en_stock", libelle: "Sur commande",
    });
    expect(estCommandable(0, "personnalisable")).toBe(true);
  });
});

// ── Remise membre ──────────────────────────────────────────────────────────

describe("remise membre", () => {
  const panier = [COLLIER, ligne({ libelle: "Jouet", prix_unitaire: 15 })];

  it("porte sur les articles, à 10 %", () => {
    expect(sousTotal(panier)).toBe(60);
    expect(remiseMembre(panier, true, 10)).toBe(6);
  });

  it("ne s'applique pas à un non-membre", () => {
    expect(remiseMembre(panier, false, 10)).toBe(0);
  });

  it("ne s'applique pas si le taux est nul ou absent", () => {
    expect(remiseMembre(panier, true, 0)).toBe(0);
    expect(remiseMembre(panier, true, null)).toBe(0);
  });

  it("s'affiche sur une ligne à elle, jamais fondue dans les prix", () => {
    const total = totalCommande({
      lignes: panier, estMembre: true, remisePourcent: 10, fraisPort: 9,
    });
    expect(total).toEqual({ sousTotal: 60, remise: 6, port: 9, aPayer: 63 });
    // Le prix unitaire du collier n'a pas bougé : la remise est une ligne.
    expect(Number(panier[0].prix_unitaire)).toBe(45);
    expect(libelleRemiseMembre(10)).toBe("Remise membre −10 %");
  });

  it("ne remise pas le port : la Poste ne connaît pas nos membres", () => {
    const avec = totalCommande({ lignes: panier, estMembre: true, remisePourcent: 10, fraisPort: 20 });
    const sans = totalCommande({ lignes: panier, estMembre: false, remisePourcent: 10, fraisPort: 20 });
    expect(avec.port).toBe(20);
    expect(sans.port).toBe(20);
    expect(sans.aPayer - avec.aPayer).toBe(6);
  });

  it("arrondit au centime", () => {
    const impair = [ligne({ libelle: "Article", prix_unitaire: 33.33 })];
    expect(remiseMembre(impair, true, 10)).toBe(3.33);
  });
});

// ── Frais de port par palier ───────────────────────────────────────────────

describe("frais de port par palier", () => {
  it("prend le premier palier qui contient le poids", () => {
    expect(fraisPort(500, GRILLE)).toBe(9);
    expect(fraisPort(1000, GRILLE)).toBe(9);
    expect(fraisPort(1001, GRILLE)).toBe(11);
    expect(fraisPort(2000, GRILLE)).toBe(11);
    expect(fraisPort(4999, GRILLE)).toBe(14);
    expect(fraisPort(10000, GRILLE)).toBe(20);
  });

  it("ne facture rien pour un panier sans poids", () => {
    expect(fraisPort(0, GRILLE)).toBe(9);
  });

  it("n'invente pas de tarif au-delà du dernier palier", () => {
    expect(fraisPort(10001, GRILLE)).toBeNull();
    expect(fraisPort(50000, GRILLE)).toBeNull();
  });

  it("ne facture rien sans grille : mieux vaut pas d'envoi qu'un prix inventé", () => {
    expect(fraisPort(500, [])).toBeNull();
  });

  it("lit la grille du paramètre, même mal rangée, et ignore l'illisible", () => {
    const lue = lireGrillePort('[{"jusqu_a_grammes":5000,"prix":14},{"jusqu_a_grammes":1000,"prix":9}]');
    expect(lue.map((p) => p.jusqu_a_grammes)).toEqual([1000, 5000]);
    expect(lireGrillePort("pas du json")).toEqual([]);
    expect(lireGrillePort(null)).toEqual([]);
    expect(lireGrillePort([{ jusqu_a_grammes: 0, prix: 5 }])).toEqual([]);
  });

  it("additionne le poids en tenant compte des quantités", () => {
    expect(poidsTotal([ligne({ libelle: "A", poids_grammes: 300, quantite: 3 })])).toBe(900);
    expect(nombreArticles([ligne({ libelle: "A", quantite: 3 })])).toBe(3);
  });

  it("écrit le poids comme on le dit", () => {
    expect(formatPoids(750)).toBe("750 g");
    expect(formatPoids(10000)).toBe("10 kg");
    expect(formatPoids(1500)).toBe("1.5 kg");
  });
});

// ── Modes de remise ────────────────────────────────────────────────────────

describe("modes de remise", () => {
  const contexte = (lignes: LignePanier[], reservationAVenir = false) => ({
    lignes, reservationAVenir, grillePort: GRILLE, poidsMaxGrammes: 10000,
  });

  it("affiche toujours les trois, jamais un mode escamoté", () => {
    const options = optionsRemise(contexte([COLLIER]));
    expect(options.map((o) => o.valeur)).toEqual(["retrait", "depart_chien", "postal"]);
  });

  it("laisse le retrait toujours possible, et gratuit", () => {
    const retrait = optionRemise(contexte([CROQUETTES]), "retrait");
    expect(retrait.disponible).toBe(true);
    expect(retrait.frais).toBe(0);
    expect(retrait.libelle).toBe("Retrait à la pension");
  });

  it("refuse l'envoi postal dès qu'un article n'est pas expédiable, en le nommant", () => {
    const postal = optionRemise(contexte([COLLIER, CROQUETTES]), "postal");
    expect(postal.disponible).toBe(false);
    expect(postal.raison).toContain("Croquettes Robur 12 kg");
    expect(postal.raison).toContain("trop lourd");
    expect(postal.frais).toBeNull();
    // Mais le retrait reste ouvert : on ne bloque pas la commande.
    expect(optionRemise(contexte([COLLIER, CROQUETTES]), "retrait").disponible).toBe(true);
  });

  it("compte les articles non expédiables quand il y en a plusieurs", () => {
    const litiere = ligne({ libelle: "Litière 10 kg", expediable: false, poids_grammes: 10000 });
    const postal = optionRemise(contexte([CROQUETTES, litiere]), "postal");
    expect(postal.raison).toContain("2 articles");
  });

  it("refuse l'envoi au-delà du poids maximal, en disant la limite", () => {
    // Trois articles expédiables de 4 kg : 12 kg, tout est expédiable mais c'est trop.
    const lourd = ligne({ libelle: "Couchage", poids_grammes: 4000, quantite: 3 });
    const postal = optionRemise(contexte([lourd]), "postal");
    expect(postal.disponible).toBe(false);
    expect(postal.raison).toContain("dépasse 10 kg");
  });

  it("refuse l'envoi quand un poids manque, plutôt que de chiffrer à l'aveugle", () => {
    const inconnu = ligne({ libelle: "Article sans poids", poids_grammes: null });
    const postal = optionRemise(contexte([inconnu]), "postal");
    expect(postal.disponible).toBe(false);
    expect(postal.raison).toContain("poids");
    expect(lignesSansPoids([inconnu])).toHaveLength(1);
  });

  it("chiffre le port AVANT la validation quand l'envoi est possible", () => {
    const postal = optionRemise(contexte([COLLIER]), "postal");
    expect(postal.disponible).toBe(true);
    expect(postal.frais).toBe(9);
  });

  it("ne propose le départ du chien qu'avec un séjour prévu, et dit pourquoi sinon", () => {
    const sans = optionRemise(contexte([COLLIER], false), "depart_chien");
    expect(sans.disponible).toBe(false);
    expect(sans.raison).toContain("pas de séjour prévu");

    const avec = optionRemise(contexte([COLLIER], true), "depart_chien");
    expect(avec.disponible).toBe(true);
    expect(avec.frais).toBe(0);
    expect(avec.libelle).toBe("Remise au départ de votre chien");
  });

  it("ferme tout sur un panier vide, sans se taire", () => {
    for (const o of optionsRemise(contexte([]))) {
      expect(o.disponible).toBe(false);
      expect(o.raison).toBe("Votre panier est vide.");
    }
  });
});

// ── Refus de confirmation ──────────────────────────────────────────────────

describe("refus de confirmation", () => {
  const contexte = (lignes: LignePanier[], reservationAVenir = true) => ({
    lignes, reservationAVenir, grillePort: GRILLE, poidsMaxGrammes: 10000,
  });

  it("laisse passer une commande complète", () => {
    expect(refusConfirmation({
      lignes: [COLLIER], mode: "retrait", contexte: contexte([COLLIER]),
      modePaiement: "sur_place",
    })).toBeNull();
  });

  it("réclame le mode de remise, puis le paiement, dans cet ordre", () => {
    expect(refusConfirmation({
      lignes: [COLLIER], mode: null, contexte: contexte([COLLIER]), modePaiement: null,
    })).toContain("comment vous voulez recevoir");
    expect(refusConfirmation({
      lignes: [COLLIER], mode: "retrait", contexte: contexte([COLLIER]), modePaiement: null,
    })).toContain("comment vous voulez payer");
  });

  it("refuse un mode de remise impossible, avec sa raison", () => {
    const c = contexte([CROQUETTES]);
    expect(refusConfirmation({
      lignes: [CROQUETTES], mode: "postal", contexte: c, modePaiement: "sur_place",
    })).toContain("Croquettes");
  });

  it("réclame l'adresse pour un envoi postal", () => {
    expect(refusConfirmation({
      lignes: [COLLIER], mode: "postal", contexte: contexte([COLLIER]),
      modePaiement: "sur_place", adresseComplete: false,
    })).toContain("adresse");
  });

  it("nomme l'article que quelqu'un a acheté au comptoir entre-temps", () => {
    const rare = ligne({ libelle: "Collier bleu nuit", quantite: 2, stock_disponible: 0 });
    const message = refusConfirmation({
      lignes: [rare], mode: "retrait", contexte: contexte([rare]), modePaiement: "sur_place",
    });
    expect(message).toContain("Collier bleu nuit");
    expect(message).toContain("Retirez-le du panier");
  });

  it("ne s'inquiète pas du stock d'un article personnalisable", () => {
    const surMesure = ligne({
      libelle: "Collier sur mesure", type_article: "personnalisable", stock_disponible: 0,
    });
    expect(refusConfirmation({
      lignes: [surMesure], mode: "retrait", contexte: contexte([surMesure]),
      modePaiement: "sur_place",
    })).toBeNull();
  });
});

// ── Réservation de stock et statuts ────────────────────────────────────────

describe("réservation de stock", () => {
  it("retient le stock dès la confirmation, pas à la remise", () => {
    expect(reserveLeStock("panier")).toBe(false);
    expect(reserveLeStock("confirmee")).toBe(true);
    expect(reserveLeStock("en_preparation")).toBe(true);
    expect(reserveLeStock("prete")).toBe(true);
  });

  it("le libère à la sortie comme à l'annulation", () => {
    expect(reserveLeStock("remise")).toBe(false);
    expect(reserveLeStock("expediee")).toBe(false);
    expect(reserveLeStock("annulee")).toBe(false);
  });

  it("sort par le statut qui correspond au mode de remise", () => {
    expect(statutSortie("retrait")).toBe("remise");
    expect(statutSortie("depart_chien")).toBe("remise");
    expect(statutSortie("postal")).toBe("expediee");
  });

  it("nomme les modes et les statuts dans le vocabulaire de la maison", () => {
    expect(libelleModeRemise("retrait")).toBe("Retrait à la pension");
    expect(libelleModeRemise("depart_chien")).toBe("Remise au départ de votre chien");
    expect(libelleModeRemise("postal")).toBe("Envoi postal");
    expect(libelleStatutLigne("confirmee")).toBe("À préparer");
    expect(libelleStatutLigne("confirmee", true)).toBe("Commande reçue");
  });
});

describe("moyens de paiement", () => {
  it("en propose deux au démarrage, le troisième annoncé mais inactif", () => {
    const actifs = MODES_PAIEMENT_LIGNE.filter((m) => m.actif).map((m) => m.valeur);
    expect(actifs).toEqual(["sur_place", "facture"]);
    expect(MODES_PAIEMENT_LIGNE.find((m) => m.valeur === "en_ligne")?.actif).toBe(false);
  });
});

describe("adresse de livraison", () => {
  it("exige le nom, la rue, le NPA et la localité", () => {
    expect(adresseComplete({ nom: "A", rue: "B", npa: "1950", localite: "Sion" })).toBe(true);
    expect(adresseComplete({ nom: "A", rue: "B", npa: "", localite: "Sion" })).toBe(false);
    expect(adresseComplete(null)).toBe(false);
  });

  it("s'écrit comme sur une enveloppe", () => {
    expect(formatAdresse({ nom: "Sabrina Jean", rue: "Rue du Test 1", npa: "1950", localite: "Sion" }))
      .toBe("Sabrina Jean\nRue du Test 1\n1950 Sion");
    expect(formatAdresse(null)).toBe("—");
  });
});
