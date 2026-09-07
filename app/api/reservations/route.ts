import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerPermissionApi } from "@/src/lib/apiAuth";
import { verifierChiensPourReservation, marquerChiensEssaiProgramme, etatJourneeEssai } from "@/src/lib/essaiReservation";
import { heureCourte, MESSAGE_DATE_ESSAI_PRISE } from "@/src/lib/journeeEssai";
import { assurerLignesCheckin } from "@/src/lib/lignesCheckin";
import { assurerMontantCalcule } from "@/src/lib/prixReservation";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_reservations_creer");
  if (garde) return garde;
  const formData = await req.formData();

  const client_id = formData.get("client_id") as string;
  const box_id = formData.get("box_id") as string;
  const type_reservation = formData.get("type_reservation") as string;
  const date_debut = formData.get("date_debut") as string;
  const date_fin = formData.get("date_fin") as string;
  const heure_arrivee = formData.get("heure_arrivee") as string || null;
  const heure_depart = formData.get("heure_depart") as string || null;
  const urgence = formData.get("urgence") === "on";
  const statut = formData.get("statut") as string;
  const commentaire_admin = formData.get("commentaire_admin") as string || null;
  const chien_ids = formData.getAll("chien_ids") as string[];

  // Tarif urgence : permission supplémentaire requise
  if (urgence) {
    const urgGarde = await exigerPermissionApi(supabase, "perm_tarifs_urgence");
    if (urgGarde) return urgGarde;
  }

  // Règle de la journée d'essai, chien par chien. Le personnel peut passer
  // outre avec « forcer » + une raison, qui est journalisée dans la réservation.
  const forcer = formData.get("forcer") === "on";
  const forcer_raison = (formData.get("forcer_raison") as string) || null;
  if (chien_ids.length > 0 && !forcer) {
    const refus = await verifierChiensPourReservation(chien_ids, type_reservation);
    if (refus) return NextResponse.json({ error: refus }, { status: 400 });
  }
  if (forcer && !forcer_raison?.trim()) {
    return NextResponse.json(
      { error: "Indiquez la raison du passage outre de la journée d'essai." },
      { status: 400 }
    );
  }

  // Une seule journée d'essai par jour. Seul l'ADMIN peut en forcer une seconde,
  // sur un créneau libre (09:30, 10:30 ou 11:00) — jamais un employé, même avec
  // perm_reservations_creer.
  let essai_force_heure: string | null = null;
  if (type_reservation === "essai") {
    const etat = await etatJourneeEssai(date_debut);
    if (!etat.disponible) {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profil } = await supabaseAdmin
        .from("profiles").select("role").eq("id", user?.id ?? "").maybeSingle();
      const estAdmin = profil?.role === "admin";

      const forcerEssai = formData.get("forcer_essai") === "on";
      const heureForcee = heureCourte(formData.get("forcer_essai_heure") as string);

      if (!estAdmin) {
        return NextResponse.json({ error: MESSAGE_DATE_ESSAI_PRISE }, { status: 400 });
      }
      if (!forcerEssai) {
        return NextResponse.json({ error: MESSAGE_DATE_ESSAI_PRISE }, { status: 400 });
      }
      if (!heureForcee || !etat.creneauxLibres.includes(heureForcee)) {
        return NextResponse.json(
          {
            error: etat.creneauxLibres.length
              ? `Choisissez un créneau libre : ${etat.creneauxLibres.join(", ")}.`
              : "Plus aucun créneau disponible ce jour-là pour une journée d'essai.",
          },
          { status: 400 }
        );
      }
      essai_force_heure = heureForcee;
    }
  }

  // Créer la réservation
  const { data: reservation, error } = await supabaseAdmin
    .from("reservations")
    .insert({
      client_id,
      box_id,
      type_reservation,
      date_debut,
      date_fin,
      heure_arrivee: essai_force_heure ?? heure_arrivee,
      heure_depart,
      urgence,
      statut,
      commentaire_admin,
      essai_force: forcer || !!essai_force_heure,
      essai_force_raison: forcer ? forcer_raison!.trim() : (essai_force_heure ? "Seconde journée d'essai forcée" : null),
      essai_force_heure,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (chien_ids.length > 0) {
    // Lier les chiens à la réservation
    await supabaseAdmin.from("reservation_chiens").insert(
      chien_ids.map(chien_id => ({ reservation_id: reservation.id, chien_id }))
    );

    // Créer les occupations de box
    await supabaseAdmin.from("occupation_boxes").insert(
      chien_ids.map(chien_id => ({
        box_id,
        chien_id,
        reservation_id: reservation.id,
        date_debut,
        date_fin,
      }))
    );

    // Lignes de check-in — couche métier commune à tous les chemins.
    await assurerLignesCheckin(reservation.id);

    // Une réservation créée directement « Validée » doit porter son prix : le
    // calcul ne peut pas attendre un passage par /statut qui n'aura pas lieu.
    if (statut === "validee") {
      const { data: { user } } = await supabase.auth.getUser();
      const prix = await assurerMontantCalcule(reservation.id, user?.id ?? null);
      if (prix.erreur) {
        // On ne laisse pas une réservation validée à 0 CHF : elle repasse en
        // attente et l'erreur est affichée au lieu d'être avalée.
        await supabaseAdmin
          .from("reservations")
          .update({ statut: "en_attente" })
          .eq("id", reservation.id);
        return NextResponse.json(
          {
            error: `Le prix n'a pas pu être calculé : ${prix.erreur} La réservation reste en attente.`,
          },
          { status: 400 }
        );
      }
      // Essai créé directement validé : les chiens passent à 'programme'.
      await marquerChiensEssaiProgramme(reservation.id);
    }
  }

  return NextResponse.json({ id: reservation.id });
}
