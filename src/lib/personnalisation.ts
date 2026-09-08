import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { aujourdhuiISO } from "@/src/lib/dates";
import {
  estEnRetard,
  resoudreGroupes,
  type BlocOptions,
  type Fusion,
  type ChoixFige,
  type OptionGroupe,
  type OptionValeur,
  type Dependance,
} from "@/src/lib/personnalisationLogique";

/**
 * Articles personnalisables — couche base. Elle ne décide rien : les règles
 * viennent de personnalisationLogique, et la transaction vient des RPC
 * creer_commande_sur_mesure / changer_statut_commande, qui appellent
 * eux-mêmes finaliser_vente et passer_ecriture. Rien de neuf côté comptable.
 */

const COLONNES_GROUPE = `
  id, article_id, modele_id, nom, type, obligatoire, ordre, aide, max_caracteres,
  depend_de_groupe_id, unite, valeur_min, valeur_max, pas, guide_image_path,
  alerte_min, alerte_max, seuil_supplement, supplement_au_dela,
  mesure_groupe_id, mode_taille, supplement_par_cm, borne_supplement_cm
`;
const COLONNES_VALEUR = `
  id, groupe_id, libelle, image_path, code_couleur, supplement_prix,
  supplement_delai_jours, composant_article_id, composant_quantite, actif, ordre, defaut,
  borne_min, borne_max
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

/** Les valeurs de chaque groupe, dans l'ordre, accrochées à leur groupe. */
async function avecValeurs(groupes: unknown[]): Promise<OptionGroupe[]> {
  const lignes = groupes as { id: string }[];
  const ids = lignes.map((g) => g.id);
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

  return lignes.map((g) => ({
    ...(g as unknown as Omit<OptionGroupe, "valeurs">),
    valeurs: parGroupe.get(g.id) ?? [],
  }));
}

/** Les groupes PROPRES d'un article : ceux qu'il porte lui-même, sans modèle. */
export async function lireGroupes(articleId: string): Promise<OptionGroupe[]> {
  const { data } = await supabaseAdmin
    .from("options_groupes")
    .select(COLONNES_GROUPE)
    .eq("article_id", articleId)
    .order("ordre");
  return avecValeurs(data ?? []);
}

/** Les groupes d'un modèle de la bibliothèque, dans l'ordre. */
export async function lireGroupesModele(modeleId: string): Promise<OptionGroupe[]> {
  const { data } = await supabaseAdmin
    .from("options_groupes")
    .select(COLONNES_GROUPE)
    .eq("modele_id", modeleId)
    .order("ordre");
  return avecValeurs(data ?? []);
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

/**
 * Copie un catalogue d'options d'un porteur vers un autre. Chaque côté est un
 * article OU un modèle : c'est ce qui permet de reprendre un modèle dans un
 * article, ou d'ouvrir un nouveau modèle à partir d'un existant. Les liens de
 * dépendance et les prix par combinaison sont rejoués sur les copies.
 */
export async function dupliquerOptions(
  source: { article?: string | null; modele?: string | null },
  cible: { article?: string | null; modele?: string | null }
): Promise<{ error?: string; groupes?: number; valeurs?: number }> {
  const { data, error } = await supabaseAdmin.rpc("dupliquer_options", {
    p_source_article: source.article ?? null,
    p_source_modele: source.modele ?? null,
    p_cible_article: cible.article ?? null,
    p_cible_modele: cible.modele ?? null,
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
    .select("id, commande_id, groupe_nom, valeur_libelle, valeur_texte, code_couleur, supplement_prix, ordre, composant_article_id, composant_quantite, valeur_nombre, unite")
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

/**
 * Les dépendances entre options d'un article : quelle valeur en rend une
 * autre disponible. La règle, elle, vit dans personnalisationLogique.
 */
export async function dependancesDeValeurs(valeurIds: string[]): Promise<Dependance[]> {
  if (valeurIds.length === 0) return [];
  const { data } = await supabaseAdmin
    .from("options_dependances")
    .select("valeur_id, valeur_requise_id, supplement_prix")
    .in("valeur_id", valeurIds);
  return (data ?? []) as unknown as Dependance[];
}

/** Toutes les valeurs d'une liste de groupes, par identifiant. */
function idsDesValeurs(groupes: OptionGroupe[]): string[] {
  return groupes.flatMap((g) => (g.valeurs ?? []).map((v) => v.id));
}

/** Les dépendances des groupes PROPRES d'un article — écran d'administration. */
export async function lireDependances(articleId: string): Promise<Dependance[]> {
  const groupes = await lireGroupes(articleId);
  return dependancesDeValeurs(idsDesValeurs(groupes));
}

/** Les dépendances des groupes d'un modèle. */
export async function lireDependancesModele(modeleId: string): Promise<Dependance[]> {
  const groupes = await lireGroupesModele(modeleId);
  return dependancesDeValeurs(idsDesValeurs(groupes));
}

/** Le catalogue PROPRE d'un article et ses dépendances — écran d'administration. */
export async function lireCatalogueArticle(
  articleId: string
): Promise<{ groupes: OptionGroupe[]; dependances: Dependance[] }> {
  const groupes = await lireGroupes(articleId);
  return { groupes, dependances: await dependancesDeValeurs(idsDesValeurs(groupes)) };
}

/** Le catalogue d'un modèle et ses dépendances. */
export async function lireCatalogueModele(
  modeleId: string
): Promise<{ groupes: OptionGroupe[]; dependances: Dependance[] }> {
  const groupes = await lireGroupesModele(modeleId);
  return { groupes, dependances: await dependancesDeValeurs(idsDesValeurs(groupes)) };
}

// ── Bibliothèque de modèles d'options ──────────────────────────────────────

export type Modele = {
  id: string;
  nom: string;
  description: string | null;
  actif: boolean;
  created_at: string;
};

const COLONNES_MODELE = "id, nom, description, actif, created_at";

export async function lireModele(id: string): Promise<Modele | null> {
  const { data } = await supabaseAdmin
    .from("modeles_options").select(COLONNES_MODELE).eq("id", id).maybeSingle();
  return (data as Modele | null) ?? null;
}

/** La bibliothèque, avec de quoi juger d'un coup d'œil : groupes, valeurs, articles. */
export async function listerModeles(): Promise<
  (Modele & { nbGroupes: number; nbValeurs: number; nbArticles: number })[]
> {
  const { data } = await supabaseAdmin
    .from("modeles_options").select(COLONNES_MODELE).order("nom");
  const modeles = (data ?? []) as unknown as Modele[];
  if (modeles.length === 0) return [];

  const ids = modeles.map((m) => m.id);
  const { data: groupes } = await supabaseAdmin
    .from("options_groupes").select("id, modele_id").in("modele_id", ids);
  const lignes = (groupes ?? []) as unknown as { id: string; modele_id: string }[];

  const valeursParGroupe = new Map<string, number>();
  if (lignes.length > 0) {
    const { data: valeurs } = await supabaseAdmin
      .from("options_valeurs").select("id, groupe_id").in("groupe_id", lignes.map((g) => g.id));
    for (const v of (valeurs ?? []) as unknown as { groupe_id: string }[]) {
      valeursParGroupe.set(v.groupe_id, (valeursParGroupe.get(v.groupe_id) ?? 0) + 1);
    }
  }

  const { data: liens } = await supabaseAdmin
    .from("article_modeles").select("modele_id, article_id").in("modele_id", ids);

  return modeles.map((m) => {
    const siens = lignes.filter((g) => g.modele_id === m.id);
    return {
      ...m,
      nbGroupes: siens.length,
      nbValeurs: siens.reduce((n, g) => n + (valeursParGroupe.get(g.id) ?? 0), 0),
      nbArticles: ((liens ?? []) as unknown as { modele_id: string }[])
        .filter((l) => l.modele_id === m.id).length,
    };
  });
}

/** Les modèles attachés à un article, dans l'ordre de l'article. */
export async function modelesDArticle(
  articleId: string
): Promise<(Modele & { ordre: number })[]> {
  const { data: liens } = await supabaseAdmin
    .from("article_modeles").select("modele_id, ordre").eq("article_id", articleId).order("ordre");
  const lignes = (liens ?? []) as unknown as { modele_id: string; ordre: number }[];
  if (lignes.length === 0) return [];

  const { data } = await supabaseAdmin
    .from("modeles_options").select(COLONNES_MODELE).in("id", lignes.map((l) => l.modele_id));
  const parId = new Map((((data ?? []) as unknown as Modele[])).map((m) => [m.id, m]));

  return lignes
    .map((l) => {
      const m = parId.get(l.modele_id);
      return m ? { ...m, ordre: l.ordre } : null;
    })
    .filter((m): m is Modele & { ordre: number } => m !== null);
}

/** Les articles qui utilisent un modèle — pour avertir avant de toucher à quoi que ce soit. */
export async function articlesDuModele(
  modeleId: string
): Promise<{ id: string; nom: string; reference: string }[]> {
  const { data: liens } = await supabaseAdmin
    .from("article_modeles").select("article_id").eq("modele_id", modeleId);
  const ids = ((liens ?? []) as unknown as { article_id: string }[]).map((l) => l.article_id);
  if (ids.length === 0) return [];

  const { data } = await supabaseAdmin
    .from("articles").select("id, nom, reference").in("id", ids).order("nom");
  return (data ?? []) as unknown as { id: string; nom: string; reference: string }[];
}

/**
 * Le plan d'un article : ses modèles attachés puis ses groupes propres, chacun
 * dans un bloc. C'est resoudreGroupes qui en fait ensuite une seule liste.
 * Les groupes propres passent APRÈS les modèles : un modèle pose le cadre,
 * l'article ajoute ce qui lui est particulier.
 */
export async function blocsArticle(articleId: string): Promise<BlocOptions[]> {
  const [modeles, propres] = await Promise.all([
    modelesDArticle(articleId),
    lireGroupes(articleId),
  ]);

  const blocs: BlocOptions[] = [];
  for (const m of modeles) {
    blocs.push({ source: m.nom, ordre: m.ordre, groupes: await lireGroupesModele(m.id) });
  }
  const apres = modeles.reduce((max, m) => Math.max(max, m.ordre), 0) + 1;
  if (propres.length > 0) blocs.push({ source: "Cet article", ordre: apres, groupes: propres });
  return blocs;
}

/**
 * Le catalogue COMPLET d'un article : modèles attachés et groupes propres,
 * fusionnés et ordonnés, avec toutes les dépendances qui s'y rapportent.
 * C'est ce que voient le configurateur et la commande au comptoir.
 */
export async function lireCatalogueOptions(articleId: string): Promise<{
  groupes: OptionGroupe[];
  dependances: Dependance[];
  fusions: Fusion[];
}> {
  const { groupes, fusions } = resoudreGroupes(await blocsArticle(articleId));
  return { groupes, fusions, dependances: await dependancesDeValeurs(idsDesValeurs(groupes)) };
}

/**
 * Les options PROPRES d'un article que des commandes citent déjà. Le trigger
 * les protège en base ; les lire d'avance permet de refuser une manœuvre
 * complète — transformer en modèle, par exemple — avant de l'avoir entamée.
 */
export async function optionsCitees(articleId: string): Promise<string[]> {
  const groupes = await lireGroupes(articleId);
  if (groupes.length === 0) return [];

  const { data } = await supabaseAdmin
    .from("commandes_personnalisees").select("id").eq("article_id", articleId);
  const commandes = ((data ?? []) as unknown as { id: string }[]).map((c) => c.id);
  if (commandes.length === 0) return [];

  const { data: choix } = await supabaseAdmin
    .from("commandes_choix")
    .select("groupe_nom, valeur_libelle")
    .in("commande_id", commandes);

  const cites = new Set(
    ((choix ?? []) as unknown as { groupe_nom: string; valeur_libelle: string }[])
      .map((c) => `${c.groupe_nom}|${c.valeur_libelle}`)
  );

  const trouves: string[] = [];
  for (const g of groupes) {
    for (const v of g.valeurs ?? []) {
      if (cites.has(`${g.nom}|${v.libelle}`)) trouves.push(`${g.nom} · ${v.libelle}`);
    }
  }
  return trouves;
}
