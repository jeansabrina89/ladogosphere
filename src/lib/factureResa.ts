import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { montantDuReservation, resteAPayer } from "@/src/lib/montants";

const CHAMPS_MONTANT =
  "id, client_id, montant_calcule, montant_final, ajustement_manuel, montant_paye";

async function chargerResa(reservationId: string) {
  const { data } = await supabaseAdmin
    .from("reservations")
    .select(CHAMPS_MONTANT)
    .eq("id", reservationId)
    .maybeSingle();
  return data as {
    id: string;
    client_id: string | null;
    montant_calcule: number | string | null;
    montant_final: number | string | null;
    ajustement_manuel: number | string | null;
    montant_paye: number | string | null;
  } | null;
}

// Facture ACTIVE (non annulée) liée à une réservation, ou null.
async function factureActive(
  reservationId: string
): Promise<{ facture_id: string; numero: string | null; statut: string } | null> {
  const { data } = await supabaseAdmin
    .from("facture_reservations")
    .select("facture_id, factures!inner(id, numero, statut)")
    .eq("reservation_id", reservationId)
    .eq("facture_annulee", false)
    .maybeSingle();
  if (!data || !(data as any).factures) return null;
  const f: any = (data as any).factures;
  return { facture_id: f.id, numero: f.numero ?? null, statut: f.statut };
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

// À la VALIDATION : crée une facture brouillon (sans numéro) pour la résa,
// ou met à jour ses montants si un brouillon existe déjà.
// Ne touche JAMAIS une facture déjà figée (numéro attribué).
export async function creerOuMajFactureBrouillon(reservationId: string): Promise<void> {
  const resa = await chargerResa(reservationId);
  if (!resa || !resa.client_id) return;

  const total = arrondi(montantDuReservation(resa));
  const paye = arrondi(Number(resa.montant_paye ?? 0));
  const reste = arrondi(resteAPayer(resa));

  const active = await factureActive(reservationId);

  if (!active) {
    const { data: facture, error: facErr } = await supabaseAdmin
      .from("factures")
      .insert({
        numero: null,
        client_id: resa.client_id,
        type_facture: "reservation",
        date_facture: new Date().toISOString().split("T")[0],
        montant_total: total,
        montant_paye: paye,
        montant_restant: reste,
        statut: "brouillon",
        reservation_id: null,
      })
      .select("id")
      .single();
    if (facErr || !facture) return;

    await supabaseAdmin.from("facture_reservations").insert({
      facture_id: facture.id,
      reservation_id: reservationId,
      montant: total,
    });
    return;
  }

  // Déjà figée (numéro) → on ne touche pas
  if (active.numero) return;

  // Encore en brouillon → mise à jour des montants
  await supabaseAdmin
    .from("factures")
    .update({ montant_total: total, montant_paye: paye, montant_restant: reste })
    .eq("id", active.facture_id);

  await supabaseAdmin
    .from("facture_reservations")
    .update({ montant: total })
    .eq("facture_id", active.facture_id)
    .eq("reservation_id", reservationId);
}

// À l'ANNULATION / REFUS : si la facture n'a jamais reçu de numéro, on la supprime
// proprement. Si elle a déjà un numéro (déjà émise), on ne supprime jamais :
// on l'annule sans laisser de trou dans la numérotation.
export async function annulerFactureResa(reservationId: string): Promise<void> {
  const active = await factureActive(reservationId);
  if (!active) return;

  if (!active.numero) {
    await supabaseAdmin.from("facture_reservations").delete().eq("facture_id", active.facture_id);
    await supabaseAdmin.from("factures").delete().eq("id", active.facture_id);
    return;
  }

  await supabaseAdmin.from("factures").update({ statut: "annulee" }).eq("id", active.facture_id);
  await supabaseAdmin
    .from("facture_reservations")
    .update({ facture_annulee: true })
    .eq("facture_id", active.facture_id);
}
