import { describe, it, expect } from "vitest";
import {
  GARDE_FOU_TAUX_LEGAUX,
  GARDE_FOU_TAUX_TDFN,
  MOTIF_ZERO_OBLIGATOIRE,
  PRESTATIONS_TVA,
  TAUX_LEGAUX,
  TDFN_MAXIMUM,
  TDFN_MINIMUM,
  codePrestationValide,
  libellePrestation,
  motifTvaPropre,
  piedTva,
  prestationDuCompte,
  refusTauxLegal,
  refusTauxTdfn,
  tauxDansLaListe,
  ventilerPanier,
} from "@/src/lib/tvaLogique";
import { validerChampsArticle } from "@/src/lib/boutiqueLogique";

/**
 * Aucun taux de dette fiscale nette réel n'apparaît ici : ces taux sont
 * attribués entreprise par entreprise par l'AFC. La fixture porte un nom qui
 * dit ce qu'elle est, pour qu'on ne la prenne jamais pour la vraie valeur.
 */
const TAUX_TDFN_FICTIF = 5.9;

/** Les taux en vigueur aujourd'hui, tels que la table les donne. */
const EN_VIGUEUR = [8.1, 2.6, 0];
/** Ceux d'avant 2024 : lisibles sur une pièce ancienne, plus ressaisissables. */
const ANCIENS = [7.7, 2.5, 0];

describe("la liste fermée des taux légaux", () => {
  it("accepte les trois taux en vigueur, et eux seuls", () => {
    for (const t of EN_VIGUEUR) {
      expect(refusTauxLegal(t, { autorises: EN_VIGUEUR, motif: "art. 21 LTVA" })).toBeNull();
    }
  });

  it("refuse un taux inventé, et dit lesquels sont possibles", () => {
    const refus = refusTauxLegal(5.3, { autorises: EN_VIGUEUR });
    expect(refus).toContain("Choisissez un taux dans la liste");
    expect(refus).toContain("8,1 %");
    expect(refus).toContain("2,6 %");
    expect(refus).toContain("Aucune autre valeur n'est acceptée.");
  });

  it("refuse tout ce qui n’est pas dans la liste, quel qu’il soit", () => {
    for (const brut of [5.3, 7.7, 2.5, 20, -1, 100, "8,15", "huit", "", null, undefined, {}]) {
      expect(refusTauxLegal(brut, { autorises: EN_VIGUEUR })).not.toBeNull();
    }
  });

  it("suit la date de validité : 7,7 % se lit, mais ne se saisit plus", () => {
    expect(refusTauxLegal(7.7, { autorises: ANCIENS })).toBeNull();
    expect(refusTauxLegal(7.7, { autorises: EN_VIGUEUR })).not.toBeNull();
    expect(refusTauxLegal(8.1, { autorises: ANCIENS })).not.toBeNull();
  });

  it("lit la virgule suisse comme un point", () => {
    expect(tauxDansLaListe("8,1", EN_VIGUEUR)).toBe(8.1);
    expect(tauxDansLaListe("2.6", EN_VIGUEUR)).toBe(2.6);
    expect(tauxDansLaListe("5,3", EN_VIGUEUR)).toBeNull();
  });
});

describe("le motif du 0 %", () => {
  it("est obligatoire, et le dit avec un exemple", () => {
    const refus = refusTauxLegal(0, { autorises: EN_VIGUEUR });
    expect(refus).toBe(MOTIF_ZERO_OBLIGATOIRE);
    expect(refus).toContain("art. 21 LTVA");
  });

  it("n’est pas demandé sur un taux positif", () => {
    expect(refusTauxLegal(8.1, { autorises: EN_VIGUEUR, motif: null })).toBeNull();
  });

  it("ne se contente pas d’espaces", () => {
    expect(refusTauxLegal(0, { autorises: EN_VIGUEUR, motif: "   " })).toBe(MOTIF_ZERO_OBLIGATOIRE);
  });

  it("se nettoie sans se dénaturer, et ne vaut qu’à 0 %", () => {
    expect(motifTvaPropre("  TVA non   applicable (art. 21 LTVA) ", 0))
      .toBe("TVA non applicable (art. 21 LTVA)");
    expect(motifTvaPropre("un motif", 8.1)).toBeNull();
    expect(motifTvaPropre("", 0)).toBeNull();
  });

  it("part tel quel en pied de pièce, sans doublon", () => {
    const pied = piedTva(
      { assujettie: true, numero: "CHE-123.456.789 TVA", dateAssujettissement: "2024-01-01" },
      ventilerPanier({ lignes: [{ montant: 50, taux_tva: 0 }, { montant: 50, taux_tva: 0 }] }),
      "2026-09-08",
      ["TVA non applicable (art. 21 LTVA)", "TVA non applicable (art. 21 LTVA)", null, "  "]
    )!;
    expect(pied.motifs).toEqual(["TVA non applicable (art. 21 LTVA)"]);
  });
});

describe("la fiche article refuse elle aussi un taux hors liste", () => {
  const complet = {
    nom: "Collier",
    categorie: "colliers",
    taux_tva: 8.1,
    taux_autorises: EN_VIGUEUR,
    prix_vente: 43,
    prix_achat: 20,
    stock_alerte: 2,
  };

  it("laisse passer un taux de la liste", () => {
    expect(validerChampsArticle(complet)).toBeNull();
  });

  it("refuse 5,3 % — l’ancien champ libre l’acceptait", () => {
    expect(validerChampsArticle({ ...complet, taux_tva: 5.3 }))
      .toMatchObject({ champ: "taux_tva" });
  });

  it("refuse 0 % sans motif, l’accepte avec", () => {
    expect(validerChampsArticle({ ...complet, taux_tva: 0 })).toMatchObject({ champ: "taux_tva" });
    expect(validerChampsArticle({ ...complet, taux_tva: 0, motif_tva: "art. 21 LTVA" })).toBeNull();
  });

  it("retombe sur les taux du code quand la liste n’est pas fournie", () => {
    expect(validerChampsArticle({ ...complet, taux_autorises: undefined })).toBeNull();
    expect(validerChampsArticle({ ...complet, taux_autorises: undefined, taux_tva: 5.3 }))
      .toMatchObject({ champ: "taux_tva" });
    expect([...TAUX_LEGAUX]).toEqual([8.1, 2.6, 0]);
  });
});

describe("le garde-fou du taux de dette fiscale nette", () => {
  it("refuse un taux légal, et dit lequel", () => {
    expect(refusTauxTdfn(8.1, { legauxEnVigueur: EN_VIGUEUR })).toBe(
      "8,1 % est un taux légal, pas un taux de dette fiscale nette. " +
      "Recopie le taux de ta décision de l'AFC."
    );
    expect(refusTauxTdfn("2,6", { legauxEnVigueur: EN_VIGUEUR })).toContain(
      "2,6 % est un taux légal, pas un taux de dette fiscale nette."
    );
  });

  it("refuse ce qui sort de la plage de l’AFC", () => {
    for (const t of [0.05, 6.8, 9.9, 12, -1]) {
      expect(refusTauxTdfn(t, { legauxEnVigueur: EN_VIGUEUR })).toContain("entre 0,1 % et 6,7 %");
    }
  });

  it("accepte la plage 0,1–6,7", () => {
    for (const t of [TDFN_MINIMUM, 1.2, TAUX_TDFN_FICTIF, TDFN_MAXIMUM]) {
      expect(refusTauxTdfn(t, { legauxEnVigueur: EN_VIGUEUR })).toBeNull();
    }
  });

  it("laisse le champ vide tranquille : ce n’est pas une erreur", () => {
    expect(refusTauxTdfn("", { legauxEnVigueur: EN_VIGUEUR })).toBeNull();
    expect(refusTauxTdfn(null, { legauxEnVigueur: EN_VIGUEUR })).toBeNull();
  });

  it("ne propose AUCUN taux en exemple", () => {
    const messages = [
      refusTauxTdfn(8.1, { legauxEnVigueur: EN_VIGUEUR }),
      refusTauxTdfn(9.9, { legauxEnVigueur: EN_VIGUEUR }),
    ].join(" ");
    // Seules les bornes et le taux refusé apparaissent — jamais « essayez 5,9 % ».
    expect(messages).not.toMatch(/par exemple|essayez|comme .*\d,\d/i);
  });

  it("refuse aussi 0 % : un forfait à zéro n’existe pas", () => {
    expect(refusTauxTdfn(0, { legauxEnVigueur: EN_VIGUEUR })).toContain("entre 0,1 % et 6,7 %");
  });
});

describe("les deux phrases du garde-fou", () => {
  it("disent exactement ce qu’il faut, à l’endroit où l’on se trompe", () => {
    expect(GARDE_FOU_TAUX_LEGAUX).toBe(
      "Le taux de la dette fiscale nette (secteur 1 ou 2) ne se met jamais sur une facture. " +
      "Il sert uniquement au décompte, plus bas dans cet écran."
    );
    expect(GARDE_FOU_TAUX_TDFN).toBe("Ce taux ne figure sur aucune facture.");
  });
});

describe("les prestations réglables", () => {
  it("couvre les six lignes attendues du côté pension", () => {
    expect(PRESTATIONS_TVA.map((p) => p.libelle)).toEqual([
      "Adhésion",
      "Abonnement",
      "Séjour et garderie",
      "Journée d'essai",
      "Prestations annexes",
      "Frais d'annulation et suppléments",
    ]);
  });

  it("nomme chaque code, et refuse ce qui n’en est pas un", () => {
    expect(codePrestationValide("adhesion")).toBe("adhesion");
    expect(codePrestationValide("cotisation")).toBeNull();
    expect(libellePrestation("essai")).toBe("Journée d'essai");
  });

  it("laisse la boutique à ses articles : ce n’est pas une prestation", () => {
    expect(prestationDuCompte("3200")).toBeNull();
    expect(prestationDuCompte("3800")).toBeNull();
    expect(prestationDuCompte("3005")).toBe("adhesion");
    expect(prestationDuCompte("3010")).toBe("frais_annulation");
    expect(prestationDuCompte("3020")).toBe("prestation_annexe");
  });

  it("distingue le séjour de la journée d’essai, qui partagent leur compte", () => {
    const sejour = PRESTATIONS_TVA.find((p) => p.code === "sejour")!;
    const essai = PRESTATIONS_TVA.find((p) => p.code === "essai")!;
    expect(sejour.comptes).toEqual(essai.comptes);
    // Le compte ne suffit donc pas : c'est le CODE qui porte le taux.
    expect(sejour.code).not.toBe(essai.code);
  });
});

describe("un changement de taux ne touche aucune pièce émise", () => {
  /**
   * Une pièce émise porte son taux sur SES lignes. Le pied se calcule à partir
   * d'elles, jamais du réglage du jour : changer le taux de l'adhésion demain
   * ne peut pas déplacer la TVA d'une facture d'hier.
   */
  const params = { assujettie: true, numero: "CHE-123.456.789 TVA", dateAssujettissement: "2024-01-01" };
  const lignesEmises = [{ montant: 50, taux_tva: 8.1 }];

  it("relit la pièce à SON taux, quoi qu’on règle ensuite", () => {
    const avant = piedTva(params, ventilerPanier({ lignes: lignesEmises }), "2026-01-15")!;
    expect(avant.lignes[0].etiquette).toBe("TVA 8,1 %");
    expect(avant.lignes[0].tva).toBe(3.75);

    // Le réglage passe à 0 % : les lignes DE LA PIÈCE, elles, n'ont pas bougé.
    const apres = piedTva(params, ventilerPanier({ lignes: lignesEmises }), "2026-01-15")!;
    expect(apres).toEqual(avant);
  });

  it("une pièce nouvelle, elle, prend le nouveau taux", () => {
    const nouvelle = piedTva(
      params,
      ventilerPanier({ lignes: [{ montant: 50, taux_tva: 0 }] }),
      "2026-09-08",
      ["TVA non applicable (art. 21 LTVA)"]
    )!;
    expect(nouvelle.lignes).toHaveLength(0);
    expect(nouvelle.motifs).toEqual(["TVA non applicable (art. 21 LTVA)"]);
    expect(nouvelle.totalTtc).toBe(50);
  });
});
