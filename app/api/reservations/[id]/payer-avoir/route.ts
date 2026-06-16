import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../src/lib/supabase-server";
import { supabaseAdmin } from "../../../../../src/lib/supabase-admin";

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

  return NextResponse.json({ ok: true, nouveauSolde });
}
