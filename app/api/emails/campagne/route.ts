import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { envoyerMessageLibre } from "@/src/lib/email";
import { clientsMembresAJour } from "@/src/lib/membre";

type Destinataire = { id: string; email: string; prenom: string; nom: string };

async function listerDestinataires(cible: string): Promise<Destinataire[]> {
  const { data: clients } = await supabaseAdmin
    .from("clients")
    .select("id, email, prenom, nom")
    .not("actif", "is", false);
  const liste = (clients ?? []) as Destinataire[];
  if (cible === "membres_actifs") {
    const set = await clientsMembresAJour(
      supabaseAdmin,
      liste.map((c) => c.id)
    );
    return liste.filter((c) => set.has(c.id));
  }
  return liste; // tous_clients
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin")
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const cible = body?.cible;
  const apercu = body?.apercu === true;
  if (cible !== "membres_actifs" && cible !== "tous_clients") {
    return NextResponse.json({ error: "Cible invalide" }, { status: 400 });
  }

  const liste = await listerDestinataires(cible);

  // Aperçu : on ne renvoie que le nombre de destinataires.
  if (apercu) {
    return NextResponse.json({ count: liste.length });
  }

  const sujet = String(body?.sujet ?? "").trim();
  const corps = String(body?.corps ?? "").trim();
  if (!sujet || !corps) {
    return NextResponse.json({ error: "Sujet et message requis" }, { status: 400 });
  }
  if (liste.length === 0) {
    return NextResponse.json({ error: "Aucun destinataire" }, { status: 400 });
  }

  let echecs = 0;
  for (const c of liste) {
    try {
      await envoyerMessageLibre({
        email: c.email,
        sujet,
        corps,
        prenom: c.prenom,
        nom: c.nom,
      });
    } catch {
      echecs++;
    }
  }

  await supabaseAdmin.from("emails_campagnes").insert({
    sujet,
    corps,
    cible,
    nb_destinataires: liste.length,
    nb_echecs: echecs,
    created_by: user.id,
  });

  return NextResponse.json({
    total: liste.length,
    envoyes: liste.length - echecs,
    echecs,
  });
}
