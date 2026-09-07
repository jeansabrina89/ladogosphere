import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerPermissionApi } from "@/src/lib/apiAuth";
import { lireCorpsFormulaire } from "@/src/lib/corpsRequete";
import {
  BUCKET_PHOTOS,
  FORMAT_COLORIS,
  cheminImage,
  convertirEnWebp,
  refusFichierImage,
} from "@/src/lib/imageBoutique";

/**
 * Photo d'un coloris : vignette carrée de 400 px, recadrée au centre. C'est
 * l'affichage principal d'une valeur de couleur — la pastille hexadécimale
 * n'est qu'un secours quand aucune photo n'est encore chargée.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_boutique");
  if (garde) return garde;

  const { id } = await params;

  const { data: valeur } = await supabaseAdmin
    .from("options_valeurs")
    .select("id, image_path")
    .eq("id", id)
    .maybeSingle();
  if (!valeur) return NextResponse.json({ error: "Option introuvable." }, { status: 404 });

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
    FORMAT_COLORIS
  );
  if (!conversion.ok) return NextResponse.json({ error: conversion.error }, { status: 400 });

  const chemin = cheminImage("coloris", id);
  const { error: erreurDepot } = await supabaseAdmin.storage
    .from(BUCKET_PHOTOS)
    .upload(chemin, conversion.octets, { contentType: "image/webp", upsert: false });
  if (erreurDepot) {
    return NextResponse.json({ error: "Le dépôt de l'image a échoué." }, { status: 500 });
  }

  const { error } = await supabaseAdmin
    .from("options_valeurs")
    .update({ image_path: chemin })
    .eq("id", id);
  if (error) {
    await supabaseAdmin.storage.from(BUCKET_PHOTOS).remove([chemin]);
    return NextResponse.json({ error: "L'enregistrement de la vignette a échoué." }, { status: 500 });
  }

  const ancienne = valeur.image_path as string | null;
  if (ancienne && ancienne !== chemin) {
    await supabaseAdmin.storage.from(BUCKET_PHOTOS).remove([ancienne]);
  }

  return NextResponse.json({ ok: true, image_path: chemin });
}
