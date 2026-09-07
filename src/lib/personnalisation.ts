import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { aujourdhuiISO } from "@/src/lib/dates";
import {
  estEnRetard,
  type ChoixFige,
  type OptionGroupe,
  type OptionValeur,
} from "@/src/lib/personnalisationLogique";

/**
 * Articles personnalisables — couche base. Elle ne décide rien : les règles
 * viennent de personnalisationLogique, et la transaction vient des RPC
 * creer_commande_sur_mesure / changer_statut_commande, qui appellent
 * eux-mêmes finaliser_vente et passer_ecriture. Rien de neuf côté comptable.
 */

const COLONNES_GROUPE = "id, article_id, nom, type, obligatoire, ordre, aide, max_caracteres";
const COLONNES_VALEUR = `
  id, groupe_id, libelle, image_path, code_couleur, supplement_prix,
  supplement_delai_jours, composant_article_id, composant_quantite, actif, ordre, defaut
`;

export type Commande = {
  id: string;
  numero: string | null;
  vente_id: string | null;
  client_id: string;
  article_id: string;
  prix_total: number | string;
  delai_jours: number;
  date_promise: string | null;
  statut: string;
  notes: string | null;
  composants_consommes: boolean;
  created_by: string | null;
  created_at: string;
};

const COLONNES_COMMANDE = `
  id, numero, vente_id, client_id, article_id, prix_total, delai_jours, date_promise,
  statut, notes, composants_consommes, created_by, created_at
`;

/** Le catalogue d'options d'un article, groupes et valeurs, dans l'ordre. */
export async function lireGroupes(articleId: string): Promise<OptionGroupe[]> {
  const { data: groupes } = await supabaseAdmin
    .from("options_groupes")
    .select(COLONNES_GROUPE)
    .eq("article_id", articleId)
    .order("ordre");

  const ids = (groupes ?? []).map((g) => g.id as string);
  if (ids.length === 0) return [];

  const { data: valeurs } = await supabaseAdmin
    .from("options_valeurs")
    .select(COLONNES_VALEUR)
    .in("groupe_id", ids)
    .order("ordre");

  const parGroupe = new Map<string, OptionValeur[]>();
  for (const v of (valeurs ?? []) as unknown as (OptionValeur & { groupe_id: string })[]) {
    const liste = parGroupe.get(v.groupe_id) ?? [];
    liste.push(v);
    parGroupe.set(v.groupe_id, liste);
  }

  return (groupes ?? []).map((g) => ({
    ...(g as unknown as Omit<OptionGroupe, "valeurs">),
    valeurs: parGroupe.get(g.id as string) ?? [],
  }));
}

/** Les articles vers lesquels on peut dupliquer, ou depuis lesquels copier. */
export async function articlesPersonnalisables(sauf?: string): Promise<
  { id: string; nom: string; reference: string; nbGroupes: number }[]
> {
  const { data } = await supabaseAdmin
    .from("articles")
    .select("id, nom, reference")
    .eq("type_article", "personnalisable")
    .eq("actif", true)
    .order("nom");

  const liste = (data ?? []).filter((a) => a.id !== sauf);
  if (liste.length === 0) return [];

  const { data: groupes } = await supabaseAdmin
    .from("options_groupes")
    .select("article_id")
    .in("article_id", liste.map((a) => a.id as string));

  const compte = new Map<string, number>();
  for (const g of groupes ?? []) {
    compte.set(g.article_id as string, (compte.get(g.article_id as string) ?? 0) + 1);
  }

  return liste.map((a) => ({
    id: a.id as string,
    nom: a.nom as string,
    reference: a.reference as string,
    nbGroupes: compte.get(a.id as string) ?? 0,
  }));
}

// ── Commandes ───────────────────────────────────────────────────────────────

export type ResultatCommande = {
  error?: string;
  id?: string;
  numero?: string;
  vente_id?: string | null;
  deja?: boolean;
};

export type VentePourCommande = {
  cle_idempotence: string;
  mode: string;
  lignes: Record<string, unknown>[];
  total: number;
  arrondi: number;
  ecriture_lignes: Record<string, unknown>[];
  facture_id?: string | null;
  montant_recu?: number | null;
};

export async function creerCommande(entree: {
  cle_idempotence: string;
  client_id: string;
  article_id: string;
  choix: ChoixFige[];
  prix: number;
  delai: number;
  date_promise: string | null;
  notes?: string | null;
  user_id?: string | null;
  vente?: VentePourCommande | null;
}): Promise<ResultatCommande> {
  const { data, error } = await supabaseAdmin.rpc("creer_commande_sur_mesure", {
    p_cle_idempotence: entree.cle_idempotence,
    p_client_id: entree.client_id,
    p_article_id: entree.article_id,
    p_choix: entree.choix,
    p_prix: entree.prix,
    p_delai: entree.delai,
    p_date_promise: entree.date_promise,
    p_notes: entree.notes ?? null,
    p_user_id: entree.user_id ?? null,
    p_vente: entree.vente ?? null,
  });

  if (error) return { error: messageBase(error.message) };
  const res = data as { id: string; numero: string; vente_id: string | null; deja: boolean };
  return { id: res.id, numero: res.numero, vente_id: res.vente_id, deja: res.deja };
}

export async function changerStatutCommande(
  commandeId: string,
  statut: string,
  userId?: string | null,
  motif?: string | null
): Promise<{ error?: string; consommes?: number; statut?: string }> {
  const { data, error } = await supabaseAdmin.rpc("changer_statut_commande", {
    p_commande_id: commandeId,
    p_statut: statut,
    p_user_id: userId ?? null,
    p_motif: motif ?? null,
  });
  if (error) return { error: messageBase(error.message) };
  const res = data as { statut: string; consommes: number };
  return { statut: res.statut, consommes: res.consommes };
}

export async function dupliquerOptions(
  source: string,
  cible: string,
  userId?: string | null
): Promise<{ error?: string; groupes?: number; valeurs?: number }> {
  const { data, error } = await supabaseAdmin.rpc("dupliquer_options_article", {
    p_source: source,
    p_cible: cible,
    p_user_id: userId ?? null,
  });
  if (error) return { error: messageBase(error.message) };
  const res = data as { groupes: number; valeurs: number };
  return { groupes: res.groupes, valeurs: res.valeurs };
}

export async function lireCommande(id: string): Promise<Commande | null> {
  const { data } = await supabaseAdmin
    .from("commandes_personnalisees").select(COLONNES_COMMANDE).eq("id", id).maybeSingle();
  return (data as Commande | null) ?? null;
}

export type ChoixCommande = ChoixFige & { id: string; commande_id: string };

export async function choixDeCommande(commandeId: string): Promise<ChoixCommande[]> {
  const { data } = await supabaseAdmin
    .from("commandes_choix")
    .select("id, commande_id, groupe_nom, valeur_libelle, valeur_texte, code_couleur, supplement_prix, ordre, composant_article_id, composant_quantite")
    .eq("commande_id", commandeId)
    .order("ordre");
  return (data ?? []) as unknown as ChoixCommande[];
}

export type CommandeAffichee = Commande & {
  client: string;
  clientEmail: string | null;
  article: string;
  choix: ChoixCommande[];
  enRetard: boolean;
};

/** Les commandes, prêtes à afficher : client, article et choix déjà résolus. */
export async function listerCommandes(options?: {
  statuts?: string[];
  limite?: number;
}): Promise<CommandeAffichee[]> {
  let requete = supabaseAdmin
    .from("commandes_personnalisees")
    .select(COLONNES_COMMANDE)
    .order("date_promise", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (options?.statuts?.length) requete = requete.in("statut", options.statuts);

  const { data } = await requete.limit(options?.limite ?? 300);
  const commandes = (data ?? []) as unknown as Commande[];
  if (commandes.length === 0) return [];

  const [{ data: clients }, { data: articles }, { data: choix }] = await Promise.all([
    supabaseAdmin.from("clients").select("id, prenom, nom, email")
      .in("id", [...new Set(commandes.map((c) => c.client_id))]),
    supabaseAdmin.from("articles").select("id, nom")
      .in("id", [...new Set(commandes.map((c) => c.article_id))]),
    supabaseAdmin
      .from("commandes_choix")
      .select("id, commande_id, groupe_nom, valeur_libelle, valeur_texte, code_couleur, supplement_prix, ordre, composant_article_id, composant_quantite")
      .in("commande_id", commandes.map((c) => c.id))
      .order("ordre"),
  ]);

  const nomClient = new Map(
    (clients ?? []).map((c) => [c.id as string, {
      nom: `${c.prenom ?? ""} ${c.nom ?? ""}`.trim(),
      email: (c.email as string) ?? null,
    }])
  );
  const nomArticle = new Map((articles ?? []).map((a) => [a.id as string, a.nom as string]));

  const parCommande = new Map<string, ChoixCommande[]>();
  for (const c of (choix ?? []) as unknown as ChoixCommande[]) {
    const liste = parCommande.get(c.commande_id) ?? [];
    liste.push(c);
    parCommande.set(c.commande_id, liste);
  }

  const jour = aujourdhuiISO();
  return commandes.map((c) => ({
    ...c,
    client: nomClient.get(c.client_id)?.nom ?? "Client",
    clientEmail: nomClient.get(c.client_id)?.email ?? null,
    article: nomArticle.get(c.article_id) ?? "Article",
    choix: parCommande.get(c.id) ?? [],
    enRetard: estEnRetard(c.date_promise, c.statut, jour),
  }));
}

/** Les chiffres du tableau de bord : à faire, et en retard. */
export async function compterCommandes(): Promise<{ aFaire: number; enRetard: number }> {
  const { data } = await supabaseAdmin
    .from("commandes_personnalisees")
    .select("statut, date_promise")
    .in("statut", ["a_faire", "en_cours", "prete"]);

  const jour = aujourdhuiISO();
  const lignes = (data ?? []) as { statut: string; date_promise: string | null }[];
  return {
    aFaire: lignes.filter((c) => c.statut === "a_faire").length,
    enRetard: lignes.filter((c) => estEnRetard(c.date_promise, c.statut, jour)).length,
  };
}

/** Jamais de texte Postgres à l'écran. */
function messageBase(message: string): string {
  const m = message ?? "";
  if (/Stock insuffisant|ne tient pas de stock|citée par une commande|remise : elle ne change plus/i.test(m)) return m;
  if (/Aucun choix|Commande introuvable|Statut inconnu|même article/i.test(m)) return m;
  if (/duplicate key/i.test(m)) return "Cet enregistrement existe déjà.";
  return "L'enregistrement a été refusé. Vérifiez la saisie.";
}
