import { supabaseAdmin } from "@/src/lib/supabase-admin";
import {
  CLE_ANIMAUX_EN_LIGNE,
  lireAnimauxOuverts,
  TOUS_LES_ANIMAUX,
} from "@/src/lib/animauxEnLigneLogique";

/**
 * La liste des animaux vendus en ligne, lue en base.
 *
 * UN SEUL chemin de lecture, parce qu'il y a TROIS endroits qui interrogent la
 * table `articles` avec les filtres de publication — le catalogue en ligne, la
 * fiche, et le catalogue du panier. Chacun réécrivant la règle de son côté, il
 * a suffi jusqu'ici qu'un seul soit oublié pour qu'un article dépublié reste
 * commandable. Ce réglage-ci passe donc par une fonction unique, et un test
 * relit les trois requêtes.
 *
 * La vitrine, elle, n'appelle rien : la VUE applique la même règle en SQL, avec
 * les droits de son propriétaire. C'est ce qui permet au site de ne rien savoir
 * de ce réglage.
 */
export async function animauxOuvertsEnLigne(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("parametres")
    .select("valeur")
    .eq("cle", CLE_ANIMAUX_EN_LIGNE)
    .maybeSingle();
  // Clé absente : les sept. Une boutique vide serait une panne muette.
  if (!data) return [...TOUS_LES_ANIMAUX];
  return lireAnimauxOuverts((data as { valeur: string | null }).valeur);
}
