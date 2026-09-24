import { describe, it, expect } from "vitest";
import {
  inventorier,
  moisDe,
  anneeDe,
  poidsLisible,
  type FichierReference,
} from "@/src/lib/exportComptableLogique";

/**
 * L'inventaire d'un exercice.
 *
 * Le jeu de données couvre ce qu'on ne sait pas fabriquer en production : un
 * mois vide, un mois de factures seules, un mois des deux, une pièce dont
 * l'original a disparu, et un fichier que plus rien ne désigne.
 */

const ref = (
  chemin: string,
  dateComptable: string,
  categorie: FichierReference["categorie"],
): FichierReference => ({ chemin, dateComptable, categorie });

/** Un exercice complet, avec ses accidents. */
function jeuDeDonnees() {
  const references: FichierReference[] = [
    // Février : deux factures, rien d'autre.
    ref("2026/FAC-2026-0001.pdf", "2026-02-03", "facture"),
    ref("2026/FAC-2026-0002.pdf", "2026-02-27", "facture"),
    // Mars : une facture, un justificatif et son original.
    ref("2026/FAC-2026-0003.pdf", "2026-03-15", "facture"),
    ref("depense/d1/aaa.webp", "2026-03-10", "piece"),
    ref("depense/d1/aaa.origine.jpg", "2026-03-10", "piece_origine"),
    // Avril : un justificatif dont l'ORIGINAL a disparu du stockage.
    ref("depense/d2/bbb.webp", "2026-04-02", "piece"),
    ref("depense/d2/bbb.origine.jpg", "2026-04-02", "piece_origine"),
    // Mai : une facture que la base désigne et que le stockage n'a plus.
    ref("2026/FAC-2026-0009.pdf", "2026-05-20", "facture"),
    // Un autre exercice : ne doit rien peser ici.
    ref("2025/FAC-2025-0001.pdf", "2025-11-04", "facture"),
  ];

  const tailles = new Map<string, number>([
    ["2026/FAC-2026-0001.pdf", 100_000],
    ["2026/FAC-2026-0002.pdf", 100_000],
    ["2026/FAC-2026-0003.pdf", 120_000],
    ["depense/d1/aaa.webp", 40_000],
    ["depense/d1/aaa.origine.jpg", 900_000],
    ["depense/d2/bbb.webp", 30_000],
    // bbb.origine.jpg : ABSENT — c'est l'anomalie n° 3.
    // FAC-2026-0009.pdf : ABSENT — c'est l'anomalie n° 1.
    ["2025/FAC-2025-0001.pdf", 111_000],
    // Et un fichier que rien ne désigne : l'anomalie n° 2.
    ["depense/d1/zzz-inconnu.webp", 7_000],
  ]);

  return {
    exercice: 2026,
    references,
    tailles,
    dansLePerimetre: (c: string) => c.startsWith("2026/") || c.startsWith("depense/"),
    appelsStockage: 3,
  };
}

describe("inventaire d'un exercice", () => {
  const inv = inventorier(jeuDeDonnees());

  it("un mois sans rien reste à zéro, sans disparaître du tableau", () => {
    expect(inv.mois).toHaveLength(12);
    const janvier = inv.mois[0];
    expect(janvier.nbFactures).toBe(0);
    expect(janvier.octets).toBe(0);
  });

  it("un mois de factures seules ne compte que des factures", () => {
    const fevrier = inv.mois[1];
    expect(fevrier.nbFactures).toBe(2);
    expect(fevrier.nbPieces).toBe(0);
    expect(fevrier.octetsFactures).toBe(200_000);
    expect(fevrier.octets).toBe(200_000);
  });

  it("un mois avec les deux les distingue, original compris", () => {
    const mars = inv.mois[2];
    expect(mars.nbFactures).toBe(1);
    expect(mars.nbPieces).toBe(1);
    expect(mars.nbOriginaux).toBe(1);
    expect(mars.octetsFactures).toBe(120_000);
    expect(mars.octetsPieces).toBe(40_000);
    expect(mars.octetsOriginaux).toBe(900_000);
    expect(mars.octets).toBe(1_060_000);
  });

  it("le total ne compte que l'exercice demandé", () => {
    // 200 000 + 1 060 000 + 30 000 (avril, l'original manquant ne pèse rien)
    expect(inv.total.octets).toBe(1_290_000);
    expect(inv.total.nbFactures).toBe(3); // la facture de 2025 n'y est pas
    expect(inv.total.nbPieces).toBe(2);
    expect(inv.total.nbOriginaux).toBe(1);
  });

  it("le poids annoncé ne compte pas ce qui manque", () => {
    // Si l'on comptait les absents, on annoncerait un export qu'on ne saurait
    // pas fabriquer.
    const mai = inv.mois[4];
    expect(mai.nbFactures).toBe(0);
    expect(mai.octets).toBe(0);
  });
});

describe("les trois anomalies, nommées par leur chemin", () => {
  const inv = inventorier(jeuDeDonnees());

  it("référencé en base, absent du stockage", () => {
    expect(inv.anomalies.manquants).toHaveLength(1);
    expect(inv.anomalies.manquants[0].chemin).toBe("2026/FAC-2026-0009.pdf");
    expect(inv.anomalies.manquants[0].categorie).toBe("facture");
  });

  it("présent dans le stockage, désigné par rien", () => {
    expect(inv.anomalies.orphelins).toHaveLength(1);
    expect(inv.anomalies.orphelins[0]).toEqual({ chemin: "depense/d1/zzz-inconnu.webp", octets: 7_000 });
  });

  it("original annoncé, fichier absent", () => {
    expect(inv.anomalies.originauxManquants).toHaveLength(1);
    expect(inv.anomalies.originauxManquants[0].chemin).toBe("depense/d2/bbb.origine.jpg");
  });

  it("un fichier hors des dossiers parcourus n'est pas déclaré orphelin", () => {
    // On ne sait pas ce qu'il y a ailleurs : on ne le prétend pas.
    const donnees = jeuDeDonnees();
    donnees.tailles.set("chiens-photos/ch1/photo.webp", 50_000);
    const r = inventorier(donnees);
    expect(r.anomalies.orphelins.map((o) => o.chemin)).not.toContain("chiens-photos/ch1/photo.webp");
  });
});

describe("la frontière d'exercice", () => {
  it("le 31 décembre et le 1er janvier ne tombent pas du même côté", () => {
    const references = [
      ref("2026/FAC-A.pdf", "2026-12-31", "facture"),
      ref("2027/FAC-B.pdf", "2027-01-01", "facture"),
    ];
    const tailles = new Map([["2026/FAC-A.pdf", 10], ["2027/FAC-B.pdf", 20]]);
    const commun = { references, tailles, dansLePerimetre: () => false, appelsStockage: 1 };

    const e2026 = inventorier({ ...commun, exercice: 2026 });
    expect(e2026.total.nbFactures).toBe(1);
    expect(e2026.mois[11].nbFactures).toBe(1); // décembre
    expect(e2026.total.octets).toBe(10);

    const e2027 = inventorier({ ...commun, exercice: 2027 });
    expect(e2027.total.nbFactures).toBe(1);
    expect(e2027.mois[0].nbFactures).toBe(1); // janvier
    expect(e2027.total.octets).toBe(20);
  });

  it("une pièce sans date comptable lisible ne tombe dans aucun exercice", () => {
    // Le cas d'un parent introuvable : elle ne doit ni peser, ni être comptée
    // ailleurs par accident.
    const r = inventorier({
      exercice: 2026,
      references: [ref("depense/d9/x.webp", "", "piece")],
      tailles: new Map([["depense/d9/x.webp", 1_000]]),
      dansLePerimetre: () => true,
      appelsStockage: 1,
    });
    expect(r.total.nbPieces).toBe(0);
    expect(r.total.octets).toBe(0);
    expect(r.anomalies.manquants).toHaveLength(0);
  });
});

describe("lecture humaine du poids", () => {
  it("dit des octets, des kilo-octets, des méga-octets", () => {
    expect(poidsLisible(512)).toBe("512 o");
    expect(poidsLisible(2048)).toBe("2 ko");
    expect(poidsLisible(3 * 1024 * 1024)).toBe("3.0 Mo");
  });

  it("le mois et l'année se lisent sur la date comptable", () => {
    expect(moisDe("2026-03-15")).toBe(3);
    expect(anneeDe("2026-03-15")).toBe(2026);
    expect(anneeDe("")).toBe(0);
  });
});
