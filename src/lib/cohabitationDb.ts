import { supabaseAdmin } from "@/src/lib/supabase-admin";
import {
  estChoixCohabitation,
  cohabitationVerrouillee,
  type ChienCohabitation,
} from "@/src/lib/cohabitation";

/**
 * Lit le mode de cohabitation de chiens donnés : colonnes de `chiens` plus
 * l'entente `famille_uniquement`, qui vit dans `ententes_chiens`.
 */
export async function lireCohabitationChiens(chien_ids: string[]): Promise<ChienCohabitation[]> {
  if (chien_ids.length === 0) return [];

  const { data: chiens } = await supabaseAdmin
    .from("chiens")
    .select("id, nom, client_id, categorie_poids, doit_etre_isole, hebergement_autorise, cohabitation_source")
    .in("id", chien_ids);

  const { data: familles } = await supabaseAdmin
    .from("ententes_chiens")
    .select("chien_id")
    .eq("type", "famille_uniquement")
    .in("chien_id", chien_ids);
  const enFamille = new Set((familles ?? []).map((f) => f.chien_id as string));

  return ((chiens ?? []) as ChienCohabitation[]).map((c) => ({
    ...c,
    famille_uniquement: enFamille.has(c.id as string),
  }));
}

/** Pose (ou retire) l'entente `famille_uniquement` d'un chien. */
export async function definirFamilleUniquement(chien_id: string, actif: boolean): Promise<void> {
  const { data: existante } = await supabaseAdmin
    .from("ententes_chiens")
    .select("id")
    .eq("chien_id", chien_id)
    .eq("type", "famille_uniquement")
    .maybeSingle();

  if (actif && !existante) {
    // Auto-référence : même mécanisme que /api/chiens/[id]/ententes.
    await supabaseAdmin.from("ententes_chiens").insert({
      chien_id, chien_cible_id: chien_id, type: "famille_uniquement",
    });
  } else if (!actif && existante) {
    await supabaseAdmin.from("ententes_chiens").delete().eq("id", existante.id);
  }
}

/**
 * Applique le choix de cohabitation DÉCLARÉ PAR LE CLIENT.
 *
 * Sans effet si la pension a tranché : sa décision prime et ne peut pas être
 * défaite depuis l'espace client. On ne rend jamais un chien « interne » à
 * l'envers non plus : seule la source passe à 'client' quand c'est le client
 * qui pose la contrainte.
 */
export async function appliquerCohabitationClient(
  chien_id: string,
  choix: unknown
): Promise<void> {
  if (!estChoixCohabitation(choix)) return;

  const [actuel] = await lireCohabitationChiens([chien_id]);
  if (cohabitationVerrouillee(actuel)) return;

  await supabaseAdmin
    .from("chiens")
    .update({
      doit_etre_isole: choix === "seul",
      cohabitation_source: "client",
    })
    .eq("id", chien_id);

  await definirFamilleUniquement(chien_id, choix === "famille");
}
