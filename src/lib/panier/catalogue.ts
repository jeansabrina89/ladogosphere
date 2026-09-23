import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { publierCeQuiEstDu } from "@/src/lib/publicationArticle";
import { contextePrix, prixDe } from "@/src/lib/prix";
import { remiseLigne as remiseLigneFigee } from "@/src/lib/prixLogique";
import { estMembreActif } from "@/src/lib/membre";
import { lireCatalogueOptions } from "@/src/lib/personnalisation";
import type { ArticleCatalogue, Catalogue } from "./revaliderLigne";

/**
 * Le catalogue dont la revalidation a besoin, chargé d'un coup.
 *
 * Une requête pour les articles, une pour le contexte de prix (rubriques en
 * cours et remise d'adhésion), une pour l'adhésion du client. Les options,
 * elles, se résolvent article par article : un article sur mesure hérite des
 * groupes de ses modèles, et cette résolution (lireCatalogueOptions) est la
 * SEULE qui fasse foi — la même qu'au configurateur.
 *
 * Les règles de la vitrine sont ici, et pas ailleurs : un article absent du
 * résultat n'est pas vendable en ligne aujourd'hui, quelle qu'en soit la raison
 * (inactif, dépublié, composant, publication à venir).
 */

const COLONNES = `
  id, nom, prix_vente, taux_tva, secteur_tdfn, type_article, poids_grammes,
  stock_actuel, stock_reserve, categorie, remise_membre_exclue, date_limite
`;

const FILTRE_PUBLICATION = () =>
  `date_publication.is.null,date_publication.lte.${new Date().toISOString()}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function chargerCatalogue(
  articleIds: string[],
  clientId: string | null,
): Promise<Catalogue> {
  const ids = [...new Set(articleIds.filter((i) => UUID.test(String(i ?? ""))))];
  const articles = new Map<string, ArticleCatalogue>();
  const options = new Map<string, Awaited<ReturnType<typeof lireCatalogueOptions>>>();

  if (ids.length === 0) {
    return { articles, options: new Map(), prixArticle: () => vide() };
  }

  // Une publication programmée dont l'heure est passée s'applique avant qu'on
  // regarde : c'est la même porte que le catalogue public.
  await publierCeQuiEstDu();

  const [{ data }, ctx, membre] = await Promise.all([
    supabaseAdmin
      .from("articles")
      .select(COLONNES)
      .in("id", ids)
      .eq("actif", true)
      .eq("vendable_en_ligne", true)
      .eq("composant", false)
      .eq("statut_vitrine", "publie")
      .or(FILTRE_PUBLICATION()),
    contextePrix(),
    clientId ? estMembreActif(supabaseAdmin, clientId) : Promise.resolve(false),
  ]);

  const brutes = (data ?? []) as unknown as Record<string, unknown>[];
  for (const a of brutes) {
    articles.set(String(a.id), {
      id: String(a.id),
      nom: String(a.nom),
      prix_vente: Number(a.prix_vente),
      taux_tva: Number(a.taux_tva ?? 0),
      secteur_tdfn: (a.secteur_tdfn as string | null) ?? null,
      type_article: String(a.type_article ?? "standard"),
      poids_grammes: a.poids_grammes === null || a.poids_grammes === undefined ? null : Number(a.poids_grammes),
      stock_disponible: Math.max(Number(a.stock_actuel ?? 0) - Number(a.stock_reserve ?? 0), 0),
    });
  }

  // Les options : seulement pour les articles sur mesure du panier.
  const surMesure = brutes.filter((a) => String(a.type_article) === "personnalisable").map((a) => String(a.id));
  const resolus = await Promise.all(surMesure.map(async (id) => [id, await lireCatalogueOptions(id)] as const));
  for (const [id, res] of resolus) options.set(id, res);

  // Le prix du jour : la fonction unique, avec la remise d'adhésion du client.
  const prixArticle = (article: ArticleCatalogue) => {
    const brut = brutes.find((a) => String(a.id) === article.id);
    if (!brut) return vide();
    const applicable = prixDe(ctx, brut as never, { estMembre: membre });
    const remise = remiseLigneFigee(applicable);
    return {
      prixFinal: applicable.prixFinal,
      prix_base: remise?.prix_base ?? null,
      remise_pourcentage: remise?.remise_pourcentage ?? null,
      remise_origine: remise?.remise_origine ?? null,
      remise_libelle: remise?.remise_libelle ?? null,
    };
  };

  return {
    articles,
    options: new Map([...options].map(([id, o]) => [id, { groupes: o.groupes, dependances: o.dependances }])),
    prixArticle,
  };
}

function vide() {
  return { prixFinal: 0, prix_base: null, remise_pourcentage: null, remise_origine: null, remise_libelle: null };
}
