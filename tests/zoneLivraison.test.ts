import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  npaLivrable,
  paysDuNpa,
  refusConfirmation,
  REFUS_ZONE_LIVRAISON,
  MENTION_ZONE_LIVRAISON,
  formatAdresse,
  type ContexteRemise,
  type LignePanier,
} from "@/src/lib/venteEnLigneLogique";

/**
 * APP 51 — la boutique livre en Suisse et au Liechtenstein, et nulle part ailleurs.
 *
 * ── POURQUOI LE PAYS NE SE SAISIT PAS ─────────────────────────────────────
 *
 * La Poste traite le Liechtenstein comme la Suisse : mêmes NPA à quatre
 * chiffres, même tarif. Un champ « pays » ouvert aurait donc laissé entrer la
 * France — dont le colis serait parti au tarif suisse, avec des frais calculés
 * sur une grille qui ne le concerne pas. L'erreur ne se serait vue qu'au
 * guichet, le colis déjà emballé.
 *
 * Le pays se DÉDUIT du NPA, et c'est le serveur qui le pose.
 */

const LIGNE: LignePanier = {
  article_id: "a1", libelle: "Collier", quantite: 1, prix_unitaire: 30, taux_tva: 8.1,
  poids_grammes: 200, expediable: true, type_article: "stock",
};

const CONTEXTE: ContexteRemise = {
  lignes: [LIGNE],
  reservationAVenir: false,
  grillePort: [{ jusqu_a_grammes: 2000, prix: 9 }],
  poidsMaxGrammes: 30000,
};

// ── Les deux fonctions pures ───────────────────────────────────────────────

describe("quels NPA sont livrables", () => {
  it("un NPA suisse ordinaire", () => {
    expect(npaLivrable("1950")).toBe(true);
  });

  it("un NPA du Liechtenstein", () => {
    expect(npaLivrable("9490")).toBe(true);
  });

  it("les espaces ne comptent pas : « 1 950 » est « 1950 »", () => {
    // Deux façons de taper le même endroit. Un bon d'envoi ne doit pas dépendre
    // de celle qu'on a choisie.
    expect(npaLivrable("1 950")).toBe(true);
    expect(npaLivrable(" 1950 ")).toBe(true);
  });

  it("trop court, trop long, ou pas des chiffres : non", () => {
    expect(npaLivrable("950")).toBe(false);
    expect(npaLivrable("19500")).toBe(false);
    expect(npaLivrable("19a0")).toBe(false);
  });

  it("les bornes : 0999 et 9700 sont dehors, 1000 et 9699 dedans", () => {
    expect(npaLivrable("0999")).toBe(false);
    expect(npaLivrable("9700")).toBe(false);
    expect(npaLivrable("1000")).toBe(true);
    expect(npaLivrable("9699")).toBe(true);
  });

  it("rien du tout : non", () => {
    expect(npaLivrable("")).toBe(false);
    expect(npaLivrable(null)).toBe(false);
    expect(npaLivrable(undefined)).toBe(false);
  });
});

describe("quel pays pour quel NPA", () => {
  it("9490 est au Liechtenstein", () => {
    expect(paysDuNpa("9490")).toBe("Liechtenstein");
  });

  it("les bornes de la principauté : 9485 et 9498 dedans, 9484 et 9499 dehors", () => {
    expect(paysDuNpa("9485")).toBe("Liechtenstein");
    expect(paysDuNpa("9498")).toBe("Liechtenstein");
    expect(paysDuNpa("9484")).toBe("Suisse");
    expect(paysDuNpa("9499")).toBe("Suisse");
  });

  it("tout le reste est la Suisse", () => {
    expect(paysDuNpa("1950")).toBe("Suisse");
    expect(paysDuNpa("1 950")).toBe("Suisse");
  });
});

// ── Le refus, des deux côtés ───────────────────────────────────────────────

describe("un NPA hors zone empêche la confirmation", () => {
  const refus = (npa: string | null, adresseOk = true) =>
    refusConfirmation({
      lignes: [LIGNE], mode: "postal", contexte: CONTEXTE,
      modePaiement: "facture", adresseComplete: adresseOk, npa,
    });

  it("la phrase, mot pour mot", () => {
    expect(refus("75001")).toBe(
      "Nous livrons en Suisse et au Liechtenstein uniquement. Vérifiez le NPA (4 chiffres).",
    );
    expect(refus("75001")).toBe(REFUS_ZONE_LIVRAISON);
  });

  it("un NPA livrable passe", () => {
    expect(refus("1950")).toBeNull();
    expect(refus("9490")).toBeNull();
  });

  it("L'ADRESSE INCOMPLÈTE PARLE EN PREMIER", () => {
    /**
     * Dire « vérifiez le NPA » à qui n'a rien rempli serait pointer un champ au
     * hasard parmi quatre vides. On demande d'abord l'adresse, on discute du
     * NPA ensuite.
     */
    expect(refus(null, false)).toBe("Indiquez l'adresse de livraison.");
  });

  it("LE RETRAIT À LA PENSION N'A PAS D'ADRESSE, et reste accepté", () => {
    // La règle ne vaut que pour l'envoi postal : on ne demande pas un NPA à
    // quelqu'un qui vient chercher sa commande.
    expect(refusConfirmation({
      lignes: [LIGNE], mode: "retrait", contexte: CONTEXTE,
      modePaiement: "facture", adresseComplete: true, npa: null,
    })).toBeNull();
  });
});

// ── Ce que le serveur enregistre ───────────────────────────────────────────

const lire = (relatif: string) => readFileSync(join(process.cwd(), relatif), "utf8");

describe("le pays est POSÉ par le serveur, jamais reçu", () => {
  it("l'adresse envoyée à la base passe par le normaliseur", () => {
    /**
     * Une requête forgée peut annoncer « France » : elle sera enregistrée
     * « Suisse » ou « Liechtenstein », et rien d'autre. Le champ n'est même pas
     * proposé à l'écran — c'est bien pour cela qu'il ne doit pas être cru.
     */
    const src = lire("app/(public)/catalogue/actions.ts");
    expect(src).toMatch(/p_adresse: entree\.mode_remise === "postal" \? adresseLivrable\(entree\.adresse\) : null/);
    expect(src).toMatch(/pays: paysDuNpa\(npa\)/);
    // Le NPA perd ses espaces au passage.
    expect(src).toMatch(/const npa = String\(a\.npa \?\? ""\)\.replace\(\/\\s\/g, ""\)/);
  });

  it("et le serveur transmet le NPA à la règle", () => {
    // Sans cela, le refus ne serait qu'un grisé de navigateur.
    expect(lire("app/(public)/catalogue/actions.ts")).toMatch(/npa: entree\.adresse\?\.npa \?\? null/);
    expect(lire("app/(public)/catalogue/panier/Panier.tsx")).toMatch(/npa: adresse\.npa/);
  });

  it("le normaliseur rend bien le pays du NPA", () => {
    // La fonction du serveur n'est pas exportée ; on éprouve la règle qu'elle
    // applique, celle-là même qu'un « France » forgé ne peut pas contourner.
    expect(paysDuNpa("1950")).toBe("Suisse");
    expect(paysDuNpa("9490")).toBe("Liechtenstein");
  });
});

// ── L'écran, et ce qui ne bouge pas ────────────────────────────────────────

describe("le panier le dit avant qu'on tape", () => {
  it("la mention, mot pour mot", () => {
    expect(MENTION_ZONE_LIVRAISON).toBe(
      "Envoi par La Poste, en Suisse et au Liechtenstein uniquement.",
    );
  });

  it("elle est posée sous le titre, et le champ NPA est guidé", () => {
    const src = lire("app/(public)/catalogue/panier/Panier.tsx");
    expect(src).toContain("MENTION_ZONE_LIVRAISON");
    expect(src).toMatch(/inputMode: "numeric" as const, maxLength: 4/);
  });
});

describe("l'affichage des adresses ne change pas", () => {
  it("la Suisse reste implicite, le Liechtenstein s'écrit", () => {
    /**
     * `formatAdresse` n'a pas bougé : il tait « Suisse » et nomme le reste. Le
     * bon d'envoi d'un colis pour Vaduz portera donc « Liechtenstein » sans
     * qu'on ait rien touché.
     */
    const suisse = { nom: "A. Dupont", rue: "Rue du Lac 3", npa: "1950", localite: "Sion", pays: "Suisse" };
    expect(formatAdresse(suisse)).toBe("A. Dupont\nRue du Lac 3\n1950 Sion");

    const vaduz = { ...suisse, npa: "9490", localite: "Vaduz", pays: "Liechtenstein" };
    expect(formatAdresse(vaduz)).toBe("A. Dupont\nRue du Lac 3\n9490 Vaduz\nLiechtenstein");
  });

  it("une commande déjà en base s'affiche comme avant", () => {
    // Elles portent « Suisse » : rien ne les relit, rien ne les corrige.
    const ancienne = { nom: "B. Martin", rue: "Av. de la Gare 1", npa: "1000", localite: "Lausanne", pays: "Suisse" };
    expect(formatAdresse(ancienne)).not.toContain("Suisse");
  });
});
