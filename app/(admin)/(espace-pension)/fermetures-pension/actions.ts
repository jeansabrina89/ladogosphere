"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { refusFermeture } from "@/src/lib/fermeturesPensionLogique";

export type RetourFermeture = { error?: string; message?: string };

/**
 * Fermer la pension sur une période (APP 59).
 *
 * ── RÉSERVÉ À L'ADMINISTRATRICE ───────────────────────────────────────────
 *
 * Fermer la pension est une DÉCISION, pas un geste d'accueil : c'est le même
 * cercle que les tarifs ou la date d'ouverture. La politique de la table le
 * refuse déjà à qui n'est pas admin ; cette garde-ci le dit à l'écran, et
 * refuse AVANT toute écriture.
 *
 * ── ON N'ANNULE RIEN ──────────────────────────────────────────────────────
 *
 * Les réservations déjà validées qui tombent dans la période restent en place.
 * Le message de retour les compte, et l'écran les nomme sous « À contacter ».
 * Une annulation automatique ferait disparaître le séjour de quelqu'un qui n'a
 * pas encore été prévenu — et plus personne ne saurait qui appeler.
 */
export async function fermerPension(formData: FormData): Promise<RetourFermeture> {
  const acces = await exigerAdminPage();

  const date_debut = String(formData.get("date_debut") ?? "").trim();
  const date_fin = String(formData.get("date_fin") ?? "").trim();
  const motif = String(formData.get("motif") ?? "").trim() || null;

  const refus = refusFermeture(date_debut, date_fin);
  if (refus) return { error: refus };

  const { data: ligne, error } = await supabaseAdmin
    .from("fermetures_pension")
    .insert({ date_debut, date_fin, motif, cree_par: acces.userId ?? null })
    .select("id")
    .single();
  if (error || !ligne) return { error: error?.message ?? "Enregistrement impossible." };

  await tracerEvenement({
    entite: "fermeture_pension",
    entiteId: ligne.id as string,
    evenement: "fermeture_ajoutee",
    apres: { date_debut, date_fin, motif },
    userId: acces.userId ?? null,
  });

  revalidatePath("/fermetures-pension");
  revalidatePath("/pension");
  return { message: `Pension fermée du ${date_debut} au ${date_fin}.` };
}

/** Retirer une période. Le journal garde ce qu'elle disait. */
export async function rouvrirPension(id: string): Promise<RetourFermeture> {
  const acces = await exigerAdminPage();

  const { data: avant } = await supabaseAdmin
    .from("fermetures_pension")
    .select("date_debut, date_fin, motif")
    .eq("id", id)
    .maybeSingle();
  if (!avant) return { error: "Cette période n'existe plus." };

  const { error } = await supabaseAdmin.from("fermetures_pension").delete().eq("id", id);
  if (error) return { error: error.message };

  await tracerEvenement({
    entite: "fermeture_pension",
    entiteId: id,
    evenement: "fermeture_retiree",
    avant: avant as Record<string, unknown>,
    userId: acces.userId ?? null,
  });

  revalidatePath("/fermetures-pension");
  revalidatePath("/pension");
  return { message: "Période retirée." };
}
