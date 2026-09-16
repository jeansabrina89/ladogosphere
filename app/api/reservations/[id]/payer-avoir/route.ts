import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { synchroniserComptaResa } from "@/src/lib/comptaResa";
import { rafraichirPaiementFacture } from "@/src/lib/comptaFacture";
import { recalculerPaiementReservation, recalculerPaiementsDeFacture } from "@/src/lib/paiementReservation";
import { tracerEvenement } from "@/src/lib/journalEvenements";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Auth session
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  // 2. Fiche client liée à la session (RLS : uniquement la sienne — jamais depuis le body)
  const { data: fiche } = await supabase
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!fiche) return NextResponse.json({ error: "Profil client introuvable." }, { status: 403 });

  // 3. Charger la réservation et vérifier l'ownership
  const { id } = await params;
  const { data: reservation } = await supabaseAdmin
    .from("reservations")
    .select("id, client_id")
    .eq("id", id)
    .maybeSingle();

  if (!reservation) return NextResponse.json({ error: "Réservation introuvable." }, { status: 404 });
  if (reservation.client_id !== fiche.id) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  // 4. Paiement atomique via RPC (transaction tout-ou-rien avec verrou)
  const { data: nouveauSolde, error } = await supabaseAdmin.rpc("payer_reservation_avec_avoir", {
    p_reservation_id: id,
    p_client_id: fiche.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Réglé par le client depuis son espace : l'auteur est son compte.
  await tracerEvenement({
    entite: "paiement", entiteId: id, evenement: "paiement_avoir",
    apres: { client_id: fiche.id, nouveau_solde_avoir: nouveauSolde },
    userId: user.id,
  });

  // 5. La RPC a rattaché le paiement à la facture ouverte de la réservation s'il y
  // en a une, sinon à la réservation seule. La pièce touchée se recalcule, puis
  // la réservation se dérive (la RPC n'écrit plus ni payé ni statut).
  const { data: dernier } = await supabaseAdmin
    .from("paiements_resa")
    .select("facture_id")
    .eq("client_id", fiche.id)
    .eq("mode", "avoir")
    .eq("motif", "Paiement par avoir (espace client)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (dernier?.facture_id) {
    await rafraichirPaiementFacture(dernier.facture_id as string, user.id);
    await recalculerPaiementsDeFacture(dernier.facture_id as string);
  } else {
    // Comptabilité de l'acompte : la synchro impute la contrepartie avoir (2035).
    await synchroniserComptaResa(id, new Date().toISOString().split("T")[0]);
  }
  await recalculerPaiementReservation(id);

  return NextResponse.json({ ok: true, nouveauSolde });
}
