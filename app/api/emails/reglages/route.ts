import { NextRequest, NextResponse } from "next/server";
import { lireCorpsJson } from "@/src/lib/corpsRequete";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerAdminApi } from "@/src/lib/permissions";
import { CLE_AVIS_GOOGLE, validerLienAvisGoogle } from "@/src/lib/avisGoogle";
import { tracerEvenement } from "@/src/lib/journalEvenements";

/**
 * Réglages des e-mails : le lien pour donner un avis Google.
 *
 * Réservé à l'administration, par la même règle que les autres routes
 * d'e-mails. Le lien part au pied de TOUS les e-mails : il est validé ici, et
 * revalidé au moment de l'écrire dans le modèle.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const refusAcces = await exigerAdminApi(supabase);
  if (refusAcces) return refusAcces;

  const lecture = await lireCorpsJson(req);
  if (!lecture.ok) return lecture.reponse;

  const validation = validerLienAvisGoogle(lecture.corps?.avis_google_url);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.message }, { status: 400 });
  }

  const { data: avant } = await supabaseAdmin
    .from("parametres").select("valeur").eq("cle", CLE_AVIS_GOOGLE).maybeSingle();

  const { data: ligne, error } = await supabaseAdmin
    .from("parametres")
    .upsert(
      { cle: CLE_AVIS_GOOGLE, valeur: validation.valeur, updated_at: new Date().toISOString() },
      { onConflict: "cle" }
    )
    .select("id")
    .single();
  if (error || !ligne) {
    return NextResponse.json({ error: error?.message ?? "Enregistrement impossible." }, { status: 500 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  await tracerEvenement({
    entite: "parametre",
    entiteId: ligne.id as string,
    evenement: "avis_google_url",
    avant: { valeur: (avant?.valeur as string | null) ?? "" },
    apres: { valeur: validation.valeur },
    userId: user?.id ?? null,
  });

  return NextResponse.json({ ok: true, avis_google_url: validation.valeur });
}
