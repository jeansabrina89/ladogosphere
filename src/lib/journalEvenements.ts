import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/src/lib/supabase-admin";

// Journal des événements métier (ajout seul, verrouillé par trigger).
// Il répond à « qui a fait quoi, quand, et pourquoi » sur les pièces sensibles :
// factures, paiements, avoirs. Il ne remplace pas le grand livre — il l'explique.

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
  | "promotion" | "remise_membre";

export type EvenementJournal = {
  entite: EntiteJournal;
  entiteId: string;
  evenement: string;
  avant?: unknown;
  apres?: unknown;
  motif?: string | null;
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

export type LigneHistorique = {
  id: string;
  evenement: string;
  motif: string | null;
  created_at: string;
  auteur: string | null;
  apres: Record<string, unknown> | null;
};

/** Historique d'une entité, du plus récent au plus ancien. */
export async function lireHistorique(
  entite: EntiteJournal,
  entiteId: string,
): Promise<LigneHistorique[]> {
  const { data } = await supabaseAdmin
    .from("journal_evenements")
    .select("id, evenement, motif, created_at, apres, profiles(prenom, nom)")
    .eq("entite", entite)
    .eq("entite_id", entiteId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((l: Record<string, unknown>) => {
    const p = l.profiles as { prenom?: string; nom?: string } | null;
    return {
      id: String(l.id),
      evenement: String(l.evenement),
      motif: (l.motif as string | null) ?? null,
      created_at: String(l.created_at),
      auteur: p ? `${p.prenom ?? ""} ${p.nom ?? ""}`.trim() || null : null,
      apres: (l.apres as Record<string, unknown> | null) ?? null,
    };
  });
}

/** Historique de toutes les factures d'un client (fiche client). */
export async function lireHistoriqueClient(clientId: string): Promise<LigneHistorique[]> {
  const { data: factures } = await supabaseAdmin
    .from("factures").select("id").eq("client_id", clientId);
  const ids = (factures ?? []).map((f: { id: string }) => f.id);
  if (ids.length === 0) return [];

  const { data } = await supabaseAdmin
    .from("journal_evenements")
    .select("id, evenement, motif, created_at, apres, profiles(prenom, nom)")
    .in("entite_id", ids)
    .order("created_at", { ascending: false })
    .limit(100);

  return (data ?? []).map((l: Record<string, unknown>) => {
    const p = l.profiles as { prenom?: string; nom?: string } | null;
    return {
      id: String(l.id),
      evenement: String(l.evenement),
      motif: (l.motif as string | null) ?? null,
      created_at: String(l.created_at),
      auteur: p ? `${p.prenom ?? ""} ${p.nom ?? ""}`.trim() || null : null,
      apres: (l.apres as Record<string, unknown> | null) ?? null,
    };
  });
}

const LIBELLES: Record<string, string> = {
  emission: "Facture émise",
  envoi: "Envoyée par e-mail",
  paiement: "Encaissement",
  paiement_annule: "Encaissement annulé",
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
};

export function libelleEvenement(evenement: string): string {
  return LIBELLES[evenement] ?? evenement;
}
