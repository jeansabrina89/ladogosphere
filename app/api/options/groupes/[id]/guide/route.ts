import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerBoutiqueApi } from "@/src/lib/permissions";
import { lireCorpsFormulaire } from "@/src/lib/corpsRequete";
import {
  BUCKET_PHOTOS,
  FORMAT_ARTICLE,
  cheminImage,
  convertirEnWebp,
  refusFichierImage,
} from "@/src/lib/imageBoutique";
import { motsIllustration } from "@/src/lib/personnalisationLogique";

/**
 * L'image d'un groupe d'options — quel que soit son type.
 *
 * Sur une mesure, c'est le schéma qui montre OÙ poser le mètre ; partout
 * ailleurs, l'illustration qui montre DE QUELLE PARTIE de l'objet on parle.
 * Même colonne, même route, même traitement : seuls les mots changent, et ils
 * viennent de `motsIllustration` pour que l'écran et la réponse s'accordent.
 *
 * Elle garde ses proportions — une image recadrée au carré perdrait la flèche
 * qui dit tout, ou la boucle qu'on voulait montrer.
 *
 * Comme partout dans la boutique, ce qui entre ressort en WebP : le bucket
 * n'accepte rien d'autre, et un SVG y serait du script chez le visiteur.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const garde = await exigerBoutiqueApi(supabase, "gestion");
  if (garde) return garde;

  const { id } = await params;

  const { data: groupe } = await supabaseAdmin
    .from("options_groupes")
    .select("id, type, guide_image_path")
    .eq("id", id)
    .maybeSingle();
  if (!groupe) return NextResponse.json({ error: "Groupe introuvable." }, { status: 404 });

  // Tous les types en portent une : la liste comme la couleur, le texte comme
  // la mesure. Seul le vocabulaire des messages suit le type.
  const mots = motsIllustration(groupe.type as string);

  const lecture = await lireCorpsFormulaire(req);
  if (!lecture.ok) return lecture.reponse;

  const fichier = lecture.corps.get("photo");
  if (!(fichier instanceof File) || fichier.size === 0) {
    return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }

  const refus = refusFichierImage({ type: fichier.type, size: fichier.size });
  if (refus) return NextResponse.json({ error: refus }, { status: 400 });

  const conversion = await convertirEnWebp(
    Buffer.from(await fichier.arrayBuffer()),
    FORMAT_ARTICLE
  );
  if (!conversion.ok) return NextResponse.json({ error: conversion.error }, { status: 400 });

  const chemin = cheminImage("guide", id);
  const { error: erreurDepot } = await supabaseAdmin.storage
    .from(BUCKET_PHOTOS)
    .upload(chemin, conversion.octets, { contentType: "image/webp", upsert: false });
  if (erreurDepot) {
    return NextResponse.json({ error: mots.echecDepot }, { status: 500 });
  }

  const { error } = await supabaseAdmin
    .from("options_groupes")
    .update({ guide_image_path: chemin })
    .eq("id", id);
  if (error) {
    await supabaseAdmin.storage.from(BUCKET_PHOTOS).remove([chemin]);
    return NextResponse.json({ error: mots.echecEnregistrement }, { status: 500 });
  }

  const ancien = groupe.guide_image_path as string | null;
  if (ancien && ancien !== chemin) {
    await supabaseAdmin.storage.from(BUCKET_PHOTOS).remove([ancien]);
  }

  return NextResponse.json({ ok: true, guide_image_path: chemin });
}

/** Retirer l'image : le groupe et ses options restent, seule l'image s'en va. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const garde = await exigerBoutiqueApi(supabase, "gestion");
  if (garde) return garde;

  const { id } = await params;

  const { data: groupe } = await supabaseAdmin
    .from("options_groupes")
    .select("id, guide_image_path")
    .eq("id", id)
    .maybeSingle();
  if (!groupe) return NextResponse.json({ error: "Groupe introuvable." }, { status: 404 });

  const { error } = await supabaseAdmin
    .from("options_groupes")
    .update({ guide_image_path: null })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "Le retrait a échoué." }, { status: 500 });

  const ancien = groupe.guide_image_path as string | null;
  if (ancien) await supabaseAdmin.storage.from(BUCKET_PHOTOS).remove([ancien]);

  return NextResponse.json({ ok: true });
}
