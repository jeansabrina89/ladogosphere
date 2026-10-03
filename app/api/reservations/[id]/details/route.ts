import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import { lireCohabitationChiens } from "@/src/lib/cohabitationDb";
import { boxSeulProposable } from "@/src/lib/cohabitation";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const perms = await getProfilePerms();

  const { data: reservation } = await supabase
    .from("reservations")
    .select(`
      *,
      clients (prenom, nom, membre),
      boxes (numero, nom),
      reservation_chiens (
        chien_id,
        chiens (id, nom, race)
      )
    `)
    .eq("id", id)
    .single();

  const { data: boxes } = await supabase
    .from("boxes")
    .select("id, numero, nom")
    .eq("actif", true)
    .order("numero");

  // APP 74 — la case « chien seul dans un box » se propose-t-elle ? Le même
  // calcul que la fiche et que le serveur qui l'enregistrera.
  const chienIds = ((reservation?.reservation_chiens ?? []) as { chien_id: string }[]).map((rc) => rc.chien_id);
  const caseBoxSeul = reservation
    ? boxSeulProposable({
        type_reservation: reservation.type_reservation,
        selection: await lireCohabitationChiens(chienIds),
      })
    : false;

  return NextResponse.json({
    reservation, boxes, peutUrgence: perms.perm_tarifs_urgence, boxSeulProposable: caseBoxSeul,
  });
}
