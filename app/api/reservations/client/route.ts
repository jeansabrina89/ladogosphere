import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { envoyerEmailConfirmationDemande } from "@/src/lib/email";
import { estMembreActif, reservationAutorisee, MESSAGE_ADHESION_REQUISE } from "@/src/lib/membre";
import { verifierSelectionChiens } from "@/src/lib/journeeEssai";

export async function POST(req: NextRequest) {
  const supabaseServer = await createSupabaseServerClient();

  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  // Récupérer la fiche client liée à la session (RLS : uniquement la sienne)
  const { data: fiche, error: ficheErr } = await supabaseServer
    .from("clients")
    .select("id, email, prenom, cotisation_exemptee")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (ficheErr) return NextResponse.json({ error: ficheErr.message }, { status: 500 });
  if (!fiche) return NextResponse.json({ error: "Profil client introuvable." }, { status: 403 });

  const formData = await req.formData();

  const type_reservation = formData.get("type_reservation") as string;
  const date_debut = formData.get("date_debut") as string;
  const date_fin = formData.get("date_fin") as string;
  const heure_arrivee = formData.get("heure_arrivee") as string || null;
  const heure_depart = formData.get("heure_depart") as string || null;
  const commentaire_client = formData.get("commentaire_client") as string || null;
  const chien_ids = formData.getAll("chien_ids") as string[];

  if (!date_debut || !date_fin) {
    return NextResponse.json({ error: "Données manquantes." }, { status: 400 });
  }

  if (chien_ids.length === 0) {
    return NextResponse.json({ error: "Veuillez sélectionner au moins un chien." }, { status: 400 });
  }

  // Vérifier que les chiens appartiennent bien à la fiche client connectée
  const { data: chiensOwned, error: chiensErr } = await supabaseServer
    .from("chiens")
    .select("id, nom, statut_essai")
    .eq("client_id", fiche.id)
    .in("id", chien_ids);

  if (chiensErr) return NextResponse.json({ error: chiensErr.message }, { status: 500 });
  if (!chiensOwned || chiensOwned.length !== chien_ids.length) {
    return NextResponse.json({ error: "Chien(s) invalide(s)." }, { status: 403 });
  }

  // Règle de la journée d'essai, CHIEN PAR CHIEN (cf. src/lib/journeeEssai.ts).
  const verdict = verifierSelectionChiens(
    chiensOwned as { nom: string; statut_essai: string | null }[],
    type_reservation
  );
  if (!verdict.ok) return NextResponse.json({ error: verdict.message }, { status: 400 });

  // Adhésion obligatoire pour réserver (sauf essai ou client exempté).
  if (type_reservation !== "essai") {
    const estMembre = await estMembreActif(supabaseAdmin, fiche.id, date_debut);
    if (!reservationAutorisee({
      estMembre,
      estExempte: !!(fiche as { cotisation_exemptee?: boolean }).cotisation_exemptee,
      typeReservation: type_reservation,
    })) {
      return NextResponse.json({ error: MESSAGE_ADHESION_REQUISE }, { status: 400 });
    }
  }

  // Écriture via le client service-role (le client n'a que SELECT en RLS)
  const { data: reservation, error } = await supabaseAdmin
    .from("reservations")
    .insert({
      client_id: fiche.id,
      type_reservation,
      date_debut,
      date_fin,
      heure_arrivee,
      heure_depart,
      statut: "en_attente",
      commentaire_admin: commentaire_client,
      urgence: false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Lier les chiens
  const { error: errorChiens } = await supabaseAdmin.from("reservation_chiens").insert(
    chien_ids.map(chien_id => ({ reservation_id: reservation.id, chien_id }))
  );
  if (errorChiens) return NextResponse.json({ error: errorChiens.message }, { status: 500 });

  // Envoyer email de confirmation au client
  try {
    if (fiche.email) {
      await envoyerEmailConfirmationDemande({
        email: fiche.email,
        prenom: fiche.prenom || "Client",
        date_debut,
        date_fin,
        type: type_reservation,
      });
    }
  } catch (emailError) {
    console.error("Erreur envoi email:", emailError);
  }

  return NextResponse.json({ id: reservation.id });
}
