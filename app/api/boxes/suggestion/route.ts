import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatBoxLabel } from "@/src/lib/boxes";
import { occupationEnConflit, boxCompatibleAvecIsolement, memeFamille, capaciteMaxFamille } from "@/src/lib/disponibilite-box";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { chien_ids, date_debut, date_fin, heure_arrivee, heure_depart, type_reservation } = await req.json();

  if (!chien_ids?.length || !date_debut || !date_fin) {
    return NextResponse.json({ box_id: null, raison: null });
  }

  // 1. Trouver les boxes occupés sur ces dates
  const { data: occupationsRaw } = await supabase
    .from("occupation_boxes")
    .select("box_id, chien_id, date_debut, date_fin, reservations (heure_arrivee, heure_depart, type_reservation), chiens (doit_etre_isole, client_id, categorie_poids)")
    .lte("date_debut", date_fin)
    .gte("date_fin", date_debut);

  // Le(s) chien(s) à placer doivent-ils être isolés (box seul) ?
  const { data: chiensAPlacerInfo } = await supabase
    .from("chiens")
    .select("id, doit_etre_isole, client_id, categorie_poids")
    .in("id", chien_ids);
  const placementIsole = (chiensAPlacerInfo ?? []).some((c: any) => c.doit_etre_isole);

  // « Même famille » = même client_id pour tous les chiens de la réservation.
  const clientIdFamille =
    chiensAPlacerInfo && chiensAPlacerInfo.length > 0 &&
    chiensAPlacerInfo.every((c: any) => c.client_id === chiensAPlacerInfo[0].client_id)
      ? chiensAPlacerInfo[0].client_id
      : null;

  // Capacité d'un box pour y placer les chien_ids : capacité standard, sauf
  // si le box est vide ou occupé uniquement par la même famille, auquel cas
  // la famille peut être regroupée (jusqu'à 3, ou 4 si tous petits gabarits).
  const capaciteBox = (box: any, occupantsBox: any[]): number => {
    const occupantsAutreFamille = occupantsBox.filter(
      (o: any) => !memeFamille(clientIdFamille, o.chiens?.client_id)
    );
    if (clientIdFamille && occupantsAutreFamille.length === 0) {
      return capaciteMaxFamille([
        ...(chiensAPlacerInfo ?? []).map((c: any) => c.categorie_poids),
        ...occupantsBox.map((o: any) => o.chiens?.categorie_poids),
      ]);
    }
    return box.capacite_standard || 2;
  };

  // Exclut les occupations dont le seul jour de chevauchement est une transition
  // autorisée (départ/arrivée le même jour, créneaux compatibles, arrivée pas
  // de type 'journee') — ne s'applique que si les horaires/type de la nouvelle
  // réservation sont fournis (côté client).
  const boxesOccupes = (occupationsRaw ?? []).filter((occ: any) =>
    occupationEnConflit(
      {
        date_debut: occ.date_debut,
        date_fin: occ.date_fin,
        heure_arrivee: occ.reservations?.heure_arrivee,
        heure_depart: occ.reservations?.heure_depart,
        type_reservation: occ.reservations?.type_reservation,
      },
      { date_debut, date_fin, heure_arrivee, heure_depart, type_reservation }
    )
  );

  // 2. Chercher les ententes box_compatible pour chaque chien
  const { data: ententes } = await supabase
    .from("ententes_chiens")
    .select("chien_id, chien_cible_id, type")
    .in("chien_id", chien_ids)
    .eq("type", "box_compatible");

  // Aussi chercher dans l'autre sens
  const { data: ententesinverses } = await supabase
    .from("ententes_chiens")
    .select("chien_id, chien_cible_id, type")
    .in("chien_cible_id", chien_ids)
    .eq("type", "box_compatible");

  const tousAmis = [
    ...(ententes || []).map(e => e.chien_cible_id),
    ...(ententesinverses || []).map(e => e.chien_id),
  ];

  // 3. Chercher les boxes actifs
  const { data: boxesActifs } = await supabase
    .from("boxes")
    .select("id, numero, nom, capacite_standard")
    .eq("actif", true)
    .order("numero");

  // Exclure les box indisponibles sur la période demandée (lecture admin : RLS admin-only)
  const { data: indisponibilites } = await supabaseAdmin
    .from("box_indisponibilites")
    .select("box_id")
    .lte("date_debut", date_fin)
    .gte("date_fin", date_debut);
  const boxesIndisponibles = new Set((indisponibilites ?? []).map(i => i.box_id));

  const tousBoxes = (boxesActifs ?? []).filter(box => !boxesIndisponibles.has(box.id));

  if (!tousBoxes.length) return NextResponse.json({ box_id: null, raison: null });

  // Exclusivité "doit être isolé" : un box occupé par un chien isolé est
  // indisponible pour tout le monde, et un chien isolé exige un box vide.
  const boxesUtilisables = tousBoxes.filter(box => {
    const occupantsBox = boxesOccupes.filter((o: any) => o.box_id === box.id);
    const occupantIsole = occupantsBox.some((o: any) => o.chiens?.doit_etre_isole);
    return boxCompatibleAvecIsolement(occupantIsole, occupantsBox.length, placementIsole);
  });

  // 4. Pour chaque box, compter les occupants et vérifier les amis
  for (const box of boxesUtilisables) {
    const occupantsBox = boxesOccupes.filter(o => o.box_id === box.id);
    const chiensDansBox = occupantsBox.map(o => o.chien_id);
    const capacite = capaciteBox(box, occupantsBox);

    // Vérifier si un ami box_compatible est dans ce box
    const amiDansBox = chiensDansBox.some(id => tousAmis.includes(id));

    // Vérifier si le box a de la place
    const placeDispo = chiensDansBox.length + chien_ids.length <= capacite;

    if (amiDansBox && placeDispo) {
      return NextResponse.json({
        box_id: box.id,
        raison: "box_compatible",
        message: `🏠 Un ami compatible est dans le ${formatBoxLabel(box)}`
      });
    }
  }

  // 5. Pas d'ami trouvé → chercher un box vide
  for (const box of boxesUtilisables) {
    const occupantsBox = boxesOccupes.filter(o => o.box_id === box.id);
    if (occupantsBox.length === 0) {
      return NextResponse.json({
        box_id: box.id,
        raison: "vide",
        message: `✅ ${formatBoxLabel(box)} disponible`
      });
    }
  }

  // 6. Chercher un box avec un ami "ok"
  const { data: entendesOk } = await supabase
    .from("ententes_chiens")
    .select("chien_id, chien_cible_id")
    .in("chien_id", chien_ids)
    .eq("type", "ok");

  const amisOk = (entendesOk || []).map(e => e.chien_cible_id);

  for (const box of boxesUtilisables) {
    const occupantsBox = boxesOccupes.filter(o => o.box_id === box.id);
    const chiensDansBox = occupantsBox.map(o => o.chien_id);
    const capacite = capaciteBox(box, occupantsBox);
    const amiOkDansBox = chiensDansBox.some(id => amisOk.includes(id));
    const placeDispo = chiensDansBox.length + chien_ids.length <= capacite;

    if (amiOkDansBox && placeDispo) {
      return NextResponse.json({
        box_id: box.id,
        raison: "ami_ok",
        message: `✅ Un ami est dans le ${formatBoxLabel(box)}`
      });
    }
  }

  return NextResponse.json({ box_id: null, raison: null, message: "Aucun box suggéré automatiquement" });
}