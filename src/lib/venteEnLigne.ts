import { supabaseAdmin } from "@/src/lib/supabase-admin";
import {
  lireGrillePort,
  type LignePanier,
  type PalierPort,
  type StatutCommandeLigne,
} from "@/src/lib/venteEnLigneLogique";

/**
 * Vente en ligne — couche base. Elle ne décide rien : les règles viennent de
 * venteEnLigneLogique, et la transaction vient des RPC confirmer_commande /
 * remettre_commande / annuler_commande_en_ligne, qui appellent eux-mêmes
 * finaliser_vente et passer_ecriture. Rien de neuf côté comptable.
 */

export type Commande = {
  id: string;
  numero: string | null;
  client_id: string;
  statut: StatutCommandeLigne;
  mode_remise: string | null;
  reservation_id: string | null;
  adresse_livraison: Record<string, string> | null;
  frais_port: number | string;
  remise_membre: number | string;
  montant_total: number | string;
  mode_paiement: string | null;
  paiement_statut: string;
  paiement_reference: string | null;
  vente_id: string | null;
  facture_id: string | null;
  numero_suivi: string | null;
  motif_annulation: string | null;
  cle_idempotence: string | null;
  created_at: string;
  confirmee_le: string | null;
};

const COLONNES_COMMANDE = `
  id, numero, client_id, statut, mode_remise, reservation_id, adresse_livraison,
  frais_port, remise_membre, montant_total, mode_paiement, paiement_statut,
  paiement_reference, vente_id, facture_id, numero_suivi, motif_annulation,
  cle_idempotence, created_at, confirmee_le
`;

export type LigneCommande = {
  id: string;
  commande_id: string;
  article_id: string;
  commande_personnalisee_id: string | null;
  libelle: string;
  quantite: number | string;
  prix_unitaire: number | string;
  taux_tva: number | string;
  montant: number | string;
};

const COLONNES_LIGNE = `
  id, commande_id, article_id, commande_personnalisee_id, libelle,
  quantite, prix_unitaire, taux_tva, montant
`;

// ── Paramètres de la boutique en ligne ─────────────────────────────────────

export type ParametresEnLigne = {
  grillePort: PalierPort[];
  poidsMaxGrammes: number;
  remisePourcent: number;
  delaiPreparationJours: number;
};

export async function lireParametresEnLigne(): Promise<ParametresEnLigne> {
  const { data } = await supabaseAdmin
    .from("parametres")
    .select("cle, valeur")
    .in("cle", [
      "frais_port_grille", "poids_max_colis_grammes",
      "remise_membre_pourcent", "delai_preparation_jours",
    ]);

  const map = new Map(
    ((data ?? []) as unknown as { cle: string; valeur: string }[]).map((p) => [p.cle, p.valeur])
  );
  const entier = (cle: string, defaut: number) => {
    const n = Number(map.get(cle));
    return Number.isFinite(n) && n > 0 ? n : defaut;
  };

  return {
    grillePort: lireGrillePort(map.get("frais_port_grille")),
    poidsMaxGrammes: entier("poids_max_colis_grammes", 10000),
    remisePourcent: entier("remise_membre_pourcent", 10),
    delaiPreparationJours: entier("delai_preparation_jours", 2),
  };
}

// ── Le catalogue en ligne ──────────────────────────────────────────────────

export type ArticleEnLigne = {
  id: string;
  reference: string;
  nom: string;
  description: string | null;
  categorie: string;
  marque: string | null;
  prix_vente: number | string;
  taux_tva: number | string;
  unite: string;
  photo_path: string | null;
  type_article: string;
  delai_fabrication_jours: number | null;
  poids_grammes: number | null;
  expediable: boolean;
  stock_actuel: number | string;
  stock_reserve: number | string;
  /** Ce qui reste vraiment commandable : l'actuel moins ce qui est promis. */
  stock_disponible: number;
};

const COLONNES_ARTICLE = `
  id, reference, nom, description, categorie, marque, prix_vente, taux_tva, unite,
  photo_path, type_article, delai_fabrication_jours, poids_grammes, expediable,
  stock_actuel, stock_reserve
`;

function avecDisponible(a: Record<string, unknown>): ArticleEnLigne {
  const dispo = Number(a.stock_actuel ?? 0) - Number(a.stock_reserve ?? 0);
  return { ...(a as unknown as ArticleEnLigne), stock_disponible: Math.max(dispo, 0) };
}

/** Le catalogue proposé en ligne : actif, vendable en ligne, jamais un composant. */
export async function catalogueEnLigne(): Promise<ArticleEnLigne[]> {
  const { data } = await supabaseAdmin
    .from("articles")
    .select(COLONNES_ARTICLE)
    .eq("actif", true)
    .eq("vendable_en_ligne", true)
    .eq("composant", false)
    .order("nom");
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(avecDisponible);
}

export async function articleEnLigne(id: string): Promise<ArticleEnLigne | null> {
  const { data } = await supabaseAdmin
    .from("articles")
    .select(COLONNES_ARTICLE)
    .eq("id", id)
    .eq("actif", true)
    .eq("vendable_en_ligne", true)
    .eq("composant", false)
    .maybeSingle();
  return data ? avecDisponible(data as unknown as Record<string, unknown>) : null;
}

// ── Le panier ──────────────────────────────────────────────────────────────

export async function lireCommande(id: string): Promise<Commande | null> {
  const { data } = await supabaseAdmin
    .from("commandes").select(COLONNES_COMMANDE).eq("id", id).maybeSingle();
  return (data as Commande | null) ?? null;
}

export async function lignesDeCommande(commandeId: string): Promise<LigneCommande[]> {
  const { data } = await supabaseAdmin
    .from("commandes_lignes")
    .select(COLONNES_LIGNE)
    .eq("commande_id", commandeId)
    .order("created_at");
  return (data ?? []) as unknown as LigneCommande[];
}

/** Le panier du client, créé au premier ajout. Un seul à la fois, par index unique. */
export async function panierDuClient(clientId: string, creer = false): Promise<Commande | null> {
  const { data } = await supabaseAdmin
    .from("commandes")
    .select(COLONNES_COMMANDE)
    .eq("client_id", clientId)
    .eq("statut", "panier")
    .maybeSingle();
  if (data) return data as unknown as Commande;
  if (!creer) return null;

  const { data: cree, error } = await supabaseAdmin
    .from("commandes")
    .insert({ client_id: clientId, statut: "panier" })
    .select(COLONNES_COMMANDE)
    .single();
  if (error) {
    // Deux onglets ont pu créer en même temps : le second relit celui du premier.
    return panierDuClient(clientId, false);
  }
  return cree as unknown as Commande;
}

/**
 * Le panier enrichi de ce qu'il faut pour décider : poids, expédiabilité et
 * stock disponible AU MOMENT OÙ ON REGARDE. Le serveur revérifiera dans la
 * transaction — ici, on prévient tôt.
 */
export async function lignesPanier(commandeId: string): Promise<LignePanier[]> {
  const lignes = await lignesDeCommande(commandeId);
  if (lignes.length === 0) return [];

  const { data: articles } = await supabaseAdmin
    .from("articles")
    .select("id, poids_grammes, expediable, type_article, stock_actuel, stock_reserve")
    .in("id", [...new Set(lignes.map((l) => l.article_id))]);

  const parId = new Map(
    ((articles ?? []) as unknown as Record<string, unknown>[]).map((a) => [a.id as string, a])
  );

  return lignes.map((l) => {
    const a = parId.get(l.article_id);
    const dispo = a ? Number(a.stock_actuel ?? 0) - Number(a.stock_reserve ?? 0) : 0;
    return {
      article_id: l.article_id,
      libelle: l.libelle,
      quantite: Number(l.quantite),
      prix_unitaire: Number(l.prix_unitaire),
      taux_tva: Number(l.taux_tva),
      commande_personnalisee_id: l.commande_personnalisee_id,
      poids_grammes: a?.poids_grammes === null || a?.poids_grammes === undefined
        ? null : Number(a.poids_grammes),
      expediable: a?.expediable !== false,
      type_article: (a?.type_article as string) ?? "standard",
      stock_disponible: Math.max(dispo, 0),
    };
  });
}

/** Le compteur affiché dans la barre : le nombre d'articles, pas de lignes. */
export async function nombreArticlesPanier(clientId: string): Promise<number> {
  const panier = await panierDuClient(clientId);
  if (!panier) return 0;
  const lignes = await lignesDeCommande(panier.id);
  return lignes.reduce((s, l) => s + Number(l.quantite), 0);
}

// ── Réservations à venir, pour le mode « départ du chien » ─────────────────

export type ReservationProche = {
  id: string;
  numero: number | null;
  date_debut: string;
  date_fin: string;
  chien: string | null;
};

/**
 * Les séjours validés du client dont la fin n'est pas passée : à venir ou en
 * cours. Un séjour terminé ne sert à rien — le chien est déjà reparti, et la
 * commande aurait dû partir avec lui.
 */
export async function reservationsAVenir(
  clientId: string,
  jourISO: string
): Promise<ReservationProche[]> {
  const { data } = await supabaseAdmin
    .from("reservations")
    .select("id, numero, date_debut, date_fin, statut, chiens(nom)")
    .eq("client_id", clientId)
    .eq("statut", "validee")
    .gte("date_fin", jourISO)
    .order("date_debut");

  return ((data ?? []) as unknown as {
    id: string; numero: number | null; date_debut: string; date_fin: string;
    chiens: { nom: string } | { nom: string }[] | null;
  }[]).map((r) => ({
    id: r.id,
    numero: r.numero,
    date_debut: r.date_debut,
    date_fin: r.date_fin,
    chien: Array.isArray(r.chiens) ? r.chiens[0]?.nom ?? null : r.chiens?.nom ?? null,
  }));
}

// ── Côté pension ───────────────────────────────────────────────────────────

export type CommandeAvecClient = Commande & {
  client: { id: string; prenom: string | null; nom: string | null; email: string | null } | null;
  lignes: LigneCommande[];
};

export async function listerCommandesEnLigne(options?: {
  statuts?: StatutCommandeLigne[];
}): Promise<CommandeAvecClient[]> {
  let requete = supabaseAdmin
    .from("commandes")
    .select(COLONNES_COMMANDE)
    .neq("statut", "panier")
    .order("created_at", { ascending: false });

  if (options?.statuts && options.statuts.length > 0) {
    requete = requete.in("statut", options.statuts);
  }

  const { data } = await requete;
  const commandes = (data ?? []) as unknown as Commande[];
  if (commandes.length === 0) return [];

  const [{ data: clients }, { data: lignes }] = await Promise.all([
    supabaseAdmin
      .from("clients").select("id, prenom, nom, email")
      .in("id", [...new Set(commandes.map((c) => c.client_id))]),
    supabaseAdmin
      .from("commandes_lignes").select(COLONNES_LIGNE)
      .in("commande_id", commandes.map((c) => c.id)).order("created_at"),
  ]);

  const parClient = new Map(
    ((clients ?? []) as unknown as { id: string; prenom: string | null; nom: string | null; email: string | null }[])
      .map((c) => [c.id, c])
  );
  const parCommande = new Map<string, LigneCommande[]>();
  for (const l of (lignes ?? []) as unknown as LigneCommande[]) {
    const liste = parCommande.get(l.commande_id) ?? [];
    liste.push(l);
    parCommande.set(l.commande_id, liste);
  }

  return commandes.map((c) => ({
    ...c,
    client: parClient.get(c.client_id) ?? null,
    lignes: parCommande.get(c.id) ?? [],
  }));
}

export async function commandesDuClient(clientId: string): Promise<CommandeAvecClient[]> {
  const { data } = await supabaseAdmin
    .from("commandes")
    .select(COLONNES_COMMANDE)
    .eq("client_id", clientId)
    .neq("statut", "panier")
    .order("created_at", { ascending: false });

  const commandes = (data ?? []) as unknown as Commande[];
  if (commandes.length === 0) return [];

  const { data: lignes } = await supabaseAdmin
    .from("commandes_lignes").select(COLONNES_LIGNE)
    .in("commande_id", commandes.map((c) => c.id)).order("created_at");

  const parCommande = new Map<string, LigneCommande[]>();
  for (const l of (lignes ?? []) as unknown as LigneCommande[]) {
    const liste = parCommande.get(l.commande_id) ?? [];
    liste.push(l);
    parCommande.set(l.commande_id, liste);
  }

  return commandes.map((c) => ({ ...c, client: null, lignes: parCommande.get(c.id) ?? [] }));
}

/**
 * Les commandes qui attendent d'être remises à ce client, ou au départ de ce
 * séjour. C'est le signal qui empêche de rendre le chien sans le colis.
 */
export async function commandesARemettre(p: {
  clientId?: string | null;
  reservationId?: string | null;
}): Promise<Commande[]> {
  if (!p.clientId && !p.reservationId) return [];

  let requete = supabaseAdmin
    .from("commandes")
    .select(COLONNES_COMMANDE)
    .in("statut", ["confirmee", "en_preparation", "prete"])
    .in("mode_remise", ["retrait", "depart_chien"]);

  requete = p.reservationId
    ? requete.eq("reservation_id", p.reservationId)
    : requete.eq("client_id", p.clientId!);

  const { data } = await requete.order("created_at");
  return (data ?? []) as unknown as Commande[];
}

/** Les mêmes, pour plusieurs clients d'un coup — « Chiens du jour ». */
export async function clientsAvecCommandeARemettre(
  clientIds: string[]
): Promise<Map<string, number>> {
  if (clientIds.length === 0) return new Map();
  const { data } = await supabaseAdmin
    .from("commandes")
    .select("client_id")
    .in("client_id", clientIds)
    .in("statut", ["confirmee", "en_preparation", "prete"])
    .in("mode_remise", ["retrait", "depart_chien"]);

  const par = new Map<string, number>();
  for (const c of ((data ?? []) as unknown as { client_id: string }[])) {
    par.set(c.client_id, (par.get(c.client_id) ?? 0) + 1);
  }
  return par;
}
