import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { finaliserEmission, BUCKET_FACTURES } from "@/src/lib/factureDocument";
import { tracerEvenement } from "@/src/lib/journalEvenements";

/**
 * Le filet : comparer ce qui est ÉMIS à ce qui est CONSERVÉ.
 *
 * Le `catch` de l'émission ne voyait que la moitié des cas. Si la requête meurt
 * entre l'attribution du numéro et la génération — délai dépassé, instance
 * recyclée, connexion coupée — aucun `catch` ne se déclenche, et le résultat
 * est le même : une facture numérotée sans document.
 *
 * La détection ne peut donc pas reposer sur la gestion d'erreur. Elle vient
 * d'une réconciliation, comme pour les fichiers orphelins : une trace
 * d'incident ne remplace pas un inventaire.
 *
 * L'émission ne peut pas être atomique avec la génération — le numéro doit
 * rester continu, donc on ne défait pas une émission. La fenêtre ne se supprime
 * pas : elle se voit et se referme.
 *
 * DEUX SITUATIONS, DEUX RÉACTIONS. Elle fabrique quand rien n'a jamais existé.
 * Elle NE FABRIQUE PAS sur un document perdu : voir `SANS_REGENERATION`.
 */

/**
 * Ce qui fait qu'une facture est ÉMISE : elle porte un NUMÉRO.
 *
 * On ne se fie pas à une liste de statuts — ils portent leurs valeurs
 * historiques en base (`acquittee`, `partiellement_reglee`) et une valeur
 * nouvelle passerait à travers la liste sans qu'on s'en aperçoive. Le numéro,
 * lui, ne s'attribue qu'à l'émission et ne se reprend jamais.
 *
 * Seul `brouillon` est exclu : une facture annulée reste une pièce comptable,
 * et son document doit être conservé comme les autres.
 */
export const STATUTS_SANS_DOCUMENT_ATTENDU = ["brouillon"];

/**
 * POURQUOI ON NE RÉGÉNÈRE JAMAIS PAR-DESSUS UNE PERTE.
 *
 * Un document perdu — chemin écrit, objet disparu — a existé. Une cliente peut
 * en détenir une copie. Le reconstruire aujourd'hui donnerait une pièce qui
 * DIFFÈRE de la sienne sans que rien ne le dise : mise en page, logo, tout ce
 * que le code a changé depuis.
 *
 * Et la reconstruction détruirait la preuve : `genererPdfFacture` réécrit
 * `pdf_sha256`, seule empreinte de ce que la cliente détient. Après quoi plus
 * rien ne permettrait de constater l'écart.
 *
 * Une perte se traite à la main — restauration depuis une sauvegarde, ou
 * reconstruction DÉCIDÉE et inscrite. Pas par une tâche de nuit.
 */
const SANS_REGENERATION = "document perdu : reconstruire masquerait l'écart avec la copie du client";

/** Après ce nombre d'échecs consécutifs, la tâche cesse d'essayer. */
export const TENTATIVES_AVANT_RENONCEMENT = 5;

/** Un bilan ne porte sur aucune facture en particulier. */
const AUCUNE_FACTURE = "00000000-0000-0000-0000-000000000000";

export type FactureSansDocument = {
  id: string;
  numero: string;
  statut: string;
  date_facture: string;
  document_tentatives: number;
  document_renonce_le: string | null;
};

/** Les factures émises dont le document n'est pas conservé. */
export async function facturesSansDocument(): Promise<FactureSansDocument[]> {
  const { data } = await supabaseAdmin
    .from("factures")
    .select("id, numero, statut, date_facture, document_tentatives, document_renonce_le")
    .is("pdf_path", null)
    .not("numero", "is", null)
    .not("statut", "in", `(${STATUTS_SANS_DOCUMENT_ATTENDU.join(",")})`)
    .order("date_facture", { ascending: true });
  return (data ?? []) as FactureSansDocument[];
}

/**
 * Les documents PERDUS : chemin écrit, objet absent du bucket.
 *
 * Ces factures ne sont jamais candidates à la fabrication — elles ont un
 * chemin, donc `facturesSansDocument` ne les voit pas. Sans ce relevé, une
 * perte serait parfaitement muette.
 *
 * Le coût est borné : on LISTE les dossiers du bucket (un appel par exercice),
 * on ne télécharge rien. Dix mille factures coûtent autant que dix.
 */
export async function documentsPerdus(): Promise<{ numero: string; chemin: string }[]> {
  const { data } = await supabaseAdmin
    .from("factures")
    .select("numero, pdf_path")
    .not("pdf_path", "is", null);
  const avecChemin = (data ?? []) as { numero: string; pdf_path: string }[];
  if (avecChemin.length === 0) return [];

  const dossiers = new Set(avecChemin.map((f) => f.pdf_path.split("/")[0]));
  const presents = new Set<string>();
  for (const dossier of dossiers) {
    const { data: objets } = await supabaseAdmin.storage
      .from(BUCKET_FACTURES)
      .list(dossier, { limit: 1000 });
    for (const o of objets ?? []) presents.add(`${dossier}/${o.name}`);
  }

  return avecChemin
    .filter((f) => !presents.has(f.pdf_path))
    .map((f) => ({ numero: f.numero, chemin: f.pdf_path }));
}

export type BilanReconciliation = {
  manquantes: number;
  reparees: number;
  /** Échecs du jour, hors factures déjà renoncées. */
  irreparables: { numero: string; statut: string }[];
  /** Ce tour-ci a fait renoncer ces factures. */
  renoncees: string[];
  /** Documents perdus rencontrés : jamais refabriqués. */
  perdus: string[];
  /** Déjà renoncées, laissées de côté : elles n'alertent plus. */
  ignorees: number;
};

/**
 * Tente de fabriquer les documents manquants, et rend compte.
 *
 * L'alerte est bornée à UNE par exécution, pas une par facture : la tâche
 * tourne une fois par jour, donc un manque persistant se rappelle une fois par
 * jour, et cent factures manquantes ne font pas cent alertes. Le journal, lui,
 * garde le détail.
 */
export async function reconcilierDocumentsFactures(): Promise<BilanReconciliation> {
  const candidates = await facturesSansDocument();
  // Les pertes se relèvent AVANT, et ne rejoignent jamais la fabrication.
  const perdusReleves = await documentsPerdus();
  const irreparables: { numero: string; statut: string }[] = [];
  const renoncees: string[] = [];
  const perdus: string[] = perdusReleves.map((p) => p.numero);
  let reparees = 0;
  let ignorees = 0;

  for (const f of candidates) {
    // Déjà renoncée : elle attend une main, elle n'attend plus la nuit.
    if (f.document_renonce_le) { ignorees += 1; continue; }

    // Un document PERDU ne rejoint jamais la fabrication : voir
    // SANS_REGENERATION. Les pertes ont été relevées à part, elles ne sont pas
    // dans `candidates` — cette garde le redit là où quelqu'un pourrait un
    // jour élargir la requête sans y penser.
    if (perdus.includes(f.numero)) continue;

    const res = await finaliserEmission(f.id, null);
    if (!res.error) {
      reparees += 1;
      // Le compteur mesure des échecs CONSÉCUTIFS : une réussite l'efface.
      if (f.document_tentatives > 0) {
        await supabaseAdmin.from("factures")
          .update({ document_tentatives: 0 }).eq("id", f.id);
      }
      continue;
    }

    const tentatives = (f.document_tentatives ?? 0) + 1;
    const renonce = tentatives > TENTATIVES_AVANT_RENONCEMENT;
    await supabaseAdmin.from("factures").update({
      document_tentatives: tentatives,
      document_renonce_le: renonce ? new Date().toISOString() : null,
    }).eq("id", f.id);

    if (renonce) {
      renoncees.push(f.numero);
      // Le renoncement est un ÉVÉNEMENT : la colonne dit où l'on en est, le
      // journal dit quand on a essayé et combien de fois. À dix ans de
      // distance, c'est le second qui répond aux questions.
      await tracerEvenement({
        entite: "facture", entiteId: f.id, evenement: "document_renonce",
        apres: { numero: f.numero, tentatives, statut: f.statut },
        userId: null,
      });
    } else {
      irreparables.push({ numero: f.numero, statut: f.statut });
    }
  }

  if (reparees > 0) {
    await tracerEvenement({
      // Le bilan porte sur un LOT, pas sur une facture : l'identifiant nul est
      // la convention déjà utilisée par la garde d'accès.
      entite: "facture", entiteId: AUCUNE_FACTURE, evenement: "documents_reconcilies",
      apres: { reparees, sur: candidates.length },
      userId: null,
    });
  }

  if (perdus.length > 0) {
    Sentry.captureMessage("Documents de facture perdus dans le stockage", {
      level: "error",
      tags: { tache: "reconciliation_documents", nature: "perdu" },
      extra: { nombre: perdus.length, numeros: perdus.slice(0, 50), regle: SANS_REGENERATION },
    });
  }

  if (renoncees.length > 0) {
    // Une seule alerte, au MOMENT du renoncement : c'est un événement, pas une
    // répétition. Ensuite, la facture sort de la ronde.
    Sentry.captureMessage("Renoncement : document de facture infabricable", {
      level: "error",
      tags: { tache: "reconciliation_documents", nature: "renonce" },
      extra: { numeros: renoncees, apresTentatives: TENTATIVES_AVANT_RENONCEMENT },
    });
  }

  if (irreparables.length > 0) {
    // Une seule alerte, avec les numéros — un numéro de facture est une
    // référence interne, il ne dit rien du client.
    Sentry.captureMessage("Factures émises sans document conservé", {
      level: "error",
      tags: { tache: "reconciliation_documents" },
      extra: { nombre: irreparables.length, numeros: irreparables.map((f) => f.numero).slice(0, 50) },
    });
    await tracerEvenement({
      entite: "facture", entiteId: AUCUNE_FACTURE, evenement: "documents_introuvables",
      apres: { nombre: irreparables.length, numeros: irreparables.map((f) => f.numero).slice(0, 50) },
      userId: null,
    });
  }

  return { manquantes: candidates.length, reparees, irreparables, renoncees, perdus, ignorees };
}

/**
 * Reprendre une facture renoncée, à la main, depuis l'écran.
 *
 * Elle repart à zéro tentative : c'est un geste humain, pas une relance
 * automatique, et il mérite d'être inscrit.
 */
export async function reprendreDocumentFacture(
  factureId: string,
  userId: string | null,
): Promise<{ error?: string }> {
  const { data: f } = await supabaseAdmin
    .from("factures").select("id, numero, document_tentatives").eq("id", factureId).maybeSingle();
  if (!f) return { error: "Facture introuvable." };

  await tracerEvenement({
    entite: "facture", entiteId: factureId, evenement: "document_repris",
    apres: { numero: f.numero, apresTentatives: f.document_tentatives },
    userId,
  });

  await supabaseAdmin.from("factures")
    .update({ document_tentatives: 0, document_renonce_le: null }).eq("id", factureId);

  const res = await finaliserEmission(factureId, userId);
  return res.error ? { error: res.error } : {};
}
