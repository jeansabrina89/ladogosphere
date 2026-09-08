import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerBoutiqueApi } from "@/src/lib/permissions";
import { lireCorpsFormulaire } from "@/src/lib/corpsRequete";
import { libelleDepuisNomFichier } from "@/src/lib/personnalisationLogique";
import {
  BUCKET_PHOTOS,
  FORMAT_COLORIS,
  cheminImage,
  convertirEnWebp,
  refusFichierImage,
} from "@/src/lib/imageBoutique";

/**
 * Dépôt multiple de coloris : une valeur par image, le nom du fichier devenant
 * le libellé (« bleu-nuit.jpg » → « Bleu nuit »), à corriger ensuite en ligne.
 *
 * C'est le geste de Sabrina qui a déjà sa gamme et en entre vingt d'affilée.
 * Une image refusée n'empêche pas les autres : on rend le détail, image par
 * image, plutôt qu'un échec global.
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
    .select("id, article_id")
    .eq("id", id)
    .maybeSingle();
  if (!groupe) return NextResponse.json({ error: "Groupe d'options introuvable." }, { status: 404 });

  const lecture = await lireCorpsFormulaire(req);
  if (!lecture.ok) return lecture.reponse;

  const fichiers = lecture.corps.getAll("photos").filter((f): f is File => f instanceof File);
  if (fichiers.length === 0) {
    return NextResponse.json({ error: "Aucune image reçue." }, { status: 400 });
  }

  const { data: dernier } = await supabaseAdmin
    .from("options_valeurs")
    .select("ordre")
    .eq("groupe_id", id)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();
  let ordre = Number(dernier?.ordre ?? 0);

  const creees: { id: string; libelle: string; image_path: string }[] = [];
  const refuses: { fichier: string; raison: string }[] = [];

  for (const fichier of fichiers) {
    const refus = refusFichierImage({ type: fichier.type, size: fichier.size });
    if (refus) {
      refuses.push({ fichier: fichier.name, raison: refus });
      continue;
    }

    const conversion = await convertirEnWebp(
      Buffer.from(await fichier.arrayBuffer()),
      FORMAT_COLORIS
    );
    if (!conversion.ok) {
      refuses.push({ fichier: fichier.name, raison: conversion.error });
      continue;
    }

    ordre += 1;
    const { data: valeur, error: erreurValeur } = await supabaseAdmin
      .from("options_valeurs")
      .insert({
        groupe_id: id,
        libelle: libelleDepuisNomFichier(fichier.name),
        ordre,
      })
      .select("id, libelle")
      .single();
    if (erreurValeur || !valeur) {
      refuses.push({ fichier: fichier.name, raison: "Création de l'option impossible." });
      continue;
    }

    const chemin = cheminImage("coloris", valeur.id as string);
    const { error: erreurDepot } = await supabaseAdmin.storage
      .from(BUCKET_PHOTOS)
      .upload(chemin, conversion.octets, { contentType: "image/webp", upsert: false });
    if (erreurDepot) {
      // Une valeur sans visuel s'affiche par son seul nom : on la garde.
      refuses.push({ fichier: fichier.name, raison: "Le dépôt de l'image a échoué." });
      continue;
    }

    await supabaseAdmin.from("options_valeurs").update({ image_path: chemin }).eq("id", valeur.id);
    creees.push({ id: valeur.id as string, libelle: valeur.libelle as string, image_path: chemin });
  }

  return NextResponse.json({ ok: creees.length > 0, creees, refuses });
}
