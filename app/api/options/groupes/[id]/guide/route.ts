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
 * Schéma de mesure d'un groupe « mesure » : le dessin qui montre OÙ poser le
 * mètre. Il garde ses proportions — un schéma recadré au carré perdrait la
 * flèche qui dit tout.
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
  if (groupe.type !== "mesure") {
    return NextResponse.json(
      { error: "Un schéma de mesure ne se pose que sur un groupe de type « mesure »." },
      { status: 400 }
    );
  }

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
    return NextResponse.json({ error: "Le dépôt du schéma a échoué." }, { status: 500 });
  }

  const { error } = await supabaseAdmin
    .from("options_groupes")
    .update({ guide_image_path: chemin })
    .eq("id", id);
  if (error) {
    await supabaseAdmin.storage.from(BUCKET_PHOTOS).remove([chemin]);
    return NextResponse.json({ error: "L'enregistrement du schéma a échoué." }, { status: 500 });
  }

  const ancien = groupe.guide_image_path as string | null;
  if (ancien && ancien !== chemin) {
    await supabaseAdmin.storage.from(BUCKET_PHOTOS).remove([ancien]);
  }

  return NextResponse.json({ ok: true, guide_image_path: chemin });
}

/** Retirer le schéma : le champ de mesure reste, seul le dessin s'en va. */
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
