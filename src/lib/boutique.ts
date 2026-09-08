import { supabaseAdmin } from "@/src/lib/supabase-admin";
import {
  refusMouvement,
  ajustementsInventaire,
  motifInventaire,
  arrondiQuantite,
  sousLeSeuil,
  colonnesArticle,
  type NiveauCatalogue,
  type LigneInventaire,
  type TypeMouvement,
} from "@/src/lib/boutiqueLogique";

/**
 * Boutique — couche base. Elle ne décide rien : les règles viennent de
 * boutiqueLogique, et le stock est tenu par le trigger SQL, jamais ici.
 *
 * Un mouvement de stock ne se modifie ni ne se supprime : une erreur se
 * corrige par un mouvement inverse motivé.
 */

export type Article = {
  id: string;
  reference: string;
  nom: string;
  description: string | null;
  categorie: string;
  marque: string | null;
  fournisseur_id: string | null;
  taux_tva: number | string;
  prix_vente: number | string;
  prix_achat: number | string | null;
  stock_actuel: number | string;
  stock_alerte: number | string | null;
  unite: string;
  code_barres: string | null;
  photo_path: string | null;
  actif: boolean;
  vendable_en_ligne: boolean;
  type_article: string;
  delai_fabrication_jours: number | null;
  composant: boolean;
  created_at: string;
};

export type MouvementStock = {
  id: string;
  article_id: string;
  type: TypeMouvement;
  quantite: number | string;
  quantite_apres: number | string | null;
  motif: string | null;
  depense_id: string | null;
  vente_id: string | null;
  date_peremption: string | null;
  user_id: string | null;
  created_at: string;
};

/**
 * Les colonnes viennent de boutiqueLogique : une seule liste, que les tests
 * lisent aussi. Deux listes finiraient par diverger, et c'est le jour où elles
 * divergent qu'un prix d'achat part au comptoir.
 */
const COLONNES_ARTICLE = colonnesArticle("gestion");
const COLONNES_ARTICLE_VENTE = colonnesArticle("vente");

/**
 * L'article tel que le voit une vendeuse : les champs réservés sont absents,
 * pas à null. Absents — pour qu'une lecture distraite ne les prenne pas pour
 * « zéro » ou « aucun fournisseur ».
 */
export type ArticleVente = Omit<Article, "prix_achat" | "fournisseur_id">;

const COLONNES_MOUVEMENT = `
  id, article_id, type, quantite, quantite_apres, motif, depense_id, vente_id,
  date_peremption, user_id, created_at
`;

export async function lireArticle(id: string): Promise<Article | null> {
  const { data } = await supabaseAdmin
    .from("articles")
    .select(COLONNES_ARTICLE)
    .eq("id", id)
    .maybeSingle();
  return (data as Article | null) ?? null;
}

/** La même fiche, amputée de ce que la vente n'a pas à connaître. */
export async function lireArticleVente(id: string): Promise<ArticleVente | null> {
  const { data } = await supabaseAdmin
    .from("articles")
    .select(COLONNES_ARTICLE_VENTE)
    .eq("id", id)
    .maybeSingle();
  return (data as ArticleVente | null) ?? null;
}

/** Tous les articles, du plus récent au plus ancien nom : la liste est courte. */
export async function listerArticles(options?: { actifsSeulement?: boolean }): Promise<Article[]> {
  let requete = supabaseAdmin.from("articles").select(COLONNES_ARTICLE).order("nom");
  if (options?.actifsSeulement) requete = requete.eq("actif", true);
  const { data } = await requete;
  return (data ?? []) as unknown as Article[];
}

/**
 * Le catalogue au niveau demandé. C'est LE point d'entrée des écrans : le
 * niveau vient de la garde d'accès, jamais du navigateur.
 */
export async function listerArticlesSelonNiveau(
  niveau: NiveauCatalogue,
  options?: { actifsSeulement?: boolean }
): Promise<(Article | ArticleVente)[]> {
  let requete = supabaseAdmin.from("articles").select(colonnesArticle(niveau)).order("nom");
  if (options?.actifsSeulement) requete = requete.eq("actif", true);
  const { data } = await requete;
  return (data ?? []) as unknown as (Article | ArticleVente)[];
}

export async function historiqueMouvements(articleId: string): Promise<MouvementStock[]> {
  const { data } = await supabaseAdmin
    .from("mouvements_stock")
    .select(COLONNES_MOUVEMENT)
    .eq("article_id", articleId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as MouvementStock[];
}

export async function mouvementsDeDepense(depenseId: string): Promise<MouvementStock[]> {
  const { data } = await supabaseAdmin
    .from("mouvements_stock")
    .select(COLONNES_MOUVEMENT)
    .eq("depense_id", depenseId)
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as MouvementStock[];
}

export type ResultatMouvement = { error?: string; id?: string; stock?: number };

/**
 * Un mouvement, un seul. Le refus est calculé avant l'écriture pour que le
 * message soit en français ; le trigger SQL reste le dernier mot, y compris
 * pour deux saisies simultanées.
 */
export async function enregistrerMouvement(m: {
  article_id: string;
  type: TypeMouvement;
  /** Quantité signée : positive à l'entrée, négative à la sortie. */
  quantite: number;
  motif?: string | null;
  depense_id?: string | null;
  date_peremption?: string | null;
  user_id?: string | null;
}): Promise<ResultatMouvement> {
  const article = await lireArticle(m.article_id);
  if (!article) return { error: "Article introuvable." };

  const refus = refusMouvement({
    type: m.type,
    quantite: m.quantite,
    stockActuel: Number(article.stock_actuel),
    motif: m.motif,
  });
  if (refus) return { error: refus };

  const { data, error } = await supabaseAdmin
    .from("mouvements_stock")
    .insert({
      article_id: m.article_id,
      type: m.type,
      quantite: arrondiQuantite(m.quantite),
      motif: m.motif?.trim() || null,
      depense_id: m.depense_id ?? null,
      date_peremption: m.date_peremption || null,
      user_id: m.user_id ?? null,
    })
    .select("id, quantite_apres")
    .single();

  if (error) return { error: error.message };
  return { id: data.id as string, stock: Number(data.quantite_apres) };
}

export type LigneEntreeStock = {
  article_id: string;
  quantite: number;
  date_peremption?: string | null;
};

/**
 * Entrées en stock rattachées à une dépense de marchandises.
 *
 * Aucune écriture comptable ici : l'achat est déjà passé en charge sur 4200 à
 * la validation de la dépense. Le stock est un compte de quantités, pas de
 * francs — la valorisation viendra à la clôture, par l'inventaire.
 */
export async function entrerStockDepuisDepense(
  depenseId: string,
  lignes: LigneEntreeStock[],
  userId?: string | null
): Promise<{ entrees: number; erreurs: string[] }> {
  const erreurs: string[] = [];
  let entrees = 0;

  for (const ligne of lignes) {
    const quantite = arrondiQuantite(Math.abs(Number(ligne.quantite)));
    if (!Number.isFinite(quantite) || quantite <= 0) continue;

    const res = await enregistrerMouvement({
      article_id: ligne.article_id,
      type: "entree",
      quantite,
      depense_id: depenseId,
      date_peremption: ligne.date_peremption ?? null,
      user_id: userId ?? null,
    });
    if (res.error) erreurs.push(res.error);
    else entrees += 1;
  }

  return { entrees, erreurs };
}

/**
 * Validation d'un inventaire : un mouvement d'ajustement par écart, tous avec
 * le même motif. Une ligne comptée juste ne produit rien.
 */
export async function validerInventaire(
  lignes: LigneInventaire[],
  dateISO: string,
  userId?: string | null
): Promise<{ ajustements: number; erreurs: string[] }> {
  const motif = motifInventaire(dateISO);
  const aPasser = ajustementsInventaire(lignes);
  const erreurs: string[] = [];
  let ajustements = 0;

  for (const a of aPasser) {
    const res = await enregistrerMouvement({
      article_id: a.article_id,
      type: "ajustement",
      quantite: a.quantite,
      motif,
      user_id: userId ?? null,
    });
    if (res.error) erreurs.push(res.error);
    else ajustements += 1;
  }

  return { ajustements, erreurs };
}

/** Articles actifs dont le stock a rejoint ou passé son seuil d'alerte. */
export async function compterArticlesSousSeuil(): Promise<number> {
  const { data } = await supabaseAdmin
    .from("articles")
    .select("stock_actuel, stock_alerte")
    .eq("actif", true);
  return (data ?? []).filter((a) =>
    sousLeSeuil(a as { stock_actuel: number | null; stock_alerte: number | null })
  ).length;
}

/**
 * Les chiffres du tableau de bord de la boutique. La lecture est ici, le
 * calcul est dans tableauBoutique — c'est lui que les tests couvrent.
 */
/**
 * Les chiffres du tableau de bord.
 *
 * Sans la gestion, les articles ne sont PAS lus : ni la valeur du stock (qui
 * se calcule au prix d'achat) ni le nombre d'articles sous le seuil (qui
 * appelle une décision d'achat) ne sont calculés. Une tuile qu'on n'a pas le
 * droit de voir ne doit pas exister dans la page, pas seulement y être cachée.
 */
export async function lireChiffresBoutique(jourISO: string, niveau: NiveauCatalogue = "gestion") {
  const { chiffresBoutique, debutDuMois } = await import("@/src/lib/tableauBoutique");

  const [{ data: ventes }, { data: commandes }, { data: articles }] = await Promise.all([
    supabaseAdmin
      .from("ventes")
      .select("date_vente, montant_total, mode_reglement, vente_origine_id")
      .gte("date_vente", `${debutDuMois(jourISO)}T00:00:00`),
    supabaseAdmin
      .from("commandes_personnalisees")
      .select("statut, date_promise")
      .in("statut", ["a_faire", "en_cours", "prete"]),
    niveau === "gestion"
      ? supabaseAdmin
          .from("articles")
          .select("actif, composant, type_article, stock_actuel, stock_alerte, prix_achat")
          .eq("actif", true)
      : Promise.resolve({ data: [] }),
  ]);

  return chiffresBoutique({
    ventes: (ventes ?? []) as never,
    commandes: (commandes ?? []) as never,
    articles: (articles ?? []) as never,
    jourISO,
  });
}
