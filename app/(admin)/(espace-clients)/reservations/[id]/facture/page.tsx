import { redirect } from "next/navigation";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { creerOuMajFactureBrouillon } from "@/src/lib/factureResa";

/**
 * Il n'existe qu'UN document de facture : /factures/[id] (avec TVA et QR-facture).
 * Cette route ne rend plus rien, elle amène la facture de la réservation —
 * en créant le brouillon s'il manque encore.
 */
async function idFactureActive(reservationId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("facture_reservations")
    .select("facture_id")
    .eq("reservation_id", reservationId)
    .eq("facture_annulee", false)
    .maybeSingle();
  return data?.facture_id ?? null;
}

export default async function FactureReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerAccesAdmin();
  const { id } = await params;

  let factureId = await idFactureActive(id);
  if (!factureId) {
    await creerOuMajFactureBrouillon(id);
    factureId = await idFactureActive(id);
  }

  redirect(factureId ? `/factures/${factureId}` : `/reservations/${id}`);
}
