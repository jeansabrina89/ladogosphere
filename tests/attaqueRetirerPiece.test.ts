import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * C-06c — le justificatif d'une dépense VALIDÉE, détruit en pointant ailleurs.
 *
 * `retirerPiece` reçoit deux identifiants du formulaire : celui de la pièce et
 * celui de la dépense. La garde « une dépense validée garde ses pièces » porte
 * sur la dépense DÉSIGNÉE — pas sur celle à qui la pièce appartient.
 *
 * L'attaque : désigner une dépense en brouillon (qui passe la garde) et la
 * pièce d'une dépense validée (qui, elle, ne devrait pas bouger).
 *
 * Qui peut l'atteindre : tout compte portant `perm_depenses` — employé ou
 * administratrice. Ni un client, ni un anonyme : la garde de permission est
 * en place et n'est pas en cause.
 */

const H = vi.hoisted(() => ({
  /** Les dépenses : id → { numero } ; un numéro signifie « validée ». */
  depenses: new Map<string, { id: string; numero: string | null }>(),
  /** Les pièces : id → la dépense à qui elles appartiennent. */
  pieces: new Map<string, { id: string; entite: string; entite_id: string }>(),
  /** Ce que `supprimerPiece` a réellement effacé. */
  supprimees: [] as string[],
}));

vi.mock("@sentry/nextjs", () => ({ captureException: () => {}, captureMessage: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));

// L'employé a la permission : ce n'est pas elle qui est en cause.
vi.mock("@/src/lib/verifierPermission", () => ({
  verifierPermission: async () => ({ userId: "u-employe" }),
}));

vi.mock("@/src/lib/depenses", () => ({
  lireDepense: async (id: string) => H.depenses.get(id) ?? null,
  validerDepense: async () => ({}),
  payerDepense: async () => ({}),
  annulerDepense: async () => ({}),
}));

vi.mock("@/src/lib/pieces", () => ({
  BUCKET_JUSTIFICATIFS: "justificatifs",
  supprimerPiece: async (pieceId: string) => {
    H.supprimees.push(pieceId);
    H.pieces.delete(pieceId);
    return {};
  },
  listerPieces: async () => [],
  compterPieces: async () => 0,
}));

vi.mock("@/src/lib/supabase-admin", () => {
  const from = () => {
    const filtres: Record<string, string> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: string) => { filtres[col] = val; return chain; },
      maybeSingle: async () => ({ data: H.pieces.get(filtres.id) ?? null, error: null }),
    };
    return chain;
  };
  return { supabaseAdmin: { from } };
});

import { retirerPiece } from "@/app/(admin)/(espace-comptabilite)/comptabilite/depenses/actions";

const BROUILLON = "dep-brouillon";
const VALIDEE = "dep-validee";
const PIECE_DE_LA_VALIDEE = "piece-de-la-validee";

beforeEach(() => {
  H.depenses.clear();
  H.pieces.clear();
  H.supprimees.length = 0;
  H.depenses.set(BROUILLON, { id: BROUILLON, numero: null });
  H.depenses.set(VALIDEE, { id: VALIDEE, numero: "DEP-2026-0001" });
  H.pieces.set(PIECE_DE_LA_VALIDEE, {
    id: PIECE_DE_LA_VALIDEE, entite: "depense", entite_id: VALIDEE,
  });
});

const formulaire = (pieceId: string, depenseId: string) => {
  const fd = new FormData();
  fd.set("piece_id", pieceId);
  fd.set("id", depenseId);
  return fd;
};

describe("C-06c : le justificatif d'une dépense validée", () => {
  it("ne se retire pas en désignant une autre dépense", async () => {
    // L'attaque : la dépense du formulaire est un brouillon — elle passe la
    // garde — et la pièce appartient à une dépense validée.
    const etat = await retirerPiece({}, formulaire(PIECE_DE_LA_VALIDEE, BROUILLON));

    expect(
      H.supprimees,
      "le justificatif d'une dépense validée a été détruit en désignant un brouillon",
    ).toEqual([]);
    expect(H.pieces.has(PIECE_DE_LA_VALIDEE)).toBe(true);
    // Le refus se dit : un succès silencieux laisserait croire au retrait.
    expect(etat.erreur).toBeTruthy();
  });

  it("le retrait légitime, lui, fonctionne toujours", async () => {
    H.pieces.set("piece-du-brouillon", {
      id: "piece-du-brouillon", entite: "depense", entite_id: BROUILLON,
    });

    const etat = await retirerPiece({}, formulaire("piece-du-brouillon", BROUILLON));

    expect(etat.erreur).toBeNull();
    expect(H.supprimees).toEqual(["piece-du-brouillon"]);
  });

  it("une pièce qui n'existe pas se refuse sans rien détruire", async () => {
    const etat = await retirerPiece({}, formulaire("piece-fantome", BROUILLON));
    expect(etat.erreur).toBeTruthy();
    expect(H.supprimees).toEqual([]);
  });

  it("une pièce d'une AUTRE entité — facture, paiement — ne passe pas non plus", async () => {
    H.pieces.set("piece-de-facture", {
      id: "piece-de-facture", entite: "facture", entite_id: "fac-1",
    });
    const etat = await retirerPiece({}, formulaire("piece-de-facture", BROUILLON));
    expect(etat.erreur).toBeTruthy();
    expect(H.supprimees).toEqual([]);
  });
});
