import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  COMPTES_LIGNE_LIBRE_LOCATAIRE,
  validerLignesLibresLocataire,
} from "@/src/lib/ligneLibreLogique";
import { prestationDuCompte } from "@/src/lib/tvaLogique";
import { COMPTES_PRODUIT } from "@/src/lib/factureStatut";

/**
 * Les lignes libres d'une facture de locataire de box.
 *
 * Elles vont sur le bon compte de produit, figent le même taux que les lignes
 * libres de la comptabilité, et la facture n'entre jamais dans l'envoi du matin.
 */

const H = vi.hoisted(() => ({
  inserts: [] as { table: string; valeurs: unknown }[],
  appelsTva: [] as { code: string; date: string | null }[],
}));

vi.mock("@/src/lib/supabase-admin", () => {
  function from(table: string) {
    let op: "select" | "insert" | "update" = "select";
    const lire = () => {
      if (op === "insert" && table === "factures") return { id: "fact-1" };
      if (table === "clients") {
        return {
          id: "loc-1", prenom: "Camille", nom: "Rey", adresse: "Rue du Box 1\n1950 Sion",
          locataire_box: true, loyer_refacture: null, locataire_depuis: null,
          locataire_jusqu_au: null, dernier_mois_loyer_facture: null,
        };
      }
      if (table === "abonnements_prestations") {
        return {
          id: "abo-1", prix_mensuel_fige: 300, statut: "actif", date_debut: "2026-01-01",
          date_fin: null, dernier_mois_facture: null, formules: { nom: "Formule soins" },
        };
      }
      return null;
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: (valeurs: unknown) => { op = "insert"; H.inserts.push({ table, valeurs }); return chain; },
      update: () => { op = "update"; return chain; },
      eq: () => chain, is: () => chain, gte: () => chain, lte: () => chain, in: () => chain,
      order: () => chain, limit: () => chain, not: () => chain,
      maybeSingle: () => Promise.resolve({ data: lire(), error: null }),
      single: () => Promise.resolve({ data: lire(), error: null }),
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve({ data: table === "taches_prestations" ? [] : [], error: null }).then(ok, ko),
    };
    return chain;
  }
  return {
    supabaseAdmin: {
      from,
      rpc: () => Promise.resolve({ data: "FAC-2026-0200", error: null }),
    },
  };
});

vi.mock("@/src/lib/tva", () => ({
  // Taux distincts par prestation : c'est ce qui prouve QUEL code a été lu.
  tvaDeLaPrestation: async (code: string, date: string | null) => {
    H.appelsTva.push({ code, date });
    return code === "prestation_annexe" ? { taux: 8.1, motif: null } : { taux: 2.6, motif: null };
  },
  tauxAFiger: async (_date: string | null, taux: number | string | null | undefined) => Number(taux ?? 0),
}));
vi.mock("@/src/lib/journalEvenements", () => ({ tracerEvenement: async () => {} }));
vi.mock("@/src/lib/comptaFacture", () => ({ synchroniserComptaFacture: async () => {} }));
vi.mock("@/src/lib/factureDocument", () => ({ finaliserEmission: async () => {} }));

import { emettreFactureMois } from "@/src/lib/factureLocataire";

beforeEach(() => {
  H.inserts = [];
  H.appelsTva = [];
});

type LigneInseree = {
  libelle: string; quantite: number; prix_unitaire: number; compte_produit: string;
  taux_tva: number; motif_tva: string | null; secteur_tdfn: string;
};

const lignesInserees = () =>
  (H.inserts.find((i) => i.table === "facture_lignes")?.valeurs ?? []) as LigneInseree[];

describe("la saisie", () => {
  it("propose exactement trois comptes, et jamais la boutique", () => {
    expect(COMPTES_LIGNE_LIBRE_LOCATAIRE.map((c) => [c.numero, c.libelle])).toEqual([
      ["3022", "Alimentation refacturée"],
      ["3023", "Frais vétérinaires refacturés"],
      ["3020", "Autre prestation"],
    ]);
    expect(COMPTES_LIGNE_LIBRE_LOCATAIRE.map((c) => c.numero)).not.toContain("3200");
  });

  it("relit libellé, montant TTC et compte ; ignore une ligne laissée vide", () => {
    const r = validerLignesLibresLocataire(JSON.stringify([
      { libelle: " Croquettes ", montant: "45,50", compte_produit: "3022" },
      { libelle: "", montant: "", compte_produit: "3022" },
    ]));
    expect(r).toEqual({ lignes: [{ libelle: "Croquettes", montant: 45.5, compte_produit: "3022" }] });
  });

  it("refuse un montant nul, négatif ou illisible, en nommant la ligne", () => {
    for (const montant of ["0", "-10", "abc", ""]) {
      const r = validerLignesLibresLocataire([{ libelle: "Vétérinaire", montant, compte_produit: "3023" }]);
      expect(r.error, montant).toBe("Montant invalide sur « Vétérinaire ».");
    }
  });

  it("refuse un compte hors de la liste, la boutique comprise", () => {
    for (const compte of ["3200", "3000", "", "9999"]) {
      const r = validerLignesLibresLocataire([{ libelle: "Jouet", montant: "12", compte_produit: compte }]);
      expect(r.error, compte).toBe("Choisissez le type de « Jouet » dans la liste.");
    }
  });

  it("aucune ligne ajoutée n’est une saisie valide", () => {
    expect(validerLignesLibresLocataire("")).toEqual({ lignes: [] });
    expect(validerLignesLibresLocataire("[]")).toEqual({ lignes: [] });
    expect(validerLignesLibresLocataire(null)).toEqual({ lignes: [] });
  });
});

describe("les comptes et leur taux", () => {
  it("3022 et 3023 suivent les prestations annexes, pas le séjour par défaut", () => {
    expect(prestationDuCompte("3022")).toBe("prestation_annexe");
    expect(prestationDuCompte("3023")).toBe("prestation_annexe");
    expect(prestationDuCompte("3020")).toBe("prestation_annexe");
  });

  it("les nouveaux comptes portent un libellé partout où la facture s’affiche", () => {
    const libelles = Object.fromEntries(COMPTES_PRODUIT.map((c) => [c.numero, c.libelle]));
    expect(libelles["3022"]).toBe("Alimentation refacturée");
    expect(libelles["3023"]).toBe("Frais vétérinaires refacturés");
  });
});

describe("l’émission", () => {
  const LIBRES = [
    { libelle: "Croquettes", montant: 45.5, compte_produit: "3022" },
    { libelle: "Consultation Dr Favre", montant: 120, compte_produit: "3023" },
    { libelle: "Tonte", montant: 30, compte_produit: "3020" },
  ];

  it("écrit chaque ligne libre sur son compte, à son montant TTC", async () => {
    const r = await emettreFactureMois({
      clientId: "loc-1", mois: "2026-08", dateFacture: "2026-09-16", lignesLibres: LIBRES,
    });
    expect(r.error).toBeUndefined();

    // Les lignes libres suivent les lignes proposées : ce sont les dernières.
    const libres = lignesInserees().slice(-LIBRES.length);
    expect(libres.map((l) => [l.libelle, l.compte_produit, l.quantite, l.prix_unitaire])).toEqual([
      ["Croquettes", "3022", 1, 45.5],
      ["Consultation Dr Favre", "3023", 1, 120],
      ["Tonte", "3020", 1, 30],
    ]);
  });

  it("fige le taux des prestations annexes, à la fin du mois facturé", async () => {
    await emettreFactureMois({
      clientId: "loc-1", mois: "2026-08", dateFacture: "2026-09-16", lignesLibres: LIBRES,
    });
    const libres = lignesInserees().slice(-3);
    for (const l of libres) {
      expect(l.taux_tva, l.libelle).toBe(8.1);
      expect(l.motif_tva, l.libelle).toBeNull();
      expect(l.secteur_tdfn, l.libelle).toBe("pension");
    }
    // Trois lectures, toutes au même code et à la même date que le reste de
    // la facture : une pièce ne mélange pas deux régimes.
    expect(H.appelsTva.filter((a) => a.code === "prestation_annexe")).toEqual([
      { code: "prestation_annexe", date: "2026-08-31" },
      { code: "prestation_annexe", date: "2026-08-31" },
      { code: "prestation_annexe", date: "2026-08-31" },
    ]);
  });

  it("émet la facture exclue de l’envoi du matin", async () => {
    await emettreFactureMois({ clientId: "loc-1", mois: "2026-08", dateFacture: "2026-09-16" });
    const facture = H.inserts.find((i) => i.table === "factures")?.valeurs as Record<string, unknown>;
    expect(facture.envoi_auto_exclu).toBe(true);
  });

  it("sans ligne ajoutée, la facture garde exactement ses lignes proposées", async () => {
    await emettreFactureMois({ clientId: "loc-1", mois: "2026-08", dateFacture: "2026-09-16" });
    const sansAjout = lignesInserees();
    expect(sansAjout.length).toBeGreaterThan(0);
    // Aucune ligne de refacturation n'apparaît d'elle-même.
    expect(sansAjout.some((l) => ["3022", "3023"].includes(l.compte_produit))).toBe(false);

    H.inserts = [];
    await emettreFactureMois({
      clientId: "loc-1", mois: "2026-08", dateFacture: "2026-09-16", lignesLibres: LIBRES,
    });
    // Les mêmes lignes proposées, puis les trois ajoutées — rien de retiré.
    expect(lignesInserees().slice(0, sansAjout.length).map((l) => l.libelle))
      .toEqual(sansAjout.map((l) => l.libelle));
    expect(lignesInserees()).toHaveLength(sansAjout.length + LIBRES.length);
  });
});

// ── L'écriture comptable ───────────────────────────────────────────────────

describe("l’écriture comptable de ces lignes", () => {
  it("crédite chaque compte de refacturation, et débite les débiteurs du total", async () => {
    const { cibleFacture } = await import("@/src/lib/comptaFactureLogique");
    const cible = cibleFacture({
      type: "libre",
      emise: true,
      statut: "envoyee",
      lignes: [
        { compte_produit: "3020", montant: 300, taux_tva: 8.1 }, // forfait
        { compte_produit: "3022", montant: 45.5, taux_tva: 8.1 },
        { compte_produit: "3023", montant: 120, taux_tva: 8.1 },
      ],
      // Dette fiscale nette : le produit se passe TTC.
      tvaEffective: false,
    });
    expect(cible).toEqual({
      "3020": -300,
      "3022": -45.5,
      "3023": -120,
      "1100": 465.5,
    });
    // Jamais la boutique : rien ne sort d'un stock.
    expect(cible).not.toHaveProperty("3200");
  });
});

// ── Le même mécanisme que la comptabilité ──────────────────────────────────

const RACINE = join(__dirname, "..");
const lire = (...m: string[]) => readFileSync(join(RACINE, ...m), "utf8");

describe("une seule règle pour toutes les lignes libres", () => {
  it("l’assistant de facture et la facture du locataire figent par la même fonction", () => {
    const assistant = lire("app", "(admin)", "(espace-comptabilite)", "factures", "actionsCreation.ts");
    const locataire = lire("src", "lib", "factureLocataire.ts");
    expect(assistant).toContain("figerLigneLibre(l.compte_produit, dateFacture)");
    expect(locataire).toContain("figerLigneLibre(l.compte_produit, fin)");
  });

  it("cette fonction passe par tvaDeLaPrestation, donc par tauxAFiger", () => {
    const helper = lire("src", "lib", "ligneLibre.ts");
    expect(helper).toContain("tvaDeLaPrestation(prestationDuCompte(compteProduit)");
    const tva = lire("src", "lib", "tva.ts");
    const corps = tva.slice(tva.indexOf("export async function tvaDeLaPrestation"));
    expect(corps.slice(0, corps.indexOf("\n}"))).toContain("tauxAFiger(");
  });
});
