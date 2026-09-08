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

/**
 * Photo d'un article, déposée dans le bucket PUBLIC de la boutique.
 *
 * Ce que sort le téléphone entre tel quel — JPEG, PNG, HEIC — et ce qui est
 * stocké ressort toujours en WebP redimensionné : personne n'a à convertir
 * quoi que ce soit à la main, et le bucket public ne reçoit jamais autre chose
 * qu'une image (un SVG y serait du script exécuté chez le visiteur).
 *
 * Les justificatifs comptables, eux, restent dans leur bucket privé.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const garde = await exigerBoutiqueApi(supabase, "gestion");
  if (garde) return garde;

  const { id } = await params;

  const { data: article } = await supabaseAdmin
    .from("articles")
    .select("id, photo_path")
    .eq("id", id)
    .maybeSingle();
  if (!article) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });

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

  const chemin = cheminImage("article", id);
  const { error: erreurDepot } = await supabaseAdmin.storage
    .from(BUCKET_PHOTOS)
    .upload(chemin, conversion.octets, { contentType: "image/webp", upsert: false });
  if (erreurDepot) {
    return NextResponse.json({ error: "Le dépôt de l'image a échoué." }, { status: 500 });
  }

  const { error } = await supabaseAdmin
    .from("articles")
    .update({ photo_path: chemin })
    .eq("id", id);
  if (error) {
    await supabaseAdmin.storage.from(BUCKET_PHOTOS).remove([chemin]);
    return NextResponse.json({ error: "L'enregistrement de la photo a échoué." }, { status: 500 });
  }

  // L'ancienne photo n'a plus de raison d'occuper le bucket.
  const ancienne = article.photo_path as string | null;
  if (ancienne && ancienne !== chemin) {
    await supabaseAdmin.storage.from(BUCKET_PHOTOS).remove([ancienne]);
  }

  return NextResponse.json({
    ok: true,
    photo_path: chemin,
    largeur: conversion.largeur,
    hauteur: conversion.hauteur,
  });
}
