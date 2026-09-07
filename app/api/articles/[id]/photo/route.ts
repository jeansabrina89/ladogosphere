import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerPermissionApi } from "@/src/lib/apiAuth";
import { lireCorpsFormulaire } from "@/src/lib/corpsRequete";
import { BUCKET_PHOTOS_BOUTIQUE } from "@/src/lib/boutiqueLogique";

/**
 * Photo d'un article, déposée dans le bucket PUBLIC de la boutique.
 *
 * C'est une image de catalogue : le site vitrine, qui est un autre projet sans
 * session, doit pouvoir l'afficher par une URL stable. Les justificatifs
 * comptables, eux, restent dans leur bucket privé, à URL signée de courte durée.
 */

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const TAILLE_MAX = 4 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_boutique");
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

  const ext = EXT[fichier.type];
  if (!ext) return NextResponse.json({ error: "Format accepté : JPEG, PNG ou WebP." }, { status: 400 });
  if (fichier.size > TAILLE_MAX) {
    return NextResponse.json({ error: "La photo ne doit pas dépasser 4 Mo." }, { status: 400 });
  }

  const octets = Buffer.from(await fichier.arrayBuffer());
  const chemin = `${id}/${Date.now()}.${ext}`;

  const { error: erreurDepot } = await supabaseAdmin.storage
    .from(BUCKET_PHOTOS_BOUTIQUE)
    .upload(chemin, octets, { contentType: fichier.type, upsert: false });
  if (erreurDepot) {
    return NextResponse.json({ error: "Le dépôt de l'image a échoué." }, { status: 500 });
  }

  const { error } = await supabaseAdmin
    .from("articles")
    .update({ photo_path: chemin })
    .eq("id", id);
  if (error) {
    await supabaseAdmin.storage.from(BUCKET_PHOTOS_BOUTIQUE).remove([chemin]);
    return NextResponse.json({ error: "L'enregistrement de la photo a échoué." }, { status: 500 });
  }

  // L'ancienne photo n'a plus de raison d'occuper le bucket.
  const ancienne = article.photo_path as string | null;
  if (ancienne && ancienne !== chemin) {
    await supabaseAdmin.storage.from(BUCKET_PHOTOS_BOUTIQUE).remove([ancienne]);
  }

  return NextResponse.json({ ok: true, photo_path: chemin });
}
