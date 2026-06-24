import { supabaseAdmin } from "@/src/lib/supabase-admin";

const COMPTE_LIQUIDITE: Record<string, string> = {
  cash: "1000", virement: "1020", twint: "1021", stripe: "1021", avoir: "2035",
};
const COMPTE_PRODUIT: Record<string, string> = {
  sejour: "3000", journee: "3000", garderie: "3000", essai: "3000",
};

const r2 = (n: number) => Math.round(n * 100) / 100;

async function marquerStatutCompta(reservationId: string, ok: boolean, erreur?: string) {
  await supabaseAdmin.from("reservations").update({
    compta_synchronisee: ok,
    compta_erreur: ok ? null : (erreur ?? "Erreur inconnue"),
    compta_sync_at: new Date().toISOString(),
  }).eq("id", reservationId);
}

// Synchronise les ecritures comptables d'une reservation (idempotent).
// Ne throw jamais : les erreurs sont tracees dans reservations.compta_erreur.
export async function synchroniserComptaResa(reservationId: string, dateOperation?: string): Promise<void> {
  const dateEcriture = dateOperation ?? new Date().toISOString().split("T")[0];

  try {
    const { data: resa } = await supabaseAdmin
      .from("reservations")
      .select("statut, type_reservation, montant_final, montant_calcule")
      .eq("id", reservationId)
      .maybeSingle();
    if (!resa) {
      await marquerStatutCompta(reservationId, true);
      return;
    }

    const { data: mouvements } = await supabaseAdmin
      .from("paiements_resa")
      .select("mode, montant")
      .eq("reservation_id", reservationId);
    const mvts = mouvements ?? [];

    const cible: Record<string, number> = {};
    const add = (compte: string, montant: number) => {
      cible[compte] = r2((cible[compte] ?? 0) + montant);
    };

    let liquideTotal = 0;
    for (const m of mvts as any[]) {
      const compte = COMPTE_LIQUIDITE[m.mode];
      if (!compte) continue;
      const montant = Number(m.montant);
      add(compte, montant);
      liquideTotal += montant;
    }
    liquideTotal = r2(liquideTotal);

    const total = r2(Number(resa.montant_final ?? resa.montant_calcule ?? 0));
    const P = resa.statut === "terminee" ? total : 0;
    const CP = COMPTE_PRODUIT[resa.type_reservation] ?? "3000";

    if (P > 0) {
      add(CP, -P);
      add("1100", r2(P - liquideTotal));
    } else {
      add("2030", -liquideTotal);
    }

    const { data: lignes } = await supabaseAdmin
      .from("ecritures_lignes")
      .select("compte_numero, debit, credit, ecritures!inner(piece_id, piece_type)")
      .eq("ecritures.piece_id", reservationId)
      .eq("ecritures.piece_type", "reservation");
    const deja: Record<string, number> = {};
    for (const l of (lignes ?? []) as any[]) {
      deja[l.compte_numero] = r2((deja[l.compte_numero] ?? 0) + Number(l.debit) - Number(l.credit));
    }

    const comptes = new Set<string>([...Object.keys(cible), ...Object.keys(deja)]);
    const lignesEcriture: { compte: string; debit: number; credit: number }[] = [];
    for (const compte of comptes) {
      const delta = r2((cible[compte] ?? 0) - (deja[compte] ?? 0));
      if (delta > 0) lignesEcriture.push({ compte, debit: delta, credit: 0 });
      else if (delta < 0) lignesEcriture.push({ compte, debit: 0, credit: -delta });
    }

    if (lignesEcriture.length === 0) {
      await marquerStatutCompta(reservationId, true);
      return;
    }

    const { error } = await supabaseAdmin.rpc("passer_ecriture", {
      p_date: dateEcriture,
      p_libelle: `Reservation ${reservationId.slice(0, 8)}`,
      p_piece_type: "reservation",
      p_piece_id: reservationId,
      p_lignes: lignesEcriture,
    });
    if (error) throw error;

    await marquerStatutCompta(reservationId, true);
  } catch (e: any) {
    await marquerStatutCompta(reservationId, false, String(e?.message ?? e).slice(0, 500));
    console.error("compta resa:", e);
  }
}
