import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../src/lib/supabase-server";
import { supabaseAdmin } from "../../../../src/lib/supabase-admin";
import { envoyerEmailConfirmationDemande } from "../../../../src/lib/email";

export async function POST(req: NextRequest) {
  const supabaseServer = await createSupabaseServerClient();

  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  // Récupérer la fiche client liée à la session (RLS : uniquement la sienne)
  const { data: fiche, error: ficheErr } = await supabaseServer
    .from("clients")
    .select("id, email, prenom")
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

  // Chien refusé → blocage systématique
  const chiensRefuses = chiensOwned.filter((c: any) => c.statut_essai === 'refuse');
  if (chiensRefuses.length > 0) {
    const nom = chiensRefuses[0].nom;
    return NextResponse.json({
      error: `${nom} n'a pas été accepté à l'issue de sa journée d'essai et ne peut donc pas faire l'objet d'une réservation. N'hésitez pas à nous contacter pour plus d'informations ou pour envisager une nouvelle journée d'essai.`,
    }, { status: 400 });
  }

  if (type_reservation === 'essai') {
    // Essai inutile si tous les chiens sont déjà validés
    const tousValides = chiensOwned.every((c: any) => c.statut_essai === 'valide');
    if (tousValides) {
      return NextResponse.json({
        error: "Tous vos chiens ont déjà validé leur journée d'essai. Veuillez choisir 'Journée' ou 'Séjour'.",
      }, { status: 400 });
    }
  } else {
    // Journée ou séjour : tous les chiens doivent être validés
    const chiensNonValides = chiensOwned.filter((c: any) => c.statut_essai !== 'valide');
    if (chiensNonValides.length > 0) {
      const noms = chiensNonValides.map((c: any) => c.nom).join(", ");
      return NextResponse.json({
        error: `${noms} ${chiensNonValides.length > 1 ? "doivent" : "doit"} d'abord valider ${chiensNonValides.length > 1 ? "leur" : "sa"} journée d'essai avant de pouvoir réserver une journée ou un séjour.`,
      }, { status: 400 });
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
