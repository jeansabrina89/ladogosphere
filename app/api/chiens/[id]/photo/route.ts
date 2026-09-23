import { NextRequest, NextResponse } from "next/server";
import { lireCorpsFormulaire } from "@/src/lib/corpsRequete";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { deposerImage } from "@/src/lib/depotImage";
import { FORMAT_CHIEN } from "@/src/lib/imageBoutique";

const BUCKET_CHIENS = "chiens-photos";

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
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!chien) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

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

  const { data: pub } = supabaseAdmin.storage.from(BUCKET_CHIENS).getPublicUrl(depot.chemin);

  const { error: updErr } = await supabaseAdmin
    .from("chiens")
    .update({ photo_principale: pub.publicUrl })
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: "Échec de l'enregistrement." }, { status: 500 });

  // Le client comme le personnel peuvent changer la photo : l'auteur est le compte connecté.
  await tracerEvenement({
    entite: "chien", entiteId: id, evenement: "photo",
    apres: { photo_principale: pub.publicUrl },
    userId: user.id,
  });

  return NextResponse.json({ ok: true, url: pub.publicUrl });
}
