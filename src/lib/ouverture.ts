import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { CLE_DATE_OUVERTURE, dateOuvertureUtilisable } from "@/src/lib/ouvertureLogique";

/**
 * La date d'ouverture, lue dans `parametres`.
 *
 * Une lecture qui échoue rend "" — donc AUCUNE restriction. C'est le même
 * choix que pour le lien d'avis Google : une base indisponible ne doit pas
 * fermer la boutique ni le tunnel de réservation. Le pire que l'on risque est
 * qu'un client réserve une date trop tôt pendant une panne ; le refus serveur
 * repasse dès que la base répond, et une réservation se déplace. Une maison
 * close pour tout le monde, non.
 *
 * La lecture n'est pas mise en cache : elle coûte une ligne, et un réglage
 * qu'on vient de changer doit valoir tout de suite — c'est le jour de
 * l'ouverture qu'on efface le champ, et ce jour-là on n'a pas envie
 * d'attendre.
 */
export async function lireDateOuverture(): Promise<string> {
  try {
    const { data } = await supabaseAdmin
      .from("parametres")
      .select("valeur")
      .eq("cle", CLE_DATE_OUVERTURE)
      .maybeSingle();
    return dateOuvertureUtilisable(data?.valeur as string | null);
  } catch {
    return "";
  }
}
