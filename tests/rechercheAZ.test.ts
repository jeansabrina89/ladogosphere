import { describe, it, expect } from "vitest";
import {
  compte,
  correspond,
  filtrer,
  hrefRetour,
  lettreDe,
  lettresAvecFiches,
  lireEtat,
  normaliser,
  versQuery,
  type EntreeRecherche,
} from "@/src/lib/rechercheAZ";

/**
 * APP 73 — la règle de la recherche A–Z de /chiens et /clients.
 * Le composant est rendu dans tests/rechercheAZEcran.test.tsx.
 */

const ELODIE: EntreeRecherche = {
  id: "c1", cleLettre: "Martin", textes: ["Martin", "Élodie", "elodie@exemple.ch", "Max"],
  telephones: ["079 123 45 67"],
};
const PAUL: EntreeRecherche = {
  id: "c2", cleLettre: "Zürcher", textes: ["Zürcher", "Paul", "paul@exemple.ch", "Rex"],
  telephones: ["+41 78 555 12 34"],
};
const SANS_TEL: EntreeRecherche = { id: "c3", cleLettre: "Abel", textes: ["Abel", "Anne", null, "Filou"] };

describe("accents et majuscules", () => {
  it("« elodie » trouve « Élodie », « ZURCHER » trouve « Zürcher »", () => {
    expect(normaliser("  Élodie  ")).toBe("elodie");
    expect(correspond(ELODIE, "elodie")).toBe(true);
    expect(correspond(ELODIE, "ÉLODIE")).toBe(true);
    expect(correspond(PAUL, "ZURCHER")).toBe(true);
  });

  it("chaque mot tapé doit se trouver quelque part", () => {
    expect(correspond(ELODIE, "elodie mar")).toBe(true);
    expect(correspond(ELODIE, "elodie zur")).toBe(false);
  });

  it("une recherche vide garde tout", () => {
    expect(correspond(SANS_TEL, "")).toBe(true);
    expect(correspond(SANS_TEL, "   ")).toBe(true);
  });
});

describe("téléphone, avec ou sans espaces", () => {
  it("« 079 123 » et « 079123 » trouvent la même fiche", () => {
    expect(correspond(ELODIE, "079 123")).toBe(true);
    expect(correspond(ELODIE, "079123")).toBe(true);
    expect(correspond(PAUL, "079123")).toBe(false);
  });

  it("l'indicatif et les espaces du numéro enregistré ne gênent pas", () => {
    expect(correspond(PAUL, "78 555 12")).toBe(true);
    expect(correspond(PAUL, "785551234")).toBe(true);
  });

  it("une fiche sans téléphone ne correspond pas à un numéro", () => {
    expect(correspond(SANS_TEL, "079")).toBe(false);
  });
});

describe("Clients : le nom d'un chien trouve son propriétaire", () => {
  it("taper « Max » trouve la propriétaire de Max", () => {
    expect(filtrer([ELODIE, PAUL, SANS_TEL], { lettre: null, q: "Max", filtre: null }).map((e) => e.id))
      .toEqual(["c1"]);
  });
});

describe("Chiens : le propriétaire trouve son chien", () => {
  const REX: EntreeRecherche = { id: "k1", cleLettre: "Rex", textes: ["Rex", "Berger", "Paul", "Zürcher"] };
  const MAX: EntreeRecherche = { id: "k2", cleLettre: "Max", textes: ["Max", "Labrador", "Élodie", "Martin"] };
  it("« zurcher » trouve Rex ; « labrador » trouve Max", () => {
    expect(filtrer([REX, MAX], { lettre: null, q: "zurcher", filtre: null }).map((e) => e.id)).toEqual(["k1"]);
    expect(filtrer([REX, MAX], { lettre: null, q: "labrador", filtre: null }).map((e) => e.id)).toEqual(["k2"]);
  });
});

describe("les lettres", () => {
  it("la lettre d'une fiche ignore l'accent ; un nom sans lettre n'en a pas", () => {
    expect(lettreDe("Élodie")).toBe("E");
    expect(lettreDe("zürcher")).toBe("Z");
    expect(lettreDe("123 SA")).toBeNull();
    expect(lettreDe(null)).toBeNull();
  });

  it("une lettre sans aucune fiche n'est pas dans l'ensemble actif", () => {
    const actives = lettresAvecFiches([ELODIE, PAUL, SANS_TEL]);
    expect([...actives].sort()).toEqual(["A", "M", "Z"]);
    expect(actives.has("B")).toBe(false);
  });

  it("lettre et recherche se combinent", () => {
    const tous = [ELODIE, PAUL, SANS_TEL];
    // « exemple » est dans deux fiches ; la lettre Z n'en garde qu'une.
    expect(filtrer(tous, { lettre: null, q: "exemple", filtre: null }).map((e) => e.id)).toEqual(["c1", "c2"]);
    expect(filtrer(tous, { lettre: "Z", q: "exemple", filtre: null }).map((e) => e.id)).toEqual(["c2"]);
    expect(filtrer(tous, { lettre: "A", q: "exemple", filtre: null })).toEqual([]);
  });

  it("un filtre (chiens à valider) se combine aussi", () => {
    const a = { ...SANS_TEL, drapeaux: ["attente"] };
    expect(filtrer([ELODIE, a], { lettre: null, q: "", filtre: "attente" }).map((e) => e.id)).toEqual(["c3"]);
  });
});

describe("l'adresse, et le retour depuis une fiche", () => {
  it("l'état s'écrit et se relit", () => {
    const etat = { lettre: "M", q: "max", filtre: null };
    expect(versQuery(etat)).toBe("lettre=M&q=max");
    expect(lireEtat(new URLSearchParams("lettre=m&q=max"))).toEqual(etat);
  });

  it("une lettre ou un filtre inconnus sont ignorés", () => {
    expect(lireEtat({ lettre: "ÉÉ", q: "x", filtre: "pirate" }, ["attente"]))
      .toEqual({ lettre: null, q: "x", filtre: null });
  });

  it("« ← Retour » ramène à la même lettre et à la même recherche", () => {
    expect(hrefRetour("/clients", "lettre=M&q=max")).toBe("/clients?lettre=M&q=max");
    expect(hrefRetour("/chiens", "filtre=attente", ["attente"])).toBe("/chiens?filtre=attente");
    expect(hrefRetour("/clients", undefined)).toBe("/clients");
  });

  it("le retour ne suit jamais une adresse glissée dans le lien", () => {
    expect(hrefRetour("/clients", "https://ailleurs.example/?lettre=M")).toBe("/clients");
    expect(hrefRetour("/clients", "lettre=M&redirect=https://ailleurs.example")).toBe("/clients?lettre=M");
  });
});

describe("le compte", () => {
  it("« 12 chiens », « 1 client », « 0 chien »", () => {
    expect(compte(12, "chien", "chiens")).toBe("12 chiens");
    expect(compte(1, "client", "clients")).toBe("1 client");
    expect(compte(0, "chien", "chiens")).toBe("0 chien");
  });
});
