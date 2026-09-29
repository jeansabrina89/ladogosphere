import { supabaseAdmin } from "@/src/lib/supabase-admin";
import {
  CLES_VERSIONS_CONDITIONS,
  VERSIONS_CONDITIONS_DEFAUT,
  versionsDepuisReglages,
  type VersionsConditions,
} from "@/src/lib/acceptationsConditionsLogique";

/**
 * Les versions des conditions, lues dans `parametres` — une seule requête.
 *
 * Une lecture qui échoue rend les versions de départ. Le repère « ancienne
 * version » est un AVERTISSEMENT, jamais un blocage : une base muette ne doit
 * ni faire passer tout le monde pour à jour, ni empêcher une réservation.
 */
export async function lireVersionsConditions(): Promise<VersionsConditions> {
  try {
    const { data } = await supabaseAdmin
      .from("parametres")
      .select("cle, valeur")
      .in("cle", Object.values(CLES_VERSIONS_CONDITIONS));
    return versionsDepuisReglages(
      new Map((data ?? []).map((l: { cle: string; valeur: string | null }) => [l.cle, l.valeur ?? ""])),
    );
  } catch {
    return VERSIONS_CONDITIONS_DEFAUT;
  }
}
