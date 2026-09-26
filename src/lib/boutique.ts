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
import { PERIMETRES, type PerimetreStock } from "@/src/lib/perimetreStock";
import { disponibleDe } from "@/src/lib/alertesStockLogique";
import { coutMatieres, type ChoixAvecFourniture } from "@/src/lib/coutMoyen";

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
  secteur_tdfn: string | null;
  prix_vente: number | string;
  prix_achat: number | string | null;
  /** Coût moyen pondéré des unités en stock, tenu par le trigger du stock. */
  cout_moyen: number | string | null;
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
  /** APP 16 : ce que l'article MONTRE, distinct de `actif` qui dit s'il existe. */
  statut_vitrine: string;
  date_publication: string | null;
  publier_a_l_entree_stock: boolean;
  date_limite: string | null;
  remise_membre_exclue: boolean;
  /* APP 26 : ce qui s'achète même à stock zéro. La case seule ne suffit pas —
     il faut aussi un délai, propre à l'article ou hérité du fournisseur. */
  disponible_sur_commande: boolean;
  delai_commande_min_jours: number | null;
  delai_commande_max_jours: number | null;
  /** Envoi postal : poids en grammes (null : inconnu) et expédiabilité. */
  poids_grammes: number | null;
  expediable: boolean;
  /* Les étiquettes des filtres (APP 24-FILTRES). Vocabulaire fermé tenu par
     la base ; les libellés sont dans src/lib/etiquettesArticles.ts. */
  ages: string[];
  besoins: string[];
  tailles_chien: string[];
  proteines: string[];
  sans_cereales: boolean;
  monoproteine: boolean;
  taille_article: string | null;
  couleurs: string[];
  matieres: string[];
  usages_jouet: string[];
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
  /** Coût d'achat HT d'une unité, sur une entrée. Null : coût non renseigné. */
  cout_unitaire: number | string | null;
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
export type ArticleVente = Omit<Article, "prix_achat" | "cout_moyen" | "fournisseur_id">;

const COLONNES_MOUVEMENT = `
  id, article_id, type, quantite, quantite_apres, motif, depense_id, vente_id,
  date_peremption, cout_unitaire, user_id, created_at
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

export type OptionsListe = {
  actifsSeulement?: boolean;
  /**
   * Le périmètre de l'écran. « boutique » ne rend QUE ce qui se vend,
   * « atelier » QUE les fournitures de fabrication. Le filtre est dans la
   * requête, pas à l'affichage : une fourniture ne doit pas partir vers un
   * écran de magasin, même pour y être cachée ensuite.
   *
   * Omis, la liste est complète — c'est ce qu'il faut à la reprise d'une
   * dépense, où l'on peut avoir acheté des deux sur la même facture.
   */
  perimetre?: PerimetreStock;
};

/** Tous les articles, du plus récent au plus ancien nom : la liste est courte. */
export async function listerArticles(options?: OptionsListe): Promise<Article[]> {
  let requete = supabaseAdmin.from("articles").select(COLONNES_ARTICLE).order("nom");
  if (options?.actifsSeulement) requete = requete.eq("actif", true);
  if (options?.perimetre) {
    requete = requete.eq("composant", PERIMETRES[options.perimetre].composant);
  }
  const { data } = await requete;
  return (data ?? []) as unknown as Article[];
}

/**
 * Le catalogue au niveau demandé. C'est LE point d'entrée des écrans : le
 * niveau vient de la garde d'accès, jamais du navigateur.
 */
export async function listerArticlesSelonNiveau(
  niveau: NiveauCatalogue,
  options?: OptionsListe
): Promise<(Article | ArticleVente)[]> {
  let requete = supabaseAdmin.from("articles").select(colonnesArticle(niveau)).order("nom");
  if (options?.actifsSeulement) requete = requete.eq("actif", true);
  if (options?.perimetre) {
    requete = requete.eq("composant", PERIMETRES[options.perimetre].composant);
  }
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
  /** Coût d'achat HT d'une unité — seulement sur une entrée ; vide = non renseigné. */
  cout_unitaire?: number | null;
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

  // La disponibilité AVANT l'écriture : c'est elle qui dira si l'article
  // « revient ». On la prend ici, pendant qu'on tient encore la fiche.
  const disponibleAvant = disponibleDe(
    article.stock_actuel,
    (article as unknown as { stock_reserve?: number | string | null }).stock_reserve
  );

  /*
   * UNE ENTRÉE passe par `recevoir_marchandise`, jamais par un insert direct.
   *
   * C'est ce qui rend vraie la garantie d'APP 26 : la fonction écrit le
   * mouvement ET réserve la marchandise pour les commandes qui l'attendent,
   * dans la MÊME transaction. Entre les deux gestes, il ne doit exister aucun
   * instant — une caisse ouverte au même moment vendrait au premier venu le sac
   * qu'une cliente attend depuis trois semaines.
   *
   * Un insert direct ici rétablirait cet instant, et rien ne le signalerait :
   * le stock serait juste, les comptes seraient justes, et une cliente
   * repartirait les mains vides. Un test lit donc cette ligne.
   *
   * Les autres types (perte, retour, ajustement…) n'ont rien à réserver et
   * gardent le chemin d'avant.
   */
  let mouvementId: string;
  let quantiteApres: number;
  let reserveApres: number | null = null;

  if (m.type === "entree") {
    const { data: recu, error: erreurRecu } = await supabaseAdmin.rpc("recevoir_marchandise", {
      p_article_id: m.article_id,
      p_quantite: arrondiQuantite(m.quantite),
      p_cout_unitaire: m.cout_unitaire ?? null,
      p_motif: m.motif?.trim() || null,
      p_user_id: m.user_id ?? null,
      p_depense_id: m.depense_id ?? null,
      p_date_peremption: m.date_peremption || null,
    });
    if (erreurRecu) return { error: erreurRecu.message };
    const r = recu as {
      mouvement_id: string; quantite_apres: number | string; stock_reserve_apres: number | string;
    };
    mouvementId = r.mouvement_id;
    quantiteApres = Number(r.quantite_apres);
    reserveApres = Number(r.stock_reserve_apres);
  } else {
    const { data, error } = await supabaseAdmin
      .from("mouvements_stock")
      .insert({
        article_id: m.article_id,
        type: m.type,
        quantite: arrondiQuantite(m.quantite),
        motif: m.motif?.trim() || null,
        depense_id: m.depense_id ?? null,
        date_peremption: m.date_peremption || null,
        // Le trigger du stock repondère le coût moyen et met à jour le dernier
        // prix d'achat. Un coût ne se pose que sur une entrée.
        cout_unitaire: null,
        user_id: m.user_id ?? null,
      })
      .select("id, quantite_apres")
      .single();

    if (error) return { error: error.message };
    mouvementId = data.id as string;
    quantiteApres = Number(data.quantite_apres);
  }

  // Le RETOUR EN STOCK se constate ici, et nulle part ailleurs : c'est le seul
  // endroit où le stock d'un article augmente. La condition n'est pas « une
  // entrée a eu lieu » mais « il n'y en avait plus, il y en a » — une livraison
  // sur un article encore disponible ne réveille personne.
  //
  // L'envoi ne peut jamais faire échouer le mouvement : il est déjà écrit, et
  // `notifierSiRetourEnStock` ne lève pas.
  //
  // La réserve d'APRÈS, et non celle d'avant : une réception qui vient de
  // servir une commande en attente n'a rien rendu disponible. Avec la réserve
  // d'avant, on annoncerait un « retour en stock » pour une marchandise déjà
  // promise, et trois personnes viendraient pour un seul sac.
  const disponibleApres = disponibleDe(
    quantiteApres,
    reserveApres ?? (article as unknown as { stock_reserve?: number | string | null }).stock_reserve
  );
  const { notifierSiRetourEnStock } = await import("@/src/lib/alertesStock");
  await notifierSiRetourEnStock({
    articleId: m.article_id,
    disponibleAvant,
    disponibleApres,
  });

  // La PUBLICATION À L'ENTRÉE DE STOCK se branche ici, et nulle part ailleurs :
  // c'est déjà le seul endroit où le stock bouge, et la disponibilité d'avant
  // et d'après est déjà sous la main. Elle ne peut pas faire échouer le
  // mouvement — il est écrit, et `publierSiEntreeStock` ne lève pas.
  const { publierSiEntreeStock } = await import("@/src/lib/publicationArticle");
  await publierSiEntreeStock({
    article,
    disponibleAvant,
    disponibleApres,
    userId: m.user_id ?? null,
  });

  return { id: mouvementId, stock: quantiteApres };
}

export type LigneEntreeStock = {
  article_id: string;
  quantite: number;
  date_peremption?: string | null;
  /** Coût d'achat HT d'une unité. Null : l'entrée passe, « coût non renseigné ». */
  cout_unitaire?: number | null;
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
      cout_unitaire: ligne.cout_unitaire ?? null,
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

/**
 * Le coût des matières d'une pièce sur mesure, depuis ses fournitures et leur
 * coût moyen du moment. Null s'il n'est pas calculable : l'écran dira « coût non
 * renseigné », il n'invente rien.
 */
export async function coutMatieresDeChoix(choix: ChoixAvecFourniture[]): Promise<number | null> {
  const ids = [...new Set(choix.map((c) => c.composant_article_id).filter((x): x is string => !!x))];
  if (ids.length === 0) return null;
  const { data, error } = await supabaseAdmin.from("articles").select("id, cout_moyen").in("id", ids);
  if (error) return null;
  const couts = new Map(
    ((data ?? []) as { id: string; cout_moyen: number | string | null }[])
      .map((a) => [a.id, a.cout_moyen === null ? null : Number(a.cout_moyen)])
  );
  return coutMatieres(choix, couts);
}
