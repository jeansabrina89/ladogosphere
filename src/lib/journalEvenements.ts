import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { auteurAffiche, type AuteurAffiche } from "@/src/lib/auteur";
import { lireAuteurs } from "@/src/lib/auteursDb";

// Journal des événements métier (ajout seul, verrouillé par trigger).
// Il répond à « qui a fait quoi, quand, et pourquoi » sur tout ce que le
// personnel touche : réservations, chiens, clients, paiements, ventes, factures.
// Il ne remplace pas le grand livre — il l'explique.
//
// Une trace ne se corrige jamais : une erreur se corrige par un nouveau geste,
// lui-même journalisé. La base le garantit (UPDATE, DELETE et TRUNCATE refusés,
// service role compris).

export type EntiteJournal =
  | "facture" | "paiement" | "avoir" | "reservation" | "depense" | "vente"
  // APP 15 : les alertes de retour en stock et l'article qu'elles visent.
  | "alerte_stock" | "article"
  // APP 14 : le régime de TVA et les décomptes déclarés.
  | "parametres_tva" | "decompte_tva"
  // APP 15 : les cartes prépayées, leur facture et leur expiration.
  | "abonnement"
  // Une écriture saisie à la main : le journal en porte la raison.
  | "ecriture"
  // APP 16 : les rubriques de la boutique et la remise d'adhésion.
  | "promotion" | "remise_membre"
  // APP 18 : l’identité juridique de l’entreprise, et ses changements.
  | "entite_juridique"
  // Un réglage de la table clé/valeur qui touche ce que les clients reçoivent.
  | "parametre"
  // Les fiches, les adhésions et les messages : tout geste du personnel se trace.
  | "chien" | "client" | "campagne";

export type EvenementJournal = {
  entite: EntiteJournal;
  entiteId: string;
  evenement: string;
  avant?: unknown;
  apres?: unknown;
  motif?: string | null;
  /**
   * La personne connectée qui a fait le geste — employée, admin ou client.
   * Null pour un geste parti tout seul (un cron) : l'écran affiche « automatique ».
   */
  userId?: string | null;
};

/** N'échoue jamais : une trace manquante ne doit pas annuler l'opération tracée. */
export async function tracerEvenement(e: EvenementJournal): Promise<void> {
  try {
    await supabaseAdmin.from("journal_evenements").insert({
      entite: e.entite,
      entite_id: e.entiteId,
      evenement: e.evenement,
      avant: e.avant ?? null,
      apres: e.apres ?? null,
      motif: e.motif ?? null,
      user_id: e.userId ?? null,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("journal_evenements:", err);
  }
}

/**
 * Marque d'un geste fait par un client SANS session — le lien de désinscription
 * d'un e-mail, par exemple. Sans elle, un `user_id` vide se lirait « automatique ».
 */
export const PAR_CLIENT_SANS_COMPTE = { par: "client" } as const;

export type LigneHistorique = {
  id: string;
  entite: string;
  evenement: string;
  /** Le libellé lisible, déjà résolu pour l'entité de la ligne. */
  libelle: string;
  motif: string | null;
  created_at: string;
  userId: string | null;
  auteur: AuteurAffiche;
  avant: Record<string, unknown> | null;
  apres: Record<string, unknown> | null;
};

type LigneBrute = {
  id: string; entite: string; entite_id: string; evenement: string; motif: string | null;
  created_at: string; user_id: string | null;
  avant: Record<string, unknown> | null; apres: Record<string, unknown> | null;
};

const COLONNES = "id, entite, entite_id, evenement, motif, created_at, user_id, avant, apres";

/** Donne à chaque ligne son libellé et son auteur, en une seule lecture des profils. */
async function habiller(lignes: LigneBrute[]): Promise<LigneHistorique[]> {
  const auteurs = await lireAuteurs(lignes.map((l) => l.user_id));
  return lignes.map((l) => ({
    id: String(l.id),
    entite: String(l.entite),
    evenement: String(l.evenement),
    libelle: libelleEvenement(String(l.evenement), String(l.entite)),
    motif: l.motif ?? null,
    created_at: String(l.created_at),
    userId: l.user_id ?? null,
    auteur: auteurAffiche(l.user_id ? auteurs.get(l.user_id) ?? null : null, {
      parClientSansCompte: l.apres?.par === "client",
    }),
    avant: l.avant ?? null,
    apres: l.apres ?? null,
  }));
}

/** Historique d'une entité, du plus récent au plus ancien. */
export async function lireHistorique(
  entite: EntiteJournal,
  entiteId: string,
): Promise<LigneHistorique[]> {
  const { data } = await supabaseAdmin
    .from("journal_evenements")
    .select(COLONNES)
    .eq("entite", entite)
    .eq("entite_id", entiteId)
    .order("created_at", { ascending: false });
  return habiller((data ?? []) as LigneBrute[]);
}

/** Historique de toutes les factures d'un client (fiche client). */
export async function lireHistoriqueClient(clientId: string): Promise<LigneHistorique[]> {
  const { data: factures } = await supabaseAdmin
    .from("factures").select("id").eq("client_id", clientId);
  const ids = (factures ?? []).map((f: { id: string }) => f.id);
  if (ids.length === 0) return [];

  const { data } = await supabaseAdmin
    .from("journal_evenements")
    .select(COLONNES)
    .in("entite_id", ids)
    .order("created_at", { ascending: false })
    .limit(100);
  return habiller((data ?? []) as LigneBrute[]);
}

/**
 * Tout ce qui est arrivé à une réservation, du plus récent au plus ancien.
 *
 * Les gestes sur la réservation elle-même (création, validation, arrivée,
 * départ, modification…), et ceux qui la touchent sans la porter : les
 * encaissements et leurs annulations, les avoirs émis sur ses factures. Les
 * traces purement techniques d'une facture (PDF, envoi) restent sur la facture.
 */
export async function lireHistoriqueReservation(reservationId: string): Promise<LigneHistorique[]> {
  const [{ data: parResa }, { data: parLigne }] = await Promise.all([
    supabaseAdmin.from("factures").select("id").eq("reservation_id", reservationId),
    supabaseAdmin.from("facture_lignes").select("facture_id").eq("reservation_id", reservationId),
  ]);
  const factures = [...new Set([
    ...((parResa ?? []) as { id: string }[]).map((f) => f.id),
    ...((parLigne ?? []) as { facture_id: string }[]).map((l) => l.facture_id),
  ])];

  const lectures = [
    supabaseAdmin.from("journal_evenements").select(COLONNES)
      .eq("entite", "reservation").eq("entite_id", reservationId),
    // Un encaissement est tracé sur la facture s'il y en a une, sinon sur la
    // réservation : les deux cas reviennent ici.
    supabaseAdmin.from("journal_evenements").select(COLONNES)
      .eq("entite", "paiement").in("entite_id", [reservationId, ...factures]),
  ];
  if (factures.length > 0) {
    lectures.push(
      supabaseAdmin.from("journal_evenements").select(COLONNES)
        .eq("entite", "facture").in("evenement", ["avoir", "avoir_recu"]).in("entite_id", factures),
    );
  }

  const resultats = await Promise.all(lectures);
  const vues = new Set<string>();
  const lignes = resultats
    .flatMap((r) => (r.data ?? []) as LigneBrute[])
    .filter((l) => (vues.has(l.id) ? false : (vues.add(l.id), true)))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  return habiller(lignes);
}

export type GesteCheckin = { le: string; auteur: AuteurAffiche };

/**
 * Qui a enregistré l'arrivée et le départ de chaque ligne de check-in.
 *
 * Seul le DERNIER geste de chaque sorte compte : une arrivée annulée puis
 * refaite montre la seconde. L'écran n'affiche rien pour ce qui n'est pas fait :
 * c'est à lui de croiser avec le statut de la ligne.
 */
export async function lireGestesCheckin(
  reservationIds: string[],
): Promise<Map<string, { arrivee: GesteCheckin | null; depart: GesteCheckin | null }>> {
  const parLigne = new Map<string, { arrivee: GesteCheckin | null; depart: GesteCheckin | null }>();
  const ids = [...new Set(reservationIds.filter(Boolean))];
  if (ids.length === 0) return parLigne;

  const { data } = await supabaseAdmin
    .from("journal_evenements")
    .select(COLONNES)
    .eq("entite", "reservation")
    .in("entite_id", ids)
    .in("evenement", ["arrivee", "depart"])
    .order("created_at", { ascending: true });

  for (const l of await habiller((data ?? []) as LigneBrute[])) {
    const checkinId = String(l.apres?.checkin_id ?? "");
    if (!checkinId) continue;
    const e = parLigne.get(checkinId) ?? { arrivee: null, depart: null };
    const geste = { le: l.created_at, auteur: l.auteur };
    if (l.evenement === "arrivee") e.arrivee = geste;
    else e.depart = geste;
    parLigne.set(checkinId, e);
  }
  return parLigne;
}

// ── Les libellés ───────────────────────────────────────────────────────────

const LIBELLES: Record<string, string> = {
  emission: "Facture émise",
  envoi: "Envoyée par e-mail",
  envoi_echec: "Échec de l'envoi par e-mail",
  paiement: "Encaissement",
  paiement_annule: "Encaissement annulé",
  acompte_rattache: "Acompte rattaché à la facture",
  paiement_avoir: "Réglée par l'avoir du client",
  avoir: "Avoir créé",
  avoir_recu: "Soldée par un avoir",
  brouillon_annule: "Brouillon annulé",
  creation: "Créée",
  pdf: "PDF généré",
  validation: "Dépense validée",
  annulation: "Annulée par contre-écriture",
  emission_facture_echouee: "Émission de facture refusée",
  vente: "Vente encaissée",
  retour: "Retour de caisse",
  regime_tva: "Régime de TVA modifié",
  franco_port_des: "Seuil de livraison offerte modifié",
  frais_port_grille: "Grille des frais de port modifiée",
  tva_categorie: "Taux d'une catégorie d'articles",
  decompte_tva: "Décompte TVA déclaré",
  decompte_tva_paye: "Décompte TVA payé",
  abonnement_facture: "Carte facturée",
  abonnement_porte_sur_facture: "Carte portée sur une facture en cours",
  abonnement_expire: "Carte expirée — journées non consommées",
  abonnement_avoir: "Carte annulée par avoir",
  ecriture_manuelle: "Écriture saisie à la main",
  publication_auto_date: "Publié automatiquement à la date prévue",
  publication_auto_stock: "Publié automatiquement à l'entrée de stock",
  promotion_creee: "Rubrique créée",
  promotion_modifiee: "Rubrique modifiée",
  promotion_desactivee: "Rubrique désactivée",
  promotion_reactivee: "Rubrique réactivée",
  remise_membre_categorie: "Remise membre d'une catégorie",
  // Une requalification déplace des montants hors du chiffre d'affaires,
  // ou les y ramène : elle se lit en toutes lettres.
  type_sejour: "Type de séjour requalifié",
  identite_corrigee: "Identité juridique corrigée",
  changement_prepare: "Changement d’entité préparé",
  changement_annule: "Changement d’entité annulé",
};

/**
 * Le même code dit des choses différentes selon ce qu'il touche : une
 * « annulation » de dépense est une contre-écriture, celle d'une réservation
 * non. Ces libellés-ci l'emportent pour leur entité.
 */
const LIBELLES_PAR_ENTITE: Record<string, Record<string, string>> = {
  reservation: {
    creation: "Réservation créée",
    validation: "Réservation validée",
    refus: "Réservation refusée",
    annulation: "Réservation annulée",
    statut: "Statut modifié",
    modification: "Réservation modifiée",
    box: "Box attribué",
    prix_modifie: "Prix modifié",
    prix_recalcule: "Prix recalculé",
    offerte: "Offerte",
    offerte_retiree: "N'est plus offerte",
    arrivee: "Arrivée",
    arrivee_annulee: "Arrivée annulée",
    depart: "Départ",
    depart_annule: "Départ annulé",
    demande_paiement: "Demande de paiement envoyée",
    relance: "Relance envoyée",
    suppression: "Supprimée définitivement",
    extra_ajoute: "Ligne ajoutée au prix",
    extra_retire: "Ligne retirée du prix",
    paiement_derive: "Statut de paiement recalculé depuis les factures",
  },
  chien: {
    creation: "Chien ajouté",
    modification: "Fiche du chien modifiée",
    archive: "Chien archivé",
    resultat_essai: "Résultat de la journée d'essai",
    ententes: "Ententes modifiées",
    isolement: "Isolement modifié",
    photo: "Photo modifiée",
  },
  client: {
    creation: "Fiche client créée",
    modification: "Fiche client modifiée",
    archive: "Fiche client archivée",
    inscription: "Inscription",
    consentement_emails: "Choix des e-mails d'information",
    locataire: "Location de box modifiée",
    fiche_interne: "Fiche du personnel",
    bascule_interne: "Fiche passée au personnel",
    acces_employe: "Fiche reliée à un compte du personnel",
    adhesion_demandee: "Adhésion demandée",
    adhesion_enregistree: "Adhésion enregistrée",
    adhesion_payee: "Paiement de l'adhésion confirmé",
    adhesion_paiement_annule: "Paiement de l'adhésion annulé",
    avoir_ajoute: "Avoir ajouté",
    avoir_retire: "Avoir retiré",
    avoir_corrige: "Mouvement d'avoir corrigé",
    avoir_supprime: "Mouvement d'avoir supprimé",
  },
  abonnement: {
    abonnement_commande: "Carte commandée",
    abonnement_paye: "Paiement de la carte confirmé",
    abonnement_jours: "Jours de la carte ajustés",
    abonnement_cloture: "Carte clôturée",
    abonnement_supprime: "Carte supprimée",
    jours_personnalises: "Jours de passage personnalisés",
    formule_appliquee: "Formule appliquée",
  },
  paiement: {
    paiement_abonnement: "Réglée avec une carte",
  },
  campagne: {
    message_libre: "Message libre envoyé",
  },
};

export function libelleEvenement(evenement: string, entite?: string | null): string {
  return (entite ? LIBELLES_PAR_ENTITE[entite]?.[evenement] : undefined)
    ?? LIBELLES[evenement]
    ?? evenement;
}
