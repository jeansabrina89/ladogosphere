import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * La facture émise sans pièce conservée.
 *
 * Le numéro est attribué, la facture existe comptablement — et le document
 * n'existe pas. Dix ans de conservation sont dus. Trois gardes :
 *   1. l'émission ne l'avale plus ;
 *   2. l'envoi ne part pas sans la pièce jointe ;
 *   3. la réconciliation quotidienne rattrape ce qu'aucun `catch` ne voit.
 */

const H = vi.hoisted(() => ({
  /** Les factures en base : id → { pdf_path, statut, numero } */
  factures: new Map<string, Record<string, unknown>>(),
  /** La génération réussit-elle ? */
  generationReussit: true,
  /** Combien de fois la génération a été tentée. */
  generations: 0,
  journal: [] as { evenement: string; apres: unknown }[],
  /** Les chemins dont l objet a disparu du bucket. */
  objetsPerdus: new Set<string>(),
  traces: [] as { message: string; contexte: unknown }[],
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: () => {},
  captureMessage: (message: string, contexte: unknown) => H.traces.push({ message, contexte }),
}));

vi.mock("@/src/lib/journalEvenements", () => ({
  tracerEvenement: async (e: { evenement: string; apres: unknown }) => {
    H.journal.push({ evenement: e.evenement, apres: e.apres });
  },
}));

vi.mock("@/src/lib/supabase-admin", () => {
  const from = (table: string) => {
    const filtres: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => { filtres[col] = val; return chain; },
      // Les deux requetes de la reconciliation se distinguent par leur filtre
      // sur pdf_path : « is null » cherche les manquants, « not is null »
      // cherche les chemins ecrits, dont on verifiera la presence au bucket.
      is: (col: string) => { if (col === "pdf_path") filtres.pdfNul = true; return chain; },
      not: (col: string) => { if (col === "pdf_path") filtres.pdfEcrit = true; return chain; },
      in: () => chain,
      order: () => chain,
      update: (valeurs: Record<string, unknown>) => ({
        eq: async (_c: string, id: string) => {
          const f = H.factures.get(id);
          if (f) Object.assign(f, valeurs);
          return { error: null };
        },
      }),
      maybeSingle: async () => ({ data: H.factures.get(filtres.id as string) ?? null, error: null }),
      then: undefined,
    };
    // `facturesSansDocument` lit la table entière : la promesse se résout sur
    // la liste filtrée, comme le ferait PostgREST.
    if (table === "factures") {
      (chain as { then?: unknown }).then = (resoudre: (v: unknown) => void) =>
        resoudre({
          data: filtres.pdfEcrit
            ? [...H.factures.values()].filter((f) => !!f.pdf_path)
            : [...H.factures.values()].filter((f) => !f.pdf_path && f.numero && f.statut !== "brouillon"),
          error: null,
        });
    }
    return chain;
  };
  // Le bucket : `list` rend ce qui EXISTE, donc pas les objets perdus.
  const storage = {
    from: () => ({
      list: async (dossier: string) => ({
        data: [...H.factures.values()]
          .filter((f) => typeof f.pdf_path === "string" && (f.pdf_path as string).startsWith(dossier + "/"))
          .filter((f) => !H.objetsPerdus.has(f.pdf_path as string))
          .map((f) => ({ name: (f.pdf_path as string).split("/")[1] })),
        error: null,
      }),
    }),
  };
  return { supabaseAdmin: { from, storage } };
});

// Ce fichier teste la RECONCILIATION : `finaliserEmission` y est simulee.
// Son propre contrat -- ne plus avaler l echec -- est teste a part, dans
// tests/finaliserEmission.test.ts.
vi.mock("@/src/lib/factureDocument", () => ({
  BUCKET_FACTURES: "factures",
  finaliserEmission: async (id: string) => {
    H.generations += 1;
    if (!H.generationReussit) return { error: "document absent" };
    const f = H.factures.get(id);
    if (f) f.pdf_path = `2026/${String(f.numero)}.pdf`;
    return {};
  },
  // La lecture dit LAQUELLE des deux absences : jamais cree, ou perdu.
  lirePdfFacture: async (id: string) => {
    const f = H.factures.get(id);
    if (!f?.pdf_path) return { etat: "aucun_chemin" };
    if (H.objetsPerdus.has(String(f.pdf_path))) {
      return { etat: "illisible", raison: "objet absent du stockage" };
    }
    return { etat: "present", octets: Buffer.from("%PDF") };
  },
}));

import {
  reconcilierDocumentsFactures,
  facturesSansDocument,
  reprendreDocumentFacture,
} from "@/src/lib/reconciliationFactures";

beforeEach(() => {
  H.factures.clear();
  H.generationReussit = true;
  H.generations = 0;
  H.journal.length = 0;
  H.traces.length = 0;
  H.objetsPerdus.clear();
});

const facture = (id: string, o: Record<string, unknown> = {}) => {
  H.factures.set(id, {
    id, numero: `FAC-2026-${id}`, statut: "envoyee", date_facture: "2026-03-01",
    pdf_path: null, document_tentatives: 0, document_renonce_le: null, ...o,
  });
};

describe("repérer les factures émises sans document", () => {
  it("une facture numérotée sans PDF est trouvée", async () => {
    facture("0001");
    const liste = await facturesSansDocument();
    expect(liste.map((f) => f.numero)).toEqual(["FAC-2026-0001"]);
  });

  it("un brouillon n'en est pas une : il n'a jamais été émis", async () => {
    facture("0002", { statut: "brouillon", numero: null });
    expect(await facturesSansDocument()).toHaveLength(0);
  });

  it("une facture annulée EN est une : elle reste une pièce comptable", async () => {
    facture("0003", { statut: "annulee_par_avoir" });
    expect(await facturesSansDocument()).toHaveLength(1);
  });

  it("une facture qui a son document n'est pas signalée", async () => {
    facture("0004", { pdf_path: "2026/FAC-2026-0004.pdf" });
    expect(await facturesSansDocument()).toHaveLength(0);
  });
});

describe("la réconciliation répare", () => {
  it("fabrique le document manquant et le dit au journal", async () => {
    facture("0001");
    const bilan = await reconcilierDocumentsFactures();

    expect(bilan).toMatchObject({ manquantes: 1, reparees: 1 });
    expect(bilan.irreparables).toHaveLength(0);
    expect(H.factures.get("0001")!.pdf_path).toBe("2026/FAC-2026-0001.pdf");
    expect(H.journal.map((j) => j.evenement)).toContain("documents_reconcilies");
    // Rien d'alarmant à signaler : la réparation a suffi.
    expect(H.traces).toHaveLength(0);
  });

  it("ce qu'elle ne répare pas, elle l'alerte UNE fois, pas une par facture", async () => {
    facture("0001"); facture("0002"); facture("0003");
    H.generationReussit = false;

    const bilan = await reconcilierDocumentsFactures();

    expect(bilan.irreparables).toHaveLength(3);
    expect(
      H.traces.length,
      "une alerte par facture noierait le signal : trois manques, trois alertes",
    ).toBe(1);
    expect(H.traces[0].message).toContain("Factures émises sans document");
    expect(H.traces[0].contexte).toMatchObject({ level: "error", extra: { nombre: 3 } });
  });

  it("une fois réparée, elle ne réalerte plus le lendemain", async () => {
    facture("0001");
    H.generationReussit = false;
    await reconcilierDocumentsFactures();
    expect(H.traces).toHaveLength(1);

    // Le lendemain, la génération remarche.
    H.traces.length = 0;
    H.generationReussit = true;
    await reconcilierDocumentsFactures();
    expect(H.traces).toHaveLength(0);

    // Le surlendemain, il n'y a plus rien à faire : ni travail, ni alerte.
    H.generations = 0;
    const bilan = await reconcilierDocumentsFactures();
    expect(bilan.manquantes).toBe(0);
    expect(H.generations).toBe(0);
    expect(H.traces).toHaveLength(0);
  });
});

describe("un document PERDU ne se reconstruit pas en douce", () => {
  it("chemin écrit, objet disparu : relevé, alerté, JAMAIS refabriqué", async () => {
    // Elle a un chemin : elle n est donc pas candidate a la fabrication. Mais
    // l objet n est plus dans le bucket -- c est une perte, pas une absence.
    facture("0001", { pdf_path: "2026/FAC-2026-0001.pdf" });
    H.objetsPerdus.add("2026/FAC-2026-0001.pdf");

    const bilan = await reconcilierDocumentsFactures();

    expect(bilan.perdus).toEqual(["FAC-2026-0001"]);
    expect(
      H.generations,
      "la reconciliation a refabrique par-dessus une perte : le document differerait de la copie du client, et pdf_sha256 serait ecrase",
    ).toBe(0);
    // La perte se dit, avec la regle qui explique pourquoi on ne repare pas.
    expect(H.traces).toHaveLength(1);
    expect(H.traces[0].message).toContain("perdus");
  });

  it("un document bien present n est ni perdu ni refabrique", async () => {
    facture("0002", { pdf_path: "2026/FAC-2026-0002.pdf" });
    const bilan = await reconcilierDocumentsFactures();
    expect(bilan.perdus).toEqual([]);
    expect(H.generations).toBe(0);
    expect(H.traces).toHaveLength(0);
  });
});

describe("le renoncement, après cinq échecs", () => {
  it("les cinq premiers jours alertent, le sixième renonce", async () => {
    facture("0007");
    H.generationReussit = false;

    for (let jour = 1; jour <= 5; jour++) {
      H.traces.length = 0;
      const b = await reconcilierDocumentsFactures();
      expect(b.irreparables, `jour ${jour}`).toHaveLength(1);
      expect(b.renoncees).toHaveLength(0);
      expect(H.factures.get("0007")!.document_tentatives).toBe(jour);
    }

    H.traces.length = 0;
    const sixieme = await reconcilierDocumentsFactures();

    expect(sixieme.renoncees).toEqual(["FAC-2026-0007"]);
    expect(H.factures.get("0007")!.document_renonce_le).toBeTruthy();
    // Une seule alerte, celle du renoncement : c'est un événement.
    expect(H.traces).toHaveLength(1);
    expect(H.traces[0].message).toContain("Renoncement");
    // Et le journal garde COMBIEN de fois on a essayé.
    const trace = H.journal.find((j) => j.evenement === "document_renonce");
    expect(trace?.apres).toMatchObject({ numero: "FAC-2026-0007", tentatives: 6 });
  });

  it("une facture renoncée sort de la ronde : plus de tentative, plus d'alerte", async () => {
    facture("0008", { document_tentatives: 6, document_renonce_le: "2026-09-20T07:00:00Z" });
    H.generationReussit = false;

    const b = await reconcilierDocumentsFactures();

    expect(b.ignorees).toBe(1);
    expect(H.generations).toBe(0);
    expect(H.traces).toHaveLength(0);
  });

  it("le compteur mesure des échecs CONSÉCUTIFS : une réussite l'efface", async () => {
    facture("0009", { document_tentatives: 3 });
    H.generationReussit = true;

    await reconcilierDocumentsFactures();

    expect(H.factures.get("0009")!.document_tentatives).toBe(0);
  });
});

describe("reprendre une facture renoncée, à la main", () => {
  it("remet le compteur à zéro, refabrique, et inscrit le geste", async () => {
    facture("0010", { document_tentatives: 6, document_renonce_le: "2026-09-20T07:00:00Z" });
    H.generationReussit = true;

    const res = await reprendreDocumentFacture("0010", "u-gerante");

    expect(res.error).toBeUndefined();
    expect(H.factures.get("0010")!.document_renonce_le).toBeNull();
    expect(H.factures.get("0010")!.document_tentatives).toBe(0);
    expect(H.factures.get("0010")!.pdf_path).toBe("2026/FAC-2026-0010.pdf");
    // Le geste humain laisse sa trace, avec qui l'a fait.
    const trace = H.journal.find((j) => j.evenement === "document_repris");
    expect(trace?.apres).toMatchObject({ numero: "FAC-2026-0010", apresTentatives: 6 });
  });
});
