import { NextRequest, NextResponse } from "next/server";
import { lireCorpsFormulaire } from "@/src/lib/corpsRequete";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { deposerImage } from "@/src/lib/depotImage";
import { FORMAT_CHIEN } from "@/src/lib/imageBoutique";
import { BUCKET_CHIENS, oublierPhotoChien } from "@/src/lib/photoChien";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  const { id } = await params;

  // Ownership : lecture RLS (session) — si le chien remonte, le client y a droit
  const { data: chien } = await supabase
    .from("chiens")
    // Le chemin ACTUEL est lu ici, avant tout dépôt : c'est lui qu'on oubliera
    // à la fin, et après l'enregistrement il aura disparu de la fiche.
    .select("id, photo_principale")
    .eq("id", id)
    .maybeSingle();
  if (!chien) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  const ancienChemin = (chien as { photo_principale?: string | null }).photo_principale ?? null;

  const lecture = await lireCorpsFormulaire(req);
  if (!lecture.ok) return lecture.reponse;
  const form = lecture.corps;
  const file = form.get("photo") as File | null;
  if (!file || file.size === 0) return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });

  // Le dépôt convertit, redimensionne et JETTE les métadonnées : une photo
  // prise chez le client ne publie pas l'adresse du client.
  const depot = await deposerImage({
    bucket: BUCKET_CHIENS,
    cheminSansExtension: `${id}/${Date.now()}`,
    fichier: file,
    format: FORMAT_CHIEN,
    ecraser: true,
  });
  if (!depot.ok) return NextResponse.json({ error: depot.error }, { status: depot.statut });

  // On range le CHEMIN, plus l'URL publique (S-05, lot 24).
  //
  // Le bucket est privé : `getPublicUrl` ne rendrait qu'une adresse morte, et
  // l'enregistrer serait une promesse fausse — celle que l'objet est lisible par
  // tous. Le chemin, lui, reste valable quelle que soit la façon de servir le
  // fichier, et c'est `urlSigneePhotoChien()` qui le signe à la lecture.
  const { error: updErr } = await supabaseAdmin
    .from("chiens")
    .update({ photo_principale: depot.chemin })
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: "Échec de l'enregistrement." }, { status: 500 });

  /*
   * L'ANCIENNE PHOTO PART MAINTENANT, et pas plus tôt (APP 28).
   *
   * L'ordre est tout : la nouvelle est déposée, puis enregistrée, et c'est
   * seulement alors que l'ancienne devient inutile. Supprimer d'abord aurait
   * laissé le chien sans photo à la moindre panne entre les deux — et la photo
   * perdue pour de bon, alors qu'elle était la seule.
   *
   * Le chemin porte un horodatage : le remplaçant ne peut pas écraser son
   * prédécesseur, donc sans ce ménage chaque changement de photo laisserait un
   * objet derrière lui. Une photo de chien est une donnée personnelle ; « plus
   * référencée » n'est pas « effacée ».
   *
   * Un échec ici ne fait PAS échouer la requête : la photo est enregistrée, le
   * geste de la cliente a réussi. L'échec est journalisé, l'objet reste à
   * nettoyer.
   */
  if (ancienChemin && ancienChemin !== depot.chemin) {
    await oublierPhotoChien(ancienChemin, { chienId: id, motif: "remplacement" });
  }

  // Le client comme le personnel peuvent changer la photo : l'auteur est le compte connecté.
  await tracerEvenement({
    entite: "chien", entiteId: id, evenement: "photo",
    apres: { photo_principale: depot.chemin, ancienne_oubliee: ancienChemin },
    userId: user.id,
  });

  // L'appelant n'a pas besoin de l'URL : `UploadPhoto` rafraîchit la page, et
  // c'est le serveur qui signera. Renvoyer une URL ici obligerait à la signer
  // deux fois, et donnerait au navigateur une adresse qu'il n'a pas demandée.
  return NextResponse.json({ ok: true });
}
