import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import {
  doitPublierParDate,
  doitPublierParStock,
  evenementPublication,
  type ArticleVisibilite,
  type DeclencheurPublication,
} from "@/src/lib/statutVitrineLogique";

/**
 * La publication automatique d'un brouillon — couche base.
 *
 * Deux chemins, qui se cumulent : une DATE, et la première ENTRÉE DE STOCK qui
 * rend l'article disponible. Le premier des deux qui se présente publie ; le
 * second ne trouve plus de brouillon et ne fait rien. C'est l'idempotence, et
 * elle tient à une seule condition dans la requête : `statut_vitrine =
 * 'brouillon'`.
 *
 * Chaque publication laisse une trace : qui, quand, par quel déclencheur. Un
 * article qui apparaît en vitrine sans que personne ne l'ait cliqué doit
 * pouvoir s'expliquer.
 */

async function publier(
  articleId: string,
  declencheur: DeclencheurPublication,
  userId: string | null,
  details: Record<string, unknown>
): Promise<boolean> {
  // La condition sur le statut est DANS la requête : deux publications
  // simultanées ne peuvent pas passer toutes les deux.
  const { data, error } = await supabaseAdmin
    .from("articles")
    .update({ statut_vitrine: "publie" })
    .eq("id", articleId)
    .eq("statut_vitrine", "brouillon")
    .select("id, nom")
    .maybeSingle();

  if (error || !data) return false;

  await tracerEvenement({
    entite: "article",
    entiteId: articleId,
    evenement: evenementPublication(declencheur),
    avant: { statut_vitrine: "brouillon" },
    apres: { statut_vitrine: "publie", declencheur, nom: data.nom, ...details },
    userId,
  });
  return true;
}

/**
 * Les brouillons dont la date de publication est arrivée.
 *
 * Appelée à la lecture des catalogues plutôt que par une tâche planifiée : il
 * n'y a pas de cron ici, et la vue `articles_vitrine` refuse déjà de servir un
 * article dont la date n'est pas passée. La bascule du statut ne fait donc que
 * RATTRAPER l'affichage, elle ne le décide pas — un oubli d'appel ne publie
 * rien trop tôt.
 */
export async function publierCeQuiEstDu(userId: string | null = null): Promise<number> {
  const maintenant = new Date().toISOString();

  const { data } = await supabaseAdmin
    .from("articles")
    .select("id, actif, statut_vitrine, date_publication, publier_a_l_entree_stock")
    .eq("statut_vitrine", "brouillon")
    .eq("actif", true)
    .not("date_publication", "is", null)
    .lte("date_publication", maintenant);

  let publies = 0;
  for (const a of (data ?? []) as (ArticleVisibilite & { id: string })[]) {
    if (!doitPublierParDate(a, maintenant)) continue;
    if (await publier(a.id, "date", userId, { date_publication: a.date_publication })) publies += 1;
  }
  return publies;
}

/**
 * La publication déclenchée par une entrée de stock.
 *
 * Branchée dans `enregistrerMouvement`, au même endroit que l'alerte de retour
 * en stock d'APP 13h : c'est déjà le seul endroit où le stock bouge, et il n'y
 * en aura pas un second. Ne lève jamais — le mouvement est déjà écrit.
 */
export async function publierSiEntreeStock(p: {
  article: ArticleVisibilite & { id: string };
  disponibleAvant: number;
  disponibleApres: number;
  userId?: string | null;
}): Promise<boolean> {
  try {
    if (!doitPublierParStock(p.article, p.disponibleAvant, p.disponibleApres)) return false;
    return await publier(p.article.id, "entree_stock", p.userId ?? null, {
      disponible_avant: p.disponibleAvant,
      disponible_apres: p.disponibleApres,
    });
  } catch {
    return false;
  }
}
