import { supabaseAdmin } from "@/src/lib/supabase-admin";
import type { Fermeture } from "@/src/lib/fermeturesPensionLogique";

export type FermetureLigne = Fermeture & {
  id: string;
  cree_le: string;
};

/**
 * Les fermetures de la pension — couche base (APP 59).
 *
 * ── DEUX LECTURES, ET C'EST VOULU ─────────────────────────────────────────
 *
 * `fermeturesPension()` lit la TABLE avec la clé de service : l'écran du
 * personnel a besoin de l'identifiant pour supprimer une période.
 *
 * `fermeturesPourClient()` lit la VUE, qui n'expose que les dates et le motif.
 * Elle passe elle aussi par la clé de service — non pas pour contourner la
 * politique, mais parce que le refus serveur d'une réservation doit valoir
 * quelle que soit la session : une fermeture qu'un client ne verrait pas
 * laisserait passer sa demande, et on la lui refuserait au téléphone.
 *
 * Une lecture qui échoue rend une liste VIDE, donc aucune fermeture. C'est le
 * choix le moins mauvais : le pire est qu'une réservation soit acceptée
 * pendant une panne de base, et se rattrape par un appel. Refuser toutes les
 * réservations parce que la base n'a pas répondu serait pire — et invisible.
 */
export async function fermeturesPension(): Promise<FermetureLigne[]> {
  try {
    const { data } = await supabaseAdmin
      .from("fermetures_pension")
      .select("id, date_debut, date_fin, motif, cree_le")
      .order("date_debut", { ascending: false });
    return (data ?? []) as FermetureLigne[];
  } catch {
    return [];
  }
}

/** Les fermetures telles que le client peut les connaître : dates et motif. */
export async function fermeturesPourClient(): Promise<Fermeture[]> {
  try {
    const { data } = await supabaseAdmin
      .from("fermetures_pension_publiques")
      .select("date_debut, date_fin, motif")
      .order("date_debut", { ascending: true });
    return (data ?? []) as Fermeture[];
  } catch {
    return [];
  }
}
