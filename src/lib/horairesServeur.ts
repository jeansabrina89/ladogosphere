import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { CLES_HORAIRES, HORAIRES_DEFAUT, horairesDepuisReglages, type Horaires } from "@/src/lib/horaires";

/**
 * Les horaires d'accueil, lus dans `parametres` — une seule requête pour les
 * cinq clés.
 *
 * Une lecture qui échoue rend les horaires de départ, jamais une erreur : un
 * e-mail de confirmation ne doit pas rester en rade parce que la base n'a pas
 * répondu. Le pire qu'on risque est un encadré qui annonce les horaires
 * d'hier ; une confirmation jamais envoyée, non.
 */
export async function lireHoraires(): Promise<Horaires> {
  try {
    const { data } = await supabaseAdmin
      .from("parametres")
      .select("cle, valeur")
      .in("cle", Object.values(CLES_HORAIRES));
    return horairesDepuisReglages(
      new Map((data ?? []).map((l: { cle: string; valeur: string | null }) => [l.cle, l.valeur ?? ""])),
    );
  } catch {
    return HORAIRES_DEFAUT;
  }
}
