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
  | "chien" | "client" | "campagne"
  // Un refus de la garde (garde.ts) : l'entité est le compte qui a frappé.
  | "acces"
  // APP 59 : les périodes où la pension n'accueille ni ne rend aucun chien.
  | "fermeture_pension";

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
  date_ouverture: "Date d'ouverture modifiée",
  // APP 44, resté sans libellé jusqu'à APP 59 : il s'affichait en clé technique.
  avis_google_url: "Lien d'avis Google",
  // APP 59 — les horaires d'accueil, un libellé par créneau réglable.
  horaires_journee_arrivee: "Horaires : arrivée en garderie",
  horaires_journee_depart: "Horaires : départ de garderie",
  horaires_sejour: "Horaires : arrivée et départ d'un séjour",
  horaires_essai_arrivee: "Horaires : arrivée d'une journée d'essai",
  horaires_essai_depart: "Horaires : départ d'une journée d'essai",
  // APP 59 — les versions des conditions, et les fermetures de la pension.
  conditions_pension_version: "Version des conditions de la pension",
  conditions_vente_version: "Version des conditions de vente",
  fermeture_ajoutee: "Pension fermée sur une période",
  fermeture_retiree: "Période de fermeture retirée",
  // APP 58 — six clés, six libellés : le journal dit LAQUELLE a bougé. Un seul
  // libellé « Signature modifiée » aurait obligé à ouvrir l'avant/après pour
  // savoir si c'était le nom ou le numéro de téléphone.
  signature_nom: "Signature des e-mails : nom",
  signature_fonction: "Signature des e-mails : fonction",
  signature_adresse: "Signature des e-mails : adresse",
  signature_email: "Signature des e-mails : e-mail affiché",
  signature_telephone: "Signature des e-mails : téléphone",
  signature_site: "Signature des e-mails : site internet",
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
  // APP 62 : la section « Coups de cœur du moment » de la boutique en ligne.
  coup_de_coeur_ajoute: "Mis en coup de cœur",
  coup_de_coeur_retire: "Retiré des coups de cœur",
  // APP 26. Sans ces deux lignes, le journal afficherait les noms techniques —
  // et c'est justement ce journal qu'on relira dans trois semaines pour dire à
  // une cliente où en est sa commande.
  commande_au_fournisseur: "Commandé chez le fournisseur",
  reception_marchandise: "Marchandise reçue et réservée pour les commandes en attente",
  // APP 35 : l'import des photos d'un fournisseur (scripts/import-photos-*).
  // L'entité reste `parametre` : le geste ne concerne aucun article en
  // particulier, et `article` ferait pointer l'écran vers une fiche absente.
  import_photos_fournisseur: "Photos importées depuis un fournisseur",
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

  // ── APP 33 bis : les gestes qui s'affichaient « Autre geste : … » ────────
  //
  // Chacun a été relu dans le code AVANT d'être nommé : trois des libellés
  // proposés disaient autre chose que ce que la trace enregistre, et un
  // libellé faux est pire que pas de libellé — on ne le rouvre jamais.

  /**
   * L'e-mail d'UNE personne en attente n'est pas parti. Le motif porte
   * l'erreur ; l'entité est la ligne d'alerte, pas l'article.
   */
  alerte_envoi_echec: "Alerte retour en stock : envoi échoué",
  /**
   * « demandé », et non « renvoyée » : la trace s'écrit quand `notifie_le`
   * repasse à null, AVANT la nouvelle tentative — qui peut échouer à son tour
   * (« L'envoi a de nouveau échoué. L'alerte reste en attente. »). Dire
   * « renvoyée » affirmerait un envoi qui n'a peut-être jamais eu lieu.
   */
  alerte_renvoyee: "Alerte retour en stock : renvoi demandé",
  /**
   * Le bilan par ARTICLE d'une vague de notifications. Il porte deux nombres,
   * `envoyees` ET `echecs`, et s'écrit dès que l'un des deux n'est pas nul :
   * une vague entièrement ratée s'afficherait donc « envoyées » si on s'en
   * tenait au mot.
   */
  alerte_retour_en_stock: "Alertes retour en stock : bilan des envois",

  chien_change_de_fiche: "Chien déplacé vers une autre fiche client",
  compte_auth_detache: "Compte de connexion détaché de la fiche",
  fiche_interne_creee: "Fiche interne créée",

  /**
   * Ces trois-là portent l'identifiant nul : le bilan est celui d'un LOT, pas
   * d'une facture. « Pièces de LA facture » aurait fait chercher laquelle.
   */
  documents_reconcilies: "Documents de facture réconciliés",
  documents_introuvables: "Factures émises sans document conservé",
  document_renonce: "Document de facture abandonné après six échecs",

  tva_prestation: "Taux de TVA d'une prestation modifié",
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
  entite_juridique: {
    coordonnees: "Coordonnées de paiement modifiées",
  },
  acces: {
    refus: "Accès refusé",
  },

  /**
   * APP 33 bis — DEUX SORTES DE COMMANDES, ET ELLES NE SE RESSEMBLENT PAS.
   *
   * `commande` désigne une commande SUR MESURE
   * (`commandes_personnalisees`) : un objet qu'on fabrique, dont le passage
   * en « en cours » décompte les fournitures. `commande_en_ligne` désigne un
   * achat de la boutique (`commandes`).
   *
   * Les deux écrivent l'événement `statut`. Un libellé global aurait donc dit
   * la même chose des deux, et « Statut de commande modifié », lu juste sous
   * « Commande en ligne confirmée », se serait lu comme la même commande.
   */
  commande: {
    creation: "Commande sur mesure créée",
    statut: "Statut de la commande sur mesure modifié",
  },
  commande_en_ligne: {
    statut: "Statut de la commande en ligne modifié",
    confirmation: "Commande en ligne confirmée",
    remise: "Commande en ligne remise au client",
    /**
     * `remise` et `expediee` sortent de la MÊME ligne SQL de
     * `remettre_commande` (`evenement = p_statut`). Nommer l'une sans l'autre
     * aurait laissé « Autre geste : expediee » apparaître le premier jour où
     * un colis part — c'est-à-dire longtemps après qu'on ait cessé d'y penser.
     */
    expediee: "Commande en ligne expédiée",
    /**
     * Sans cette ligne, le libellé global `annulation` s'appliquait :
     * « Annulée par contre-écriture », qui parle d'une écriture comptable et
     * n'a rien à voir avec une commande rendue au stock.
     */
    annulation: "Commande en ligne annulée",
  },
};

/**
 * Y a-t-il un libellé français pour ce geste ?
 *
 * L'écran « Journal des gestes » (APP 33) s'en sert pour son repli, et un test
 * s'en sert pour LISTER ce qui n'en a pas encore. Sans cette distinction, un
 * événement sans libellé s'afficherait sous son nom technique et personne ne le
 * remarquerait — c'est ainsi qu'on finit par lire « alerte_renvoyee » pendant
 * deux ans.
 */
export function aUnLibelle(evenement: string, entite?: string | null): boolean {
  return (entite ? LIBELLES_PAR_ENTITE[entite]?.[evenement] : undefined) !== undefined
    || LIBELLES[evenement] !== undefined;
}

/**
 * Le libellé d'un geste, et son REPLI quand il n'en a pas.
 *
 * Le repli est lisible et il se voit : « Autre geste : alerte_renvoyee » dit à
 * la fois ce qui s'est passé et qu'il manque un mot. Rendre le nom technique nu
 * — ce que faisait cette fonction — le faisait passer pour un libellé.
 */
export function libelleEvenement(evenement: string, entite?: string | null): string {
  return (entite ? LIBELLES_PAR_ENTITE[entite]?.[evenement] : undefined)
    ?? LIBELLES[evenement]
    ?? `Autre geste : ${evenement}`;
}
