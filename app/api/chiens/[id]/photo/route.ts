import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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

  const form = await req.formData();
  const file = form.get("photo") as File | null;
  if (!file || file.size === 0) return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });

  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "Format accepté : JPEG, PNG ou WebP." }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "La photo ne doit pas dépasser 4 Mo." }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const chemin = `${id}/${Date.now()}.${ext}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from("chiens-photos")
    .upload(chemin, buffer, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: "Échec de l'envoi de l'image." }, { status: 500 });

  const { data: pub } = supabaseAdmin.storage.from("chiens-photos").getPublicUrl(chemin);

  const { error: updErr } = await supabaseAdmin
    .from("chiens")
    .update({ photo_principale: pub.publicUrl })
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: "Échec de l'enregistrement." }, { status: 500 });

  return NextResponse.json({ ok: true, url: pub.publicUrl });
}
