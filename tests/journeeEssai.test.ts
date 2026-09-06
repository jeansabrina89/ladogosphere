import { describe, it, expect } from "vitest";
import {
  chienReservablePour,
  messageRefusChien,
  verifierSelectionChiens,
  statutEssaiDe,
  statutDepuisFlags,
  flagsHistoriques,
  etatClientChien,
  formatJourMois,
  estResultatEssai,
  STATUTS_ESSAI,
  RESULTATS_ESSAI,
  TELEPHONE_PENSION,
  type StatutEssai,
} from "../src/lib/journeeEssai";

const TYPES = ["essai", "journee", "sejour"] as const;

describe("chienReservablePour — les 5 statuts × 3 types", () => {
  // Tableau de vérité complet, lu comme la règle métier.
  const attendu: Record<StatutEssai, Record<(typeof TYPES)[number], boolean>> = {
    non_programme:   { essai: true,  journee: false, sejour: false },
    programme:       { essai: false, journee: false, sejour: false },
    seconde_journee: { essai: true,  journee: false, sejour: false },
    valide:          { essai: false, journee: true,  sejour: true },
    refuse:          { essai: false, journee: false, sejour: false },
  };

  for (const statut of STATUTS_ESSAI) {
    for (const type of TYPES) {
      const doitPasser = attendu[statut][type];
      it(`${statut} + ${type} → ${doitPasser ? "autorisé" : "refusé"}`, () => {
        const d = chienReservablePour(statut, type);
        expect(d.autorise).toBe(doitPasser);
        if (doitPasser) expect(d.raison).toBeNull();
        else expect(typeof d.raison).toBe("string");
      });
    }
  }

  it("couvre bien 15 combinaisons", () => {
    expect(STATUTS_ESSAI.length * TYPES.length).toBe(15);
  });
});

describe("chienReservablePour — raisons précises", () => {
  it("un chien refusé l'est pour tous les types", () => {
    for (const type of TYPES) {
      expect(chienReservablePour("refuse", type)).toEqual({ autorise: false, raison: "non_accepte" });
    }
  });
  it("un essai déjà réservé ne se réinscrit pas", () => {
    expect(chienReservablePour("programme", "essai").raison).toBe("essai_deja_reserve");
  });
  it("un chien validé ne refait pas d'essai", () => {
    expect(chienReservablePour("valide", "essai").raison).toBe("essai_deja_valide");
  });
  it("une seconde journée est réservable en essai, pas en garderie", () => {
    expect(chienReservablePour("seconde_journee", "essai").autorise).toBe(true);
    expect(chienReservablePour("seconde_journee", "journee").raison).toBe("seconde_journee_requise");
  });
  it("un essai en cours bloque la garderie", () => {
    expect(chienReservablePour("programme", "journee").raison).toBe("essai_en_cours");
  });
  it("un type inconnu suit la règle des prestations (chien validé requis)", () => {
    expect(chienReservablePour("valide", "atelier").autorise).toBe(true);
    expect(chienReservablePour("non_programme", "atelier").raison).toBe("essai_requis");
  });
});

describe("messageRefusChien", () => {
  it("nomme le chien pour l'essai requis", () => {
    expect(messageRefusChien("Belle", "essai_requis")).toBe("Belle doit d'abord faire sa journée d'essai.");
  });
  it("nomme le chien pour un refus, avec le téléphone", () => {
    const m = messageRefusChien("Belle", "non_accepte");
    expect(m).toContain("Nous ne pouvons pas accueillir Belle");
    expect(m).toContain(TELEPHONE_PENSION);
  });
  it("chaque raison produit un message contenant le nom", () => {
    const raisons = ["non_accepte", "seconde_journee_requise", "essai_en_cours",
      "essai_requis", "essai_deja_reserve", "essai_deja_valide", null];
    for (const r of raisons) expect(messageRefusChien("Pixel", r)).toContain("Pixel");
  });
});

describe("verifierSelectionChiens", () => {
  it("accepte une sélection entièrement validée", () => {
    const r = verifierSelectionChiens(
      [{ nom: "Pixel", statut_essai: "valide" }, { nom: "Hailey", statut_essai: "valide" }],
      "journee"
    );
    expect(r).toEqual({ ok: true });
  });
  it("refuse dès qu'un chien ne convient pas, en le nommant", () => {
    const r = verifierSelectionChiens(
      [{ nom: "Pixel", statut_essai: "valide" }, { nom: "Belle", statut_essai: "non_programme" }],
      "journee"
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("Belle");
  });
  it("un statut absent est traité comme non_programme", () => {
    const r = verifierSelectionChiens([{ nom: "Inconnu" }], "journee");
    expect(r.ok).toBe(false);
  });
  it("une sélection vide passe", () => {
    expect(verifierSelectionChiens([], "sejour")).toEqual({ ok: true });
  });
});

describe("statutEssaiDe", () => {
  it("lit un statut valide", () => {
    expect(statutEssaiDe({ statut_essai: "valide" })).toBe("valide");
  });
  it("retombe sur non_programme si absent, nul ou inconnu", () => {
    expect(statutEssaiDe(null)).toBe("non_programme");
    expect(statutEssaiDe({})).toBe("non_programme");
    expect(statutEssaiDe({ statut_essai: null })).toBe("non_programme");
    expect(statutEssaiDe({ statut_essai: "n_importe_quoi" })).toBe("non_programme");
  });
});

describe("reprise des données et colonnes historiques", () => {
  it("effectuée + invalide → refusé", () => {
    expect(statutDepuisFlags(true, true)).toBe("refuse");
  });
  it("effectuée seule → validé (les chiens déjà passés sont réputés validés)", () => {
    expect(statutDepuisFlags(true, false)).toBe("valide");
  });
  it("rien → non programmé", () => {
    expect(statutDepuisFlags(false, false)).toBe("non_programme");
    expect(statutDepuisFlags(null, null)).toBe("non_programme");
  });
  it("les flags dérivés reflètent le statut", () => {
    expect(flagsHistoriques("valide")).toEqual({ journee_essai_effectuee: true, journee_essai_invalide: false });
    expect(flagsHistoriques("refuse")).toEqual({ journee_essai_effectuee: true, journee_essai_invalide: true });
    expect(flagsHistoriques("seconde_journee")).toEqual({ journee_essai_effectuee: true, journee_essai_invalide: false });
    expect(flagsHistoriques("programme")).toEqual({ journee_essai_effectuee: false, journee_essai_invalide: false });
    expect(flagsHistoriques("non_programme")).toEqual({ journee_essai_effectuee: false, journee_essai_invalide: false });
  });
  it("aller-retour statut → flags → statut pour les cas historiques", () => {
    for (const s of ["valide", "refuse", "non_programme"] as StatutEssai[]) {
      const f = flagsHistoriques(s);
      expect(statutDepuisFlags(f.journee_essai_effectuee, f.journee_essai_invalide)).toBe(s);
    }
  });
});

describe("etatClientChien", () => {
  it("validé", () => {
    expect(etatClientChien("valide", "Pixel")).toEqual({ texte: "Validé", ton: "succes", reservable: true });
  });
  it("refusé : message nominatif, non réservable", () => {
    const e = etatClientChien("refuse", "Belle");
    expect(e.ton).toBe("refus");
    expect(e.reservable).toBe(false);
    expect(e.texte).toContain("Belle");
    expect(e.texte).toContain(TELEPHONE_PENSION);
  });
  it("programmé avec date", () => {
    expect(etatClientChien("programme", "Belle", "2026-09-07").texte).toBe("Journée d'essai le 07.09");
  });
  it("programmé sans date connue", () => {
    expect(etatClientChien("programme", "Belle").texte).toBe("Journée d'essai réservée");
  });
  it("seconde journée", () => {
    expect(etatClientChien("seconde_journee", "Belle").texte).toBe("Seconde journée d'essai à prévoir");
  });
  it("non programmé", () => {
    expect(etatClientChien("non_programme", "Belle").texte).toBe("Journée d'essai à réserver");
  });
});

describe("divers", () => {
  it("formatJourMois", () => {
    expect(formatJourMois("2026-09-07")).toBe("07.09");
    expect(formatJourMois("2026-12-31T10:00:00Z")).toBe("31.12");
  });
  it("estResultatEssai n'accepte que les trois résultats", () => {
    for (const r of RESULTATS_ESSAI) expect(estResultatEssai(r)).toBe(true);
    expect(estResultatEssai("programme")).toBe(false);
    expect(estResultatEssai("non_programme")).toBe(false);
    expect(estResultatEssai(undefined)).toBe(false);
    expect(estResultatEssai("")).toBe(false);
  });
});
