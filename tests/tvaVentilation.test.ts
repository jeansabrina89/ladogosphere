import { describe, it, expect } from "vitest";
import {
  TAUX_NORMAL,
  TAUX_REDUIT,
  extraireTVA,
  etiquetteLigneTva,
  numeroTvaValide,
  normaliserNumeroTva,
  piedTva,
  secteurParDefautCompte,
  tauxApplicable,
  tauxParDefautCategorie,
  tauxParDefautCompte,
  tauxValide,
  ventilerPanier,
  type LigneVentilable,
} from "@/src/lib/tvaLogique";

/**
 * La ventilation d'un panier : le port et la remise au prorata, et la somme
 * qui retombe TOUJOURS sur le total. C'est une assertion, pas une intention.
 */

const croquettes = (montant: number): LigneVentilable => ({ montant, taux_tva: TAUX_REDUIT });
const collier = (montant: number): LigneVentilable => ({ montant, taux_tva: TAUX_NORMAL });

const somme = (v: number[]) => Math.round(v.reduce((s, x) => s + x, 0) * 100) / 100;

describe("les taux légaux", () => {
  it("n’accepte que les trois taux en vigueur", () => {
    expect(tauxValide("8.1")).toBe(8.1);
    expect(tauxValide(2.6)).toBe(2.6);
    expect(tauxValide(0)).toBe(0);
    // 7,7 % a existé, mais il ne se saisit plus : la pièce ancienne le garde,
    // une pièce nouvelle ne le reprend pas.
    expect(tauxValide(7.7)).toBeNull();
    expect(tauxValide("n’importe quoi")).toBeNull();
  });

  it("écrit les taux à la suisse, avec une virgule", () => {
    expect(etiquetteLigneTva(8.1)).toBe("TVA 8,1 %");
    expect(etiquetteLigneTva(2.6)).toBe("TVA 2,6 %");
  });
});

describe("l’attribution par défaut", () => {
  it("met au taux réduit ce qui se mange", () => {
    for (const c of ["alimentation_seche", "alimentation_humide", "friandises", "mastication", "litiere"]) {
      expect(tauxParDefautCategorie(c)).toBe(TAUX_REDUIT);
    }
  });

  it("met au taux normal tout le reste de la boutique", () => {
    for (const c of ["colliers", "laisses", "harnais", "muselieres", "jouets", "peluches", "couchages", "soins", "medaillons_accessoires", "divers"]) {
      expect(tauxParDefautCategorie(c)).toBe(TAUX_NORMAL);
    }
  });

  it("met la pension, la garderie et les prestations au taux normal", () => {
    for (const compte of ["3000", "3001", "3010", "3020", "3200"]) {
      expect(tauxParDefautCompte(compte)).toBe(TAUX_NORMAL);
    }
  });

  it("facture l’adhésion à 8,1 % par défaut, sans trancher la question", () => {
    // 0 % serait un choix juridique que le logiciel n’a pas à faire seul :
    // l’écran pose la question, le défaut reste prudent.
    expect(tauxParDefautCompte("3005")).toBe(TAUX_NORMAL);
  });

  it("rattache la boutique au commerce et le reste à la pension", () => {
    expect(secteurParDefautCompte("3200")).toBe("commerce");
    expect(secteurParDefautCompte("3000")).toBe("pension");
    expect(secteurParDefautCompte("3005")).toBe("pension");
  });
});

describe("extraire la TVA d’un prix TTC", () => {
  it("garde ht + tva = ttc, au centime", () => {
    for (const montant of [0.05, 12.35, 99.9, 1234.55, 7.77]) {
      for (const taux of [TAUX_NORMAL, TAUX_REDUIT]) {
        const v = extraireTVA(montant, taux);
        expect(Math.round((v.ht + v.tva) * 100) / 100).toBe(Math.round(montant * 100) / 100);
      }
    }
  });

  it("ne retire rien d’un montant à 0 %", () => {
    expect(extraireTVA(50, 0)).toEqual({ ttc: 50, ht: 50, tva: 0 });
  });
});

describe("le panier mixte, avec port et remise", () => {
  // Croquettes 2,6 % + collier 8,1 %, port 9,00, remise membre 10 %.
  const lignes = [croquettes(29.5), collier(43)];
  const port = 9;
  const remise = 7.25; // 10 % de 72,50

  const v = ventilerPanier({ lignes, port, remise });

  it("ventile sur les deux taux, du plus élevé au plus bas", () => {
    expect(v.parts.map((p) => p.taux)).toEqual([TAUX_NORMAL, TAUX_REDUIT]);
  });

  it("laisse la somme des ventilations ÉGALE au total du panier", () => {
    const total = Math.round((29.5 + 43 + port - remise) * 100) / 100;
    expect(v.totalTtc).toBe(total);
    expect(somme(v.parts.map((p) => p.ttc))).toBe(total);
  });

  it("répartit tout le port et toute la remise, sans en perdre un centime", () => {
    expect(somme(v.parts.map((p) => p.port))).toBe(port);
    expect(somme(v.parts.map((p) => p.remise))).toBe(remise);
  });

  it("ne laisse JAMAIS le port à 0 % — c’était le défaut d’avant", () => {
    for (const p of v.parts) {
      if (p.port > 0) expect(p.taux).toBeGreaterThan(0);
    }
    expect(v.parts.find((p) => p.taux === TAUX_NORMAL)!.port).toBeGreaterThan(0);
    expect(v.parts.find((p) => p.taux === TAUX_REDUIT)!.port).toBeGreaterThan(0);
  });

  it("garde ht + tva = ttc sur chaque taux", () => {
    for (const p of v.parts) {
      expect(Math.round((p.ht + p.tva) * 100) / 100).toBe(p.ttc);
    }
    expect(somme(v.parts.map((p) => p.ht))).toBe(v.totalHt);
    expect(somme(v.parts.map((p) => p.tva))).toBe(v.totalTva);
  });

  it("donne au taux le plus élevé la plus grosse part du port", () => {
    // Le collier pèse plus lourd que les croquettes : sa part de port suit.
    const normal = v.parts.find((p) => p.taux === TAUX_NORMAL)!;
    const reduit = v.parts.find((p) => p.taux === TAUX_REDUIT)!;
    expect(normal.port).toBeGreaterThan(reduit.port);
  });
});

describe("la somme retombe toujours juste", () => {
  /**
   * Le cas qui casse les répartitions naïves : trois taux, des montants qui
   * ne se divisent pas, un port et une remise avec des centimes. On balaie
   * large plutôt que d'espérer.
   */
  it("sur des centaines de paniers tirés au hasard", () => {
    let graine = 20260908;
    const tirage = () => {
      graine = (graine * 1103515245 + 12345) % 2147483648;
      return graine / 2147483648;
    };

    for (let essai = 0; essai < 400; essai++) {
      const lignes: LigneVentilable[] = [];
      const combien = 1 + Math.floor(tirage() * 4);
      for (let i = 0; i < combien; i++) {
        const taux = [TAUX_NORMAL, TAUX_REDUIT, 0][Math.floor(tirage() * 3)];
        lignes.push({ montant: Math.round(tirage() * 20000) / 100, taux_tva: taux });
      }
      const base = somme(lignes.map((l) => Number(l.montant)));
      const port = Math.round(tirage() * 2500) / 100;
      const remise = Math.round(tirage() * base * 100) / 100;

      const v = ventilerPanier({ lignes, port, remise });
      const attendu = Math.round((base + port - remise) * 100) / 100;

      expect(v.totalTtc).toBe(attendu);
      expect(somme(v.parts.map((p) => p.ttc))).toBe(attendu);
      expect(somme(v.parts.map((p) => p.port))).toBe(port);
      expect(somme(v.parts.map((p) => p.remise))).toBe(remise);
      for (const p of v.parts) {
        expect(Math.round((p.ht + p.tva) * 100) / 100).toBe(p.ttc);
      }
    }
  });
});

describe("les cas limites de la ventilation", () => {
  it("donne au port le taux unique du panier quand il n’y en a qu’un", () => {
    const v = ventilerPanier({ lignes: [croquettes(30)], port: 9 });
    expect(v.parts).toHaveLength(1);
    expect(v.parts[0].taux).toBe(TAUX_REDUIT);
    expect(v.parts[0].port).toBe(9);
    expect(v.totalTtc).toBe(39);
  });

  it("laisse le port hors champ quand tout le panier l’est", () => {
    const v = ventilerPanier({ lignes: [{ montant: 40, taux_tva: 0 }], port: 9 });
    expect(v.parts[0].taux).toBe(0);
    expect(v.totalTva).toBe(0);
  });

  it("met le port au taux normal quand il n’y a rien à suivre", () => {
    const v = ventilerPanier({ lignes: [], port: 9 });
    expect(v.parts).toHaveLength(1);
    expect(v.parts[0].taux).toBe(TAUX_NORMAL);
    expect(v.totalTtc).toBe(9);
  });

  it("ne rend rien du tout sur un panier vide sans port", () => {
    expect(ventilerPanier({ lignes: [] })).toEqual({
      parts: [], totalTtc: 0, totalHt: 0, totalTva: 0,
    });
  });

  it("plafonne une remise plus grande que le panier", () => {
    const v = ventilerPanier({ lignes: [collier(40)], remise: 100 });
    expect(v.totalTtc).toBe(0);
    expect(somme(v.parts.map((p) => p.remise))).toBe(40);
  });

  it("ramène au taux normal une ligne dont le taux est inconnu", () => {
    // Mieux vaut trop de TVA qu'une ligne qui disparaît de la ventilation.
    const v = ventilerPanier({ lignes: [{ montant: 10, taux_tva: 7.7 }] });
    expect(v.parts[0].taux).toBe(TAUX_NORMAL);
    expect(v.totalTtc).toBe(10);
  });

  it("verse les centimes d’arrondi au taux LE PLUS ÉLEVÉ", () => {
    // 0,01 de port sur deux taux : il ne peut pas se couper en deux.
    const v = ventilerPanier({ lignes: [croquettes(10), collier(10)], port: 0.01 });
    expect(v.parts[0].taux).toBe(TAUX_NORMAL);
    expect(v.parts[0].port).toBe(0.01);
    expect(v.parts[1].port).toBe(0);
  });
});

describe("le pied de pièce", () => {
  const ventilation = ventilerPanier({ lignes: [croquettes(29.5), collier(43)] });
  const assujettie = { assujettie: true, numero: "CHE-123.456.789 TVA", dateAssujettissement: "2026-01-01" };

  it("montre le numéro et une ligne par taux présent", () => {
    const pied = piedTva(assujettie, ventilation, "2026-06-30")!;
    expect(pied.numero).toBe("CHE-123.456.789 TVA");
    expect(pied.lignes.map((l) => l.etiquette)).toEqual(["TVA 8,1 %", "TVA 2,6 %"]);
  });

  it("ne montre pas un taux absent de la pièce", () => {
    const pension = ventilerPanier({ lignes: [collier(120)] });
    const pied = piedTva(assujettie, pension, "2026-06-30")!;
    expect(pied.lignes).toHaveLength(1);
    expect(pied.lignes[0].etiquette).toBe("TVA 8,1 %");
  });

  it("ne montre RIEN quand l’entreprise n’est pas assujettie", () => {
    const pied = piedTva(
      { assujettie: false, numero: "CHE-123.456.789 TVA", dateAssujettissement: "2026-01-01" },
      ventilation,
      "2026-06-30"
    );
    // Null veut dire : pas de numéro, pas de ventilation, pas de ligne à zéro.
    expect(pied).toBeNull();
  });

  it("ne montre rien sur une pièce antérieure à l’assujettissement", () => {
    expect(piedTva(assujettie, ventilation, "2025-12-31")).toBeNull();
  });

  it("ne facture aucune TVA avant la date d’assujettissement", () => {
    expect(tauxApplicable(assujettie, "2025-12-31", 8.1)).toBe(0);
    expect(tauxApplicable(assujettie, "2026-01-01", 8.1)).toBe(8.1);
    expect(tauxApplicable({ ...assujettie, assujettie: false }, "2026-06-30", 8.1)).toBe(0);
  });
});

describe("le numéro de TVA", () => {
  it("n’accepte que le format de l’AFC", () => {
    expect(numeroTvaValide("CHE-123.456.789 TVA")).toBe(true);
    expect(numeroTvaValide("CHE-123456789 TVA")).toBe(false);
    expect(numeroTvaValide("123.456.789")).toBe(false);
    expect(numeroTvaValide("")).toBe(false);
  });

  it("met en forme ce qui a été tapé, sans deviner", () => {
    expect(normaliserNumeroTva("123456789")).toBe("CHE-123.456.789 TVA");
    expect(normaliserNumeroTva("che-123.456.789 tva")).toBe("CHE-123.456.789 TVA");
    expect(normaliserNumeroTva("12345678")).toBeNull();
    expect(normaliserNumeroTva("")).toBeNull();
  });
});
