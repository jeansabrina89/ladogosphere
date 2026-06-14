import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../src/utils/supabase/server";
import { supabaseAdmin } from "../../../../../src/lib/supabase-admin";
import { recalculerMontantSejour } from "../../../../reservations/[id]/actions";
import { exigerPermissionApi } from "../../../../../src/lib/apiAuth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_reservations_modifier");
  if (garde) return garde;
  const { id } = await params;
  const formData = await req.formData();

  const statut = formData.get("statut") as string;
  const box_id = formData.get("box_id") as string || null;
  const commentaire_admin = formData.get("commentaire_admin") as string || null;
  const heure_arrivee = formData.get("heure_arrivee") as string || null;
  const heure_depart = formData.get("heure_depart") as string || null;
  const urgence = formData.get("urgence") === "on";
  const date_debut = formData.get("date_debut") as string;
  const date_fin = formData.get("date_fin") as string;

  // Tarif urgence : permission supplémentaire requise
  if (urgence) {
    const urgGarde = await exigerPermissionApi(supabase, "perm_tarifs_urgence");
    if (urgGarde) return urgGarde;
  }

  // Valeurs avant modification : pour détecter un changement de
  // date_debut/date_fin/heure_arrivee/heure_depart sur un séjour et
  // déclencher le recalcul de montant_calcule.
  const { data: avant } = await supabaseAdmin
    .from("reservations")
    .select("type_reservation, date_debut, date_fin, heure_arrivee, heure_depart")
    .eq("id", id)
    .single();

  const { error } = await supabaseAdmin
    .from("reservations")
    .update({
      statut,
      box_id,
      commentaire_admin,
      heure_arrivee,
      heure_depart,
      urgence,
      date_debut,
      date_fin,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Séjour : si les dates ou heures changent (typiquement, heures saisies
  // après coup), recalculer montant_calcule par tranche horaire puis
  // re-dériver montant_final / paiement.
  if (avant?.type_reservation === "sejour") {
    const normHeure = (h: string | null) => (h ? h.slice(0, 5) : null);
    const aChange =
      avant.date_debut !== date_debut ||
      avant.date_fin !== date_fin ||
      normHeure(avant.heure_arrivee) !== normHeure(heure_arrivee) ||
      normHeure(avant.heure_depart) !== normHeure(heure_depart);

    if (aChange) {
      await recalculerMontantSejour(id);
    }
  }

  if (box_id) {
    await supabaseAdmin.from("occupation_boxes").delete().eq("reservation_id", id);
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

  return NextResponse.json({ ok: true });
}
