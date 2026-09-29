import { NextRequest, NextResponse } from "next/server";
import { lireCorpsJson } from "@/src/lib/corpsRequete";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerAdminApi } from "@/src/lib/permissions";
import { CLE_AVIS_GOOGLE, validerLienAvisGoogle } from "@/src/lib/avisGoogle";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import {
  CLES_SIGNATURE,
  refusSignature,
  signatureDepuisSaisie,
  type Signature,
} from "@/src/lib/signatureEmail";

/**
 * Réglages des e-mails : le lien pour donner un avis Google, et la signature.
 *
 * Réservé à l'administration, par la même règle que les autres routes
 * d'e-mails. Tout ce qui se règle ici part au pied de TOUS les e-mails : c'est
 * validé à l'entrée, et revalidé au moment de l'écrire dans le modèle.
 *
 * Une seule route pour les deux, parce que ce sont les mêmes réglages, sur le
 * même écran, sous la même permission. Deux routes auraient donné deux gardes
 * à tenir d'accord — et un jour, une seule des deux aurait été corrigée.
 */

/**
 * Écrit une clé de `parametres` et trace le geste. Rend le message d'erreur,
 * ou null.
 */
async function poserReglage(
  cle: string,
  valeur: string,
  userId: string | null,
): Promise<string | null> {
  const { data: avant } = await supabaseAdmin
    .from("parametres").select("valeur").eq("cle", cle).maybeSingle();

  const { data: ligne, error } = await supabaseAdmin
    .from("parametres")
    .upsert({ cle, valeur, updated_at: new Date().toISOString() }, { onConflict: "cle" })
    .select("id")
    .single();
  if (error || !ligne) return error?.message ?? "Enregistrement impossible.";

  const ancienne = (avant?.valeur as string | null) ?? "";
  // Un geste qui ne change rien n'en est pas un : six lignes de journal à
  // chaque enregistrement rendraient illisible celle qui compte.
  if (ancienne !== valeur) {
    await tracerEvenement({
      entite: "parametre",
      entiteId: ligne.id as string,
      evenement: cle,
      avant: { valeur: ancienne },
      apres: { valeur },
      userId,
    });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const refusAcces = await exigerAdminApi(supabase);
  if (refusAcces) return refusAcces;

  const lecture = await lireCorpsJson(req);
  if (!lecture.ok) return lecture.reponse;

  /**
   * La signature (APP 58), reconnue à la présence d'au moins une de ses clés :
   * l'écran envoie les six ensemble. Un corps qui n'en porte aucune est une
   * requête du lien d'avis, et rien ici ne la concerne.
   */
  const corps = (lecture.corps ?? {}) as Record<string, unknown>;
  const clesSignature = Object.values(CLES_SIGNATURE) as string[];
  if (clesSignature.some((c) => c in corps)) {
    const signature: Signature = signatureDepuisSaisie(corps);
    const refus = refusSignature(signature);
    if (refus) {
      return NextResponse.json({ error: refus.message, champ: refus.champ }, { status: 400 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    for (const [champ, cle] of Object.entries(CLES_SIGNATURE)) {
      const erreur = await poserReglage(cle, signature[champ as keyof Signature], user?.id ?? null);
      if (erreur) return NextResponse.json({ error: erreur }, { status: 500 });
    }
    return NextResponse.json({ ok: true, signature });
  }

  const validation = validerLienAvisGoogle(lecture.corps?.avis_google_url);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.message }, { status: 400 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  const erreur = await poserReglage(CLE_AVIS_GOOGLE, validation.valeur, user?.id ?? null);
  if (erreur) return NextResponse.json({ error: erreur }, { status: 500 });

  return NextResponse.json({ ok: true, avis_google_url: validation.valeur });
}
