import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { envoyerMessageLibre } from "@/src/lib/email";
import { clientsMembresAJour } from "@/src/lib/membre";
import { trierDestinataires, type CibleCampagne } from "@/src/lib/destinatairesCampagne";

// Messages d'information (campagnes). Seul envoi soumis au consentement
// `emails_info_ok`, et seul envoi qui porte un lien de désinscription.

type Destinataire = {
  id: string;
  email: string;
  prenom: string;
  nom: string;
  actif: boolean | null;
  emails_info_ok: boolean | null;
  /** Ne sort jamais de ce module : il ne sert qu'à fabriquer le lien. */
  desinscription_token: string;
};

/** Le même tri pour l'aperçu et pour l'envoi : les deux comptent pareil. */
async function trier(cible: CibleCampagne) {
  const { data: clients } = await supabaseAdmin
    .from("clients")
    .select("id, email, prenom, nom, actif, emails_info_ok, desinscription_token");

  const liste = (clients ?? []) as Destinataire[];
  const membresAJour = cible === "membres_actifs"
    ? await clientsMembresAJour(supabaseAdmin, liste.map((c) => c.id))
    : new Set<string>();

  return trierDestinataires(liste, cible, membresAJour);
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

  const { destinataires, exclus } = await trier(cible);

  // Aperçu : le nombre de destinataires, et combien ont refusé les informations.
  if (apercu) {
    return NextResponse.json({ count: destinataires.length, exclus: exclus.length });
  }

  const sujet = String(body?.sujet ?? "").trim();
  const corps = String(body?.corps ?? "").trim();
  if (!sujet || !corps) {
    return NextResponse.json({ error: "Sujet et message requis" }, { status: 400 });
  }
  if (destinataires.length === 0) {
    return NextResponse.json({ error: "Aucun destinataire" }, { status: 400 });
  }

  let echecs = 0;
  for (const c of destinataires) {
    try {
      await envoyerMessageLibre({
        email: c.email,
        sujet,
        corps,
        prenom: c.prenom,
        nom: c.nom,
        token: c.desinscription_token,
      });
    } catch {
      echecs++;
    }
  }

  await supabaseAdmin.from("emails_campagnes").insert({
    sujet,
    corps,
    cible,
    nb_destinataires: destinataires.length,
    nb_echecs: echecs,
    nb_exclus: exclus.length,
    created_by: user.id,
  });

  return NextResponse.json({
    total: destinataires.length,
    envoyes: destinataires.length - echecs,
    echecs,
    exclus: exclus.length,
  });
}
