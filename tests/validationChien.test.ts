import { describe, it, expect } from "vitest";
import {
  validerChampsChien,
  categorieDepuisPoids,
  messageErreurBase,
  MESSAGE_ENREGISTREMENT_REFUSE,
  POIDS_MIN,
  POIDS_MAX,
} from "@/src/lib/validationChien";
import {
  valeurChamp,
  caseCochee,
  valeursFormulaire,
} from "@/src/lib/etatFormulaire";

const complet = {
  nom: "Rex",
  race: "Berger",
  couleur: "Noir",
  poids: 24,
  sexe: "M",
  sterilisation: "oui",
  numero_puce: "123456789012345",
};

describe("validerChampsChien — le refus nomme le champ fautif", () => {
  it("accepte une saisie complète", () => {
    expect(validerChampsChien(complet)).toBeNull();
  });

  it("désigne le champ vide, dans l'ordre du formulaire", () => {
    expect(validerChampsChien({ ...complet, nom: "" })).toMatchObject({ champ: "nom" });
    expect(validerChampsChien({ ...complet, race: "  " })).toMatchObject({ champ: "race" });
    expect(validerChampsChien({ ...complet, couleur: null })).toMatchObject({ champ: "couleur" });
  });

  it("désigne le sexe, avec un message en français", () => {
    const refus = validerChampsChien({ ...complet, sexe: "male" });
    expect(refus).toEqual({
      champ: "sexe",
      message: "Le sexe doit être « Mâle » ou « Femelle ».",
    });
  });

  it("désigne le poids hors bornes", () => {
    expect(validerChampsChien({ ...complet, poids: POIDS_MAX + 1 })).toMatchObject({
      champ: "poids",
      message: `Le poids doit être compris entre ${POIDS_MIN} et ${POIDS_MAX} kg.`,
    });
    expect(validerChampsChien({ ...complet, poids: 0.1 })).toMatchObject({ champ: "poids" });
  });

  it("désigne le poids manquant ou non numérique", () => {
    expect(validerChampsChien({ ...complet, poids: null })).toMatchObject({ champ: "poids" });
    expect(validerChampsChien({ ...complet, poids: Number("abc") })).toMatchObject({ champ: "poids" });
  });

  it("désigne la stérilisation hors liste", () => {
    expect(
      validerChampsChien({ ...complet, sterilisation: "peut-être" })
    ).toMatchObject({ champ: "sterilisation" });
  });

  it("n'exige la puce que côté pension", () => {
    expect(validerChampsChien({ ...complet, numero_puce: "" })).toBeNull();
    expect(
      validerChampsChien({ ...complet, numero_puce: "" }, { puceObligatoire: true })
    ).toMatchObject({ champ: "numero_puce" });
  });

  it("n'exige la stérilisation que là où elle est demandée", () => {
    expect(validerChampsChien({ ...complet, sterilisation: "" })).toBeNull();
    expect(
      validerChampsChien({ ...complet, sterilisation: "" }, { sterilisationObligatoire: true })
    ).toMatchObject({ champ: "sterilisation" });
  });

  it("aucun message ne cite une contrainte SQL", () => {
    const refus = [
      validerChampsChien({ ...complet, sexe: "X" }),
      validerChampsChien({ ...complet, sterilisation: "X" }),
      validerChampsChien({ ...complet, poids: 500 }),
      validerChampsChien({ ...complet, nom: "" }),
    ];
    for (const r of refus) {
      expect(r?.message).not.toMatch(/violates|constraint|relation|chiens_/);
    }
  });
});

describe("categorieDepuisPoids", () => {
  it("suit les trois tranches", () => {
    expect(categorieDepuisPoids(14.9)).toBe("moins_15kg");
    expect(categorieDepuisPoids(15)).toBe("15_30kg");
    expect(categorieDepuisPoids(30)).toBe("15_30kg");
    expect(categorieDepuisPoids(30.1)).toBe("30_40kg");
  });
});

describe("messageErreurBase — jamais de texte Postgres", () => {
  it("traduit une contrainte connue", () => {
    expect(
      messageErreurBase({
        message: 'new row for relation "chiens" violates check constraint "chiens_sexe_check"',
        code: "23514",
      })
    ).toBe("Le sexe doit être « Mâle » ou « Femelle ».");
  });

  it("retombe sur un message générique pour une erreur inconnue", () => {
    const m = messageErreurBase({ message: 'duplicate key value violates unique constraint "x"' });
    expect(m).toBe(MESSAGE_ENREGISTREMENT_REFUSE);
    expect(m).not.toMatch(/violates|constraint/);
  });

  it("nomme le doublon", () => {
    expect(messageErreurBase({ message: "…", code: "23505" })).toBe("Cette valeur existe déjà.");
  });

  it("ne renvoie jamais null ni vide", () => {
    expect(messageErreurBase(null)).toBe(MESSAGE_ENREGISTREMENT_REFUSE);
    expect(messageErreurBase(undefined)).toBe(MESSAGE_ENREGISTREMENT_REFUSE);
  });
});

describe("état de formulaire — la saisie n'est jamais perdue", () => {
  it("copie les champs texte du FormData", () => {
    const f = new FormData();
    f.set("nom", "Rex");
    f.set("poids", "24");
    f.set("membre", "on");
    expect(valeursFormulaire(f)).toEqual({ nom: "Rex", poids: "24", membre: "on" });
  });

  it("la saisie refusée prime sur la valeur existante", () => {
    const v = { nom: "Rex refusé" };
    expect(valeurChamp(v, "nom", "Ancien nom")).toBe("Rex refusé");
    expect(valeurChamp(undefined, "nom", "Ancien nom")).toBe("Ancien nom");
    expect(valeurChamp(null, "nom", null)).toBe("");
  });

  it("garde une chaîne vide saisie plutôt que la valeur d'origine", () => {
    expect(valeurChamp({ couleur: "" }, "couleur", "Noir")).toBe("");
  });

  it("les cases à cocher retrouvent leur état, coché comme décoché", () => {
    // Après un refus, une case absente du FormData était décochée.
    expect(caseCochee({ membre: "on" }, "membre", false)).toBe(true);
    expect(caseCochee({ nom: "Rex" }, "membre", true)).toBe(false);
    // Sans refus, c'est la valeur de la fiche qui s'applique.
    expect(caseCochee(undefined, "membre", true)).toBe(true);
    expect(caseCochee(null, "membre", false)).toBe(false);
  });
});
