import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { finaliserEmission } from "@/src/lib/factureDocument";
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

/** Un bilan ne porte sur aucune facture en particulier. */
const AUCUNE_FACTURE = "00000000-0000-0000-0000-000000000000";

export type FactureSansDocument = {
  id: string;
  numero: string;
  statut: string;
  date_facture: string;
};

/** Les factures émises dont le document n'est pas conservé. */
export async function facturesSansDocument(): Promise<FactureSansDocument[]> {
  const { data } = await supabaseAdmin
    .from("factures")
    .select("id, numero, statut, date_facture")
    .is("pdf_path", null)
    .not("numero", "is", null)
    .not("statut", "in", `(${STATUTS_SANS_DOCUMENT_ATTENDU.join(",")})`)
    .order("date_facture", { ascending: true });
  return (data ?? []) as FactureSansDocument[];
}

export type BilanReconciliation = {
  manquantes: number;
  reparees: number;
  irreparables: { numero: string; statut: string }[];
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
  const manquantes = await facturesSansDocument();
  const irreparables: { numero: string; statut: string }[] = [];
  let reparees = 0;

  for (const f of manquantes) {
    const res = await finaliserEmission(f.id, null);
    if (res.error) irreparables.push({ numero: f.numero, statut: f.statut });
    else reparees += 1;
  }

  if (reparees > 0) {
    await tracerEvenement({
      // Le bilan porte sur un LOT, pas sur une facture : l identifiant nul
      // est la convention deja utilisee par la garde d acces.
      entite: "facture", entiteId: AUCUNE_FACTURE, evenement: "documents_reconcilies",
      apres: { reparees, sur: manquantes.length },
      userId: null,
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

  return { manquantes: manquantes.length, reparees, irreparables };
}
