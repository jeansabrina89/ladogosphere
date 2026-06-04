import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../src/lib/supabase";

export async function POST(req: NextRequest) {
  const { chien_ids, date_debut, date_fin } = await req.json();

  if (!chien_ids?.length || !date_debut || !date_fin) {
    return NextResponse.json({ box_id: null, raison: null });
  }

  // 1. Trouver les boxes occupés sur ces dates
  const { data: occupations } = await supabase
    .from("occupation_boxes")
    .select("box_id, chien_id")
    .lte("date_debut", date_fin)
    .gte("date_fin", date_debut);

  const boxesOccupes = occupations || [];

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
  const { data: tousBoxes } = await supabase
    .from("boxes")
    .select("id, numero, capacite")
    .eq("actif", true)
    .order("numero");

  if (!tousBoxes?.length) return NextResponse.json({ box_id: null, raison: null });

  // 4. Pour chaque box, compter les occupants et vérifier les amis
  for (const box of tousBoxes) {
    const occupantsBox = boxesOccupes.filter(o => o.box_id === box.id);
    const chiensDansBox = occupantsBox.map(o => o.chien_id);
    const capacite = box.capacite || 2;

    // Vérifier si un ami box_compatible est dans ce box
    const amiDansBox = chiensDansBox.some(id => tousAmis.includes(id));

    // Vérifier si le box a de la place
    const placeDispo = chiensDansBox.length + chien_ids.length <= capacite;

    if (amiDansBox && placeDispo) {
      return NextResponse.json({
        box_id: box.id,
        raison: "box_compatible",
        message: `🏠 Un ami compatible est dans le Box ${box.numero}`
      });
    }
  }

  // 5. Pas d'ami trouvé → chercher un box vide
  for (const box of tousBoxes) {
    const occupantsBox = boxesOccupes.filter(o => o.box_id === box.id);
    if (occupantsBox.length === 0) {
      return NextResponse.json({
        box_id: box.id,
        raison: "vide",
        message: `✅ Box ${box.numero} disponible`
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

  for (const box of tousBoxes) {
    const occupantsBox = boxesOccupes.filter(o => o.box_id === box.id);
    const chiensDansBox = occupantsBox.map(o => o.chien_id);
    const capacite = box.capacite || 2;
    const amiOkDansBox = chiensDansBox.some(id => amisOk.includes(id));
    const placeDispo = chiensDansBox.length + chien_ids.length <= capacite;

    if (amiOkDansBox && placeDispo) {
      return NextResponse.json({
        box_id: box.id,
        raison: "ami_ok",
        message: `✅ Un ami est dans le Box ${box.numero}`
      });
    }
  }

  return NextResponse.json({ box_id: null, raison: null, message: "Aucun box suggéré automatiquement" });
}