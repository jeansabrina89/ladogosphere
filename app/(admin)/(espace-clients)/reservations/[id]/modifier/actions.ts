"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { getAvoirAppliqueReservation } from "@/src/lib/avoirs";
import { synchroniserComptaResa } from "@/src/lib/comptaResa";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import {
  EVENEMENT_REQUALIFICATION,
  refusRequalification,
  typeSejour,
} from "@/src/lib/typeSejour";

export async function modifierReservation(id: string, formData: FormData) {
  const verif = await verifierPermission("perm_reservations_modifier");
  if (verif.error) throw new Error(verif.error);

  const statut = formData.get("statut") as string;
  const box_id = formData.get("box_id") as string || null;
  const commentaire_admin = formData.get("commentaire_admin") as string || null;
  const heure_arrivee = formData.get("heure_arrivee") as string || null;
  const heure_depart = formData.get("heure_depart") as string || null;
  const urgence = formData.get("urgence") === "on";
  const date_debut = formData.get("date_debut") as string;
  const date_fin = formData.get("date_fin") as string;

  // ── Requalification du type de séjour ──────────────────────────────────
  //
  // Ce n'est pas une correction de saisie : changer de type déplace des
  // montants hors du chiffre d'affaires, ou les y ramène. Motif obligatoire,
  // trace au journal.
  const { data: avant } = await supabaseAdmin
    .from("reservations").select("type_sejour, numero").eq("id", id).maybeSingle();

  const typeAvant = typeSejour(avant?.type_sejour as string | undefined);
  const typeApres = typeSejour(formData.get("type_sejour") as string);
  const motifType = String(formData.get("motif_type_sejour") ?? "").trim();

  const refusType = refusRequalification({
    avant: typeAvant,
    apres: typeApres,
    motif: motifType,
    peutTarifsUrgence: (await verifierPermission("perm_tarifs_urgence")).error === undefined,
  });
  if (refusType) throw new Error(refusType);

  const { error } = await supabaseAdmin
    .from("reservations")
    .update({
      statut,
      box_id,
      commentaire_admin,
      heure_arrivee,
      heure_depart,
      urgence,
      type_sejour: typeApres,
      date_debut,
      date_fin,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  // La trace ne part qu'APRÈS l'écriture, et seulement si le type a bougé :
  // un journal qui note des non-changements ne se lit plus.
  if (typeAvant !== typeApres) {
    await tracerEvenement({
      entite: "reservation",
      entiteId: id,
      evenement: EVENEMENT_REQUALIFICATION,
      avant: { type_sejour: typeAvant },
      apres: { type_sejour: typeApres, numero: avant?.numero ?? null },
      motif: motifType,
      userId: verif.userId ?? null,
    });
  }

  // Mettre à jour les occupations de boxes
  if (box_id) {
    await supabaseAdmin
      .from("occupation_boxes")
      .delete()
      .eq("reservation_id", id);

    // Récupérer les chiens de la réservation
    const { data: resChiens } = await supabaseAdmin
      .from("reservation_chiens")
      .select("chien_id")
      .eq("reservation_id", id);

    if (resChiens && resChiens.length > 0) {
      await supabaseAdmin.from("occupation_boxes").insert(
        resChiens.map((rc: any) => ({
          box_id,
          chien_id: rc.chien_id,
          reservation_id: id,
          date_debut,
          date_fin,
        }))
      );
    }
  }

  // Mettre à jour checkin_checkout
  await supabaseAdmin
    .from("checkin_checkout")
    .update({
      date_arrivee_prevue: heure_arrivee
        ? `${date_debut}T${heure_arrivee}:00`
        : `${date_debut}T09:00:00`,
      date_depart_prevu: heure_depart
        ? `${date_fin}T${heure_depart}:00`
        : `${date_fin}T17:00:00`,
    })
    .eq("reservation_id", id);

  redirect(`/reservations/${id}`);
}

export async function annulerReservation(formData: FormData) {
  const verif = await verifierPermission("perm_reservations_annuler");
  if (verif.error) throw new Error(verif.error);

  const id = formData.get("id") as string;
  const client_id = (formData.get("client_id") as string) || null;
  const mettreEnAvoir = formData.get("mettre_en_avoir") === "true";

  // Charger l'état de paiement
  const { data: resa } = await supabaseAdmin
    .from("reservations")
    .select("montant_paye, numero")
    .eq("id", id)
    .single();
  const montantPaye = Number(resa?.montant_paye || 0);

  // Si demandé : mettre le montant payé en avoir AVANT d'annuler
  if (mettreEnAvoir && montantPaye > 0 && client_id) {
    const dateAnnul = new Date().toISOString().split("T")[0];
    // a) restituer l'avoir éventuellement consommé sur cette résa
    const avoirApplique = await getAvoirAppliqueReservation(supabaseAdmin, client_id, id);
    if (avoirApplique > 0) {
      const { error: e1 } = await supabaseAdmin.from("avoirs_mouvements").insert({
        client_id,
        montant: avoirApplique,
        type: "reprise",
        motif: `Reprise avoir (annulation résa #${resa?.numero ?? id})`,
        reservation_id: id,
        created_by: verif.userId ?? null,
      });
      if (e1) throw new Error(e1.message);
      await supabaseAdmin.from("paiements_resa").insert({
        reservation_id: id,
        client_id,
        date_paiement: dateAnnul,
        mode: "avoir",
        montant: -avoirApplique,
        motif: `Reprise avoir (annulation résa #${resa?.numero ?? id})`,
        created_by: verif.userId ?? null,
      });
    }
    // b) mettre la partie cash (non-avoir) en avoir
    const cashPaye = Math.max(0, montantPaye - avoirApplique);
    if (cashPaye > 0) {
      const { error: e2 } = await supabaseAdmin.from("avoirs_mouvements").insert({
        client_id,
        montant: cashPaye,
        type: "mise_en_avoir",
        motif: `Mise en avoir (annulation résa #${resa?.numero ?? id})`,
        reservation_id: id,
        created_by: verif.userId ?? null,
      });
      if (e2) throw new Error(e2.message);
      await supabaseAdmin.from("paiements_resa").insert({
        reservation_id: id,
        client_id,
        date_paiement: dateAnnul,
        mode: "avoir",
        montant: -cashPaye,
        motif: `Mise en avoir (annulation résa #${resa?.numero ?? id})`,
        created_by: verif.userId ?? null,
      });
    }
    // c) remettre le paiement à zéro sur la résa
    const { error: e3 } = await supabaseAdmin
      .from("reservations")
      .update({ montant_paye: 0, statut_paiement: "impaye", mode_paiement: null, date_paiement: null })
      .eq("id", id);
    if (e3) throw new Error(e3.message);
  }

  // Annuler la réservation
  const { error } = await supabaseAdmin
    .from("reservations")
    .update({ statut: "annulee" })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await supabaseAdmin.from("occupation_boxes").delete().eq("reservation_id", id);

  await synchroniserComptaResa(id);

  redirect(`/reservations/${id}`);
}
