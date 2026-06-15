import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../src/lib/supabase-server";
import { supabaseAdmin } from "../../../../../src/lib/supabase-admin";
import { getSoldeAvoir } from "../../../../../src/lib/avoirs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Auth session
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  // 2. Fiche client liée à la session (RLS : uniquement la sienne)
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
    .select("id, client_id, statut, statut_paiement, montant_final, montant_calcule, montant_paye, numero")
    .eq("id", id)
    .maybeSingle();

  if (!reservation) return NextResponse.json({ error: "Réservation introuvable." }, { status: 404 });
  if (reservation.client_id !== fiche.id) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  if (!["validee", "terminee"].includes(reservation.statut)) {
    return NextResponse.json({ error: "Cette réservation n'est pas payable." }, { status: 400 });
  }
  if (reservation.statut_paiement === "paye") {
    return NextResponse.json({ error: "Cette réservation est déjà payée." }, { status: 400 });
  }

  // 4. Montant dû (même formule que le reste de l'app)
  const total = Number(reservation.montant_final ?? reservation.montant_calcule ?? 0);
  const dejaPaye = Number(reservation.montant_paye ?? 0);
  const montantDu = Math.round((total - dejaPaye) * 100) / 100;
  if (montantDu <= 0) return NextResponse.json({ error: "Aucun montant à payer." }, { status: 400 });

  // 5. Solde avoir (même logique que appliquerAvoir côté admin)
  const solde = await getSoldeAvoir(supabaseAdmin, fiche.id);
  if (solde < montantDu) {
    return NextResponse.json({
      error: `Solde d'avoir insuffisant (disponible : CHF ${solde.toFixed(2)}, requis : CHF ${montantDu.toFixed(2)}).`,
    }, { status: 400 });
  }

  // 6. Mouvement de débit d'avoir (miroir de appliquerAvoir, type "utilisation")
  const { error: insErr } = await supabaseAdmin.from("avoirs_mouvements").insert({
    client_id: fiche.id,
    montant: -montantDu,
    type: "utilisation",
    motif: `Paiement réservation #${reservation.numero}`,
    reservation_id: id,
  });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // 7. Passer la réservation en payée
  const { error: updErr } = await supabaseAdmin
    .from("reservations")
    .update({
      montant_paye: total,
      statut_paiement: "paye",
      mode_paiement: "avoir",
      date_paiement: new Date().toISOString().split("T")[0],
    })
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
