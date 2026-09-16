import { NextRequest, NextResponse } from "next/server";
import { lireCorpsJson } from "@/src/lib/corpsRequete";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { envoyerEmailPaiement, envoyerEmailSatisfactionEssai } from "@/src/lib/email";
import { getCoordonneesPaiement } from "@/src/lib/coordonneesPaiement";
import { exigerPersonnel } from "@/src/lib/apiAuth";
import { recalculerPaiementReservation } from "@/src/lib/paiementReservation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;
  const { id } = await params;
  const lecture = await lireCorpsJson(req);
  if (!lecture.ok) return lecture.reponse;
  const { type } = lecture.corps;

  const { data: res } = await supabase
    .from("reservations")
    .select(`
      *,
      clients (prenom, email),
      reservation_chiens (chiens (nom))
    `)
    .eq("id", id)
    .single();

  if (!res) return NextResponse.json({ error: "Réservation introuvable" }, { status: 404 });

  const prenom = res.clients?.prenom || "Client";
  const email = res.clients?.email;
  if (!email) return NextResponse.json({ error: "Email client manquant" }, { status: 400 });

  try {
    if (type === "paiement") {
      // Le reste à payer DÉRIVÉ des factures : une facture payée n'appelle
      // aucune demande, et la demande porte sur ce qui reste, pas sur le prix.
      const derive = await recalculerPaiementReservation(id);
      if (!derive || derive.reste <= 0) {
        return NextResponse.json({ error: "La réservation est déjà payée" }, { status: 400 });
      }
      const coords = await getCoordonneesPaiement(supabaseAdmin);
      await envoyerEmailPaiement({
        email,
        prenom,
        montant: derive.reste,
        date_debut: res.date_debut,
        date_fin: res.date_fin,
        type: res.type_reservation,
        iban: coords.iban,
        titulaire: coords.titulaire,
      });
    }

    if (type === "satisfaction_essai") {
      // Seulement pour les journées d'essai
      if (res.type_reservation !== "essai") {
        return NextResponse.json({ error: "Uniquement pour les journées d'essai" }, { status: 400 });
      }
      const nom_chien = res.reservation_chiens?.[0]?.chiens?.nom || "votre chien";
      await envoyerEmailSatisfactionEssai({ email, prenom, nom_chien });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}