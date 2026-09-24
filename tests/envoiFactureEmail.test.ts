import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `email_envoye_le` est posé par un envoi RÉUSSI, et par lui seul.
 *
 * C'est la date qui retire une facture de l'envoi du matin. Posée sur un échec,
 * elle ferait croire la facture arrivée : le client ne la recevrait jamais, et
 * rien ne le montrerait.
 */

const H = vi.hoisted(() => ({
  factures: {} as Record<string, Record<string, unknown>>,
  mises: [] as { table: string; valeurs: Record<string, unknown>; id: string }[],
  traces: [] as { evenement: string; apres: unknown }[],
  envoiEchoue: false,
  envois: 0,
}));

vi.mock("@/src/lib/supabase-admin", () => {
  function from(table: string) {
    const ctx: { id?: string; valeurs?: Record<string, unknown> } = {};
    const chain = {
      select: () => chain,
      update: (valeurs: Record<string, unknown>) => { ctx.valeurs = valeurs; return chain; },
      eq: (_col: string, val: string) => {
        ctx.id = val;
        if (ctx.valeurs) {
          H.mises.push({ table, valeurs: ctx.valeurs, id: val });
          return Promise.resolve({ error: null });
        }
        return chain;
      },
      maybeSingle: () => Promise.resolve({ data: H.factures[ctx.id ?? ""] ?? null, error: null }),
    };
    return chain;
  }
  return {
    supabaseAdmin: {
      from,
      // Aucun PDF déposé : l'envoi part sans pièce, ce qui ne change rien ici.
      // Le PDF est JOINT a l e-mail : sans document, l envoi est refuse
      // (lot 20). Ces scenarios sont ceux d un envoi qui aboutit, donc le
      // document est la.
      storage: { from: () => ({ download: () => Promise.resolve({ data: new Blob(["%PDF-1.4"]), error: null }) }) },
    },
  };
});

vi.mock("@/src/lib/email", () => ({
  envoyerEmailFactureEmise: async () => {
    H.envois++;
    if (H.envoiEchoue) throw new Error("Resend: domaine non vérifié");
  },
}));
vi.mock("@/src/lib/journalEvenements", () => ({
  tracerEvenement: async (e: { evenement: string; apres: unknown }) => { H.traces.push(e); },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));
// Le reste du module (PDF, TVA, QR) n'est pas en jeu ici.
vi.mock("@/src/lib/coordonneesPaiement", () => ({ getCoordonneesPaiement: async () => ({}) }));
vi.mock("@/src/lib/tva", () => ({ lireParametresTva: async () => ({}), affichage: () => ({}) }));
vi.mock("@/src/lib/qrFacture", () => ({ genererQrBillSvg: () => "" }));
vi.mock("@/src/lib/facturePdf", () => ({ FacturePdf: () => null }));

import { envoyerFactureParEmail } from "@/src/lib/factureDocument";

beforeEach(() => {
  H.factures = {
    f1: {
      id: "f1", numero: "FAC-2026-0100", date_facture: "2026-09-15", date_echeance: "2026-10-15",
      montant_total: 120, montant_restant: 120, pdf_path: "2026/FAC-2026-0100.pdf",
      clients: { prenom: "Camille", email: "camille@exemple.ch" },
    },
    sansAdresse: {
      id: "sansAdresse", numero: "FAC-2026-0101", date_facture: "2026-09-15",
      montant_total: 50, montant_restant: 50, pdf_path: "2026/FAC-2026-0101.pdf",
      clients: { prenom: "Luc", email: null },
    },
  };
  H.mises = [];
  H.traces = [];
  H.envoiEchoue = false;
  H.envois = 0;
});

const posees = () =>
  H.mises.filter((m) => m.table === "factures" && "email_envoye_le" in m.valeurs);

describe("un envoi réussi pose la date", () => {
  it("email_envoye_le est écrit sur la facture, une fois", async () => {
    const r = await envoyerFactureParEmail("f1", "u1");
    expect(r.error).toBeUndefined();
    expect(H.envois).toBe(1);
    expect(posees()).toHaveLength(1);
    expect(posees()[0].id).toBe("f1");
    expect(Number.isNaN(Date.parse(String(posees()[0].valeurs.email_envoye_le)))).toBe(false);
  });

  it("un envoi ordinaire ne ferme pas l’envoi du matin à jamais", async () => {
    await envoyerFactureParEmail("f1", "u1");
    expect(posees()[0].valeurs).not.toHaveProperty("envoi_auto_exclu");
  });

  it("l’envoi laisse sa trace au journal, avec le chemin emprunté", async () => {
    await envoyerFactureParEmail("f1", null, { via: "envoi_du_matin" });
    expect(H.traces).toContainEqual(expect.objectContaining({
      evenement: "envoi",
      apres: { destinataire: "camille@exemple.ch", via: "envoi_du_matin" },
    }));
  });
});

describe("un échec ne pose rien", () => {
  it("Resend refuse → aucune date, aucune trace d’envoi, et l’erreur remonte", async () => {
    H.envoiEchoue = true;
    const r = await envoyerFactureParEmail("f1", "u1");
    expect(r.error).toBe("L'envoi de l'e-mail a échoué.");
    expect(H.envois).toBe(1);
    expect(posees()).toHaveLength(0);
    expect(H.traces.filter((t) => t.evenement === "envoi")).toHaveLength(0);
  });

  it("client sans adresse → rien n’est tenté, rien n’est posé", async () => {
    const r = await envoyerFactureParEmail("sansAdresse", "u1");
    expect(r.error).toBe("Ce client n'a pas d'adresse e-mail.");
    expect(H.envois).toBe(0);
    expect(posees()).toHaveLength(0);
  });

  it("facture non émise → rien n’est tenté, rien n’est posé", async () => {
    H.factures.brouillon = { ...H.factures.f1, id: "brouillon", numero: null };
    const r = await envoyerFactureParEmail("brouillon", "u1");
    expect(r.error).toBe("Facture non émise.");
    expect(H.envois).toBe(0);
    expect(posees()).toHaveLength(0);
  });
});
