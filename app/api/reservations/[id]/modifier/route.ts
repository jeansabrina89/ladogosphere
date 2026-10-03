import { NextRequest, NextResponse } from "next/server";
import { lireCorpsFormulaire } from "@/src/lib/corpsRequete";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { definirBoxSeul, recalculerMontantSejour } from "@/app/(admin)/(espace-clients)/reservations/[id]/actions";
import {
  EVENEMENT_REQUALIFICATION,
  champsTypeSejour,
  refusRequalification,
  typeSejour,
} from "@/src/lib/typeSejour";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { bornesCheckin, heuresCheckinParDefaut } from "@/src/lib/lignesCheckinLogique";
import { lireHoraires } from "@/src/lib/horairesServeur";
import { ecartModificationReservation } from "@/src/lib/journalLogique";
import { idUtilisateurCourant } from "@/src/lib/permissions";
import { exigerPermissionApi } from "@/src/lib/apiAuth";
import { conflitPlacement, deplacerOccupations } from "@/src/lib/placementBox";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_reservations_modifier");
  if (garde) return garde;
  const { id } = await params;
  const lecture = await lireCorpsFormulaire(req);
  if (!lecture.ok) return lecture.reponse;
  const formData = lecture.corps;

  const statut = formData.get("statut") as string;

  // Cette route écrit un mot, rien de plus. « Annulée » demande un avoir rendu,
  // une écriture comptable et un box libéré — tout cela vit dans
  // `annulerReservation`, derrière `perm_reservations_annuler`.
  //
  // Le refus vaut pour TOUT LE MONDE, administratrice comprise : ce n'est pas
  // une question de permission mais de conséquence. Une réservation marquée
  // annulée sans l'être est pire qu'une annulation refusée.
  if (statut === "annulee") {
    return NextResponse.json(
      { error: "Une annulation passe par le bouton « Annuler la réservation » : elle rend l'avoir et libère le box." },
      { status: 400 },
    );
  }
  const box_id = formData.get("box_id") as string || null;
  const commentaire_admin = formData.get("commentaire_admin") as string || null;
  const heure_arrivee = formData.get("heure_arrivee") as string || null;
  const heure_depart = formData.get("heure_depart") as string || null;
  const date_debut = formData.get("date_debut") as string;
  const date_fin = formData.get("date_fin") as string;
  const typeApres = typeSejour(formData.get("type_sejour") as string);
  const motifType = String(formData.get("motif_type_sejour") ?? "").trim();

  // Valeurs avant modification : pour détecter un changement de
  // date_debut/date_fin/heure_arrivee/heure_depart sur un séjour et
  // déclencher le recalcul de montant_calcule.
  const { data: avant } = await supabaseAdmin
    .from("reservations")
    .select("type_reservation, date_debut, date_fin, heure_arrivee, heure_depart, type_sejour, numero, statut, box_id, commentaire_admin, box_seul")
    .eq("id", id)
    .single();

  // Requalifier n'est pas corriger une saisie : le type décide de ce qui
  // entre dans le chiffre d'affaires. Motif obligatoire, trace au journal.
  const typeAvant = typeSejour(avant?.type_sejour as string | undefined);
  const refusType = refusRequalification({
    avant: typeAvant, apres: typeApres, motif: motifType,
    peutTarifsUrgence: !(await exigerPermissionApi(supabase, "perm_tarifs_urgence")),
  });
  if (refusType) return NextResponse.json({ error: refusType }, { status: 400 });

  const champBoxSeul = formData.get("box_seul");
  const boxSeulAvant = avant?.box_seul === true;
  const boxSeulApres = champBoxSeul === "on" ? true : champBoxSeul === "off" ? false : boxSeulAvant;

  /*
   * APP 73 (point 19) — TOUT OU RIEN.
   *
   * 1. La place d'abord, SANS RIEN ÉCRIRE : le box est-il libre pour ces dates,
   *    avec la case « box seul » telle qu'elle sera ? Même règle que le filet
   *    en base. Refus → la réservation reste exactement comme avant.
   */
  if (box_id) {
    const conflit = await conflitPlacement({
      reservationId: id, boxId: box_id, dateDebut: date_debut, dateFin: date_fin, boxSeul: boxSeulApres,
    });
    if (conflit) return NextResponse.json({ error: conflit }, { status: 409 });
  }

  // 2. APP 74 — « chien seul dans un box », avant le déplacement : le filet en
  //    base lit la case sur la réservation. Ses refus (facture émise, plusieurs
  //    chiens, essai) n'écrivent rien. Même chemin que la case de la fiche :
  //    journal et recalcul.
  if (boxSeulApres !== boxSeulAvant) {
    const r = await definirBoxSeul(id, boxSeulApres);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
  }

  // 3. Le déplacement. Si la base refuse quand même (une écriture passée entre
  //    la vérification et maintenant), l'ancienne place est remise ligne pour
  //    ligne, la case reprend sa valeur, et RIEN d'autre n'a été écrit.
  if (box_id) {
    const deplacement = await deplacerOccupations({
      reservationId: id, boxId: box_id, dateDebut: date_debut, dateFin: date_fin,
    });
    if (deplacement.erreur) {
      if (boxSeulApres !== boxSeulAvant) await definirBoxSeul(id, boxSeulAvant);
      return NextResponse.json({ error: deplacement.erreur }, { status: 409 });
    }
  }

  const { error } = await supabaseAdmin
    .from("reservations")
    .update({
      statut,
      box_id,
      commentaire_admin,
      heure_arrivee,
      heure_depart,
      // Requalifier déplace aussi le tarif : la case dérivée suit le type.
      ...champsTypeSejour(typeApres),
      date_debut,
      date_fin,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const auteur = await idUtilisateurCourant();

  // Dates, box, heures, statut, commentaire : ce qui a bougé, et rien d'autre.
  const change = ecartModificationReservation(avant as Record<string, unknown> | null, {
    statut, box_id, commentaire_admin, heure_arrivee, heure_depart, date_debut, date_fin,
  });
  if (change) {
    await tracerEvenement({
      entite: "reservation", entiteId: id, evenement: "modification",
      avant: change.avant, apres: change.apres,
      userId: auteur,
    });
  }

  if (typeAvant !== typeApres) {
    await tracerEvenement({
      entite: "reservation", entiteId: id, evenement: EVENEMENT_REQUALIFICATION,
      avant: { type_sejour: typeAvant },
      apres: { type_sejour: typeApres, numero: avant?.numero ?? null },
      motif: motifType,
      userId: auteur,
    });
  }

  // Séjour : si les dates ou heures changent (typiquement, heures saisies
  // après coup), ou si le TYPE change, recalculer montant_calcule puis
  // re-dériver montant_final / paiement. Requalifier déplace le tarif :
  // laisser l'ancien montant en place ferait mentir la requalification.
  if (avant?.type_reservation === "sejour") {
    const normHeure = (h: string | null) => (h ? h.slice(0, 5) : null);
    const aChange =
      avant.date_debut !== date_debut ||
      avant.date_fin !== date_fin ||
      normHeure(avant.heure_arrivee) !== normHeure(heure_arrivee) ||
      normHeure(avant.heure_depart) !== normHeure(heure_depart) ||
      typeAvant !== typeApres;

    if (aChange) {
      await recalculerMontantSejour(id);
    }
  }

  await supabaseAdmin
    .from("checkin_checkout")
    .update({
      // Sans heure : le réglage « séjour », par LA fonction du check-in (APP 64).
      ...bornesCheckin(
        { date_debut, date_fin, heure_arrivee, heure_depart },
        heuresCheckinParDefaut((await lireHoraires()).sejour),
      ),
    })
    .eq("reservation_id", id);

  return NextResponse.json({ ok: true });
}
