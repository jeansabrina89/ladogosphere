import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { ecartEquilibre, type LigneEquilibre } from "@/src/lib/rapportsCompta";

/**
 * Lecture du contrôle d'équilibre du grand-livre. Le calcul, lui, est pur et
 * vit dans rapportsCompta — c'est lui que les tests couvrent.
 */

/** La taille d'une page de lecture. PostgREST plafonne les réponses. */
const PAGE = 1000;

/**
 * Lecture paginée du grand-livre. On ne demande que deux colonnes, et on
 * s'arrête dès qu'une page revient incomplète — le nombre d'écritures grandit,
 * la requête doit continuer à dire juste.
 */
export async function equilibreGrandLivre(): Promise<number> {
  const lignes: LigneEquilibre[] = [];
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("ecritures_lignes")
      .select("debit, credit")
      .range(debut, debut + PAGE - 1);
    if (error || !data || data.length === 0) break;
    lignes.push(...(data as LigneEquilibre[]));
    if (data.length < PAGE) break;
  }
  return ecartEquilibre(lignes);
}
