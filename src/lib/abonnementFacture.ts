import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { factureCibleClient } from "@/src/lib/caisse";
import { synchroniserComptaFacture } from "@/src/lib/comptaFacture";
import { finaliserEmission } from "@/src/lib/factureDocument";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { tvaDeLaPrestation } from "@/src/lib/tva";
import { labelAbonnement } from "@/src/lib/abonnementsTypes";
import {
  COMPTE_ABONNEMENTS_PREPAYES,
  libelleLigneAbonnement,
} from "@/src/lib/abonnementProduitLogique";

/**
 * La facture d'une carte prépayée.
 *
 * Rien de neuf : on réutilise le moteur de factures — même numérotation, même
 * PDF, même bulletin QR, même e-mail. La seule particularité tient au compte
 * de la ligne : 2031, produit perçu d'avance, et non un compte de produit.
 * La carte n'est pas un produit du jour où elle est payée.
 *
 * Deux chemins, un seul mécanisme :
 *
 *   • le client prend une carte seule → une facture libre est créée et émise ;
 *   • il la prend au moment d'une réservation → la ligne rejoint la facture
 *     en brouillon qui existe déjà. Une seule facture plutôt que deux le même
 *     jour, exactement comme pour une adhésion.
 */

export type RetourFactureAbonnement = {
  error?: string;
  factureId?: string;
  numero?: string | null;
  /** Vrai si la facture a été émise ici ; faux si la ligne a rejoint un brouillon. */
  emise?: boolean;
  proposerFactureLibre?: boolean;
};

export async function porterAbonnementSurFacture(
  abonnementId: string,
  options: { creerSiAbsente?: boolean; userId?: string | null } = {}
): Promise<RetourFactureAbonnement> {
  const { data: abo } = await supabaseAdmin
    .from("abonnements")
    .select("id, client_id, categorie, prix_paye, jours_total, jours_offerts, statut, facture_id, date_paiement")
    .eq("id", abonnementId)
    .maybeSingle();
  if (!abo) return { error: "Abonnement introuvable." };
  if (abo.facture_id) {
    // Déjà facturé : on ne refacture pas, et ce n'est pas une erreur.
    const { data: f } = await supabaseAdmin
      .from("factures").select("numero").eq("id", abo.facture_id).maybeSingle();
    return { factureId: abo.facture_id as string, numero: (f?.numero as string) ?? null, emise: !!f?.numero };
  }

  const cible = await factureCibleClient(abo.client_id as string, {
    creerSiAbsente: options.creerSiAbsente === true,
    userId: options.userId ?? null,
  });
  if (cible.factureId === null) {
    return { error: cible.erreur, proposerFactureLibre: cible.proposerFactureLibre };
  }

  const dateFacture = (abo.date_paiement as string) ?? new Date().toISOString().slice(0, 10);

  // Le taux vient de la catégorie « Abonnement » réglée dans Réglages → TVA :
  // jamais un taux écrit en dur.
  const tva = await tvaDeLaPrestation("abonnement", dateFacture);

  const { data: dernier } = await supabaseAdmin
    .from("facture_lignes").select("ordre").eq("facture_id", cible.factureId)
    .order("ordre", { ascending: false }).limit(1).maybeSingle();

  const { error: erreurLigne } = await supabaseAdmin.from("facture_lignes").insert({
    facture_id: cible.factureId,
    ordre: Number(dernier?.ordre ?? 0) + 1,
    libelle: libelleLigneAbonnement(abo, labelAbonnement(abo.categorie as string)),
    quantite: 1,
    prix_unitaire: Number(abo.prix_paye ?? 0),
    // 2031 : la carte est une dette envers le client tant qu'il ne l'a pas
    // consommée. Le produit viendra journée par journée.
    compte_produit: COMPTE_ABONNEMENTS_PREPAYES,
    taux_tva: tva.taux,
    motif_tva: tva.motif,
    secteur_tdfn: "pension",
    abonnement_id: abonnementId,
  });
  if (erreurLigne) return { error: "La ligne d'abonnement n'a pas pu être ajoutée à la facture." };

  await supabaseAdmin.from("abonnements").update({ facture_id: cible.factureId }).eq("id", abonnementId);
  await rafraichirTotaux(cible.factureId);

  // Une facture créée pour l'occasion part tout de suite ; un brouillon qui
  // existait déjà attend ses autres lignes.
  if (cible.creee) {
    const { error: erreurEmission } = await supabaseAdmin.rpc("emettre_facture", {
      p_facture_id: cible.factureId, p_user_id: options.userId ?? null,
    });
    if (erreurEmission) return { error: "La facture n'a pas pu être émise." };

    await synchroniserComptaFacture(cible.factureId, options.userId ?? null);
    await finaliserEmission(cible.factureId, options.userId ?? null);

    const { data: f } = await supabaseAdmin
      .from("factures").select("numero").eq("id", cible.factureId).maybeSingle();

    await tracerEvenement({
      entite: "abonnement", entiteId: abonnementId, evenement: "abonnement_facture",
      apres: { facture_id: cible.factureId, numero: f?.numero ?? null, montant: Number(abo.prix_paye ?? 0) },
      userId: options.userId ?? null,
    });

    return { factureId: cible.factureId, numero: (f?.numero as string) ?? null, emise: true };
  }

  await synchroniserComptaFacture(cible.factureId, options.userId ?? null);
  await tracerEvenement({
    entite: "abonnement", entiteId: abonnementId, evenement: "abonnement_porte_sur_facture",
    apres: { facture_id: cible.factureId, montant: Number(abo.prix_paye ?? 0) },
    userId: options.userId ?? null,
  });

  return { factureId: cible.factureId, numero: null, emise: false };
}

/** Les montants de la facture suivent ses lignes, toujours. */
async function rafraichirTotaux(factureId: string): Promise<void> {
  const { data: lignes } = await supabaseAdmin
    .from("facture_lignes").select("montant").eq("facture_id", factureId);
  const total = Math.round(
    (lignes ?? []).reduce((s: number, l: { montant: number | string }) => s + Number(l.montant), 0) * 100
  ) / 100;

  const { data: f } = await supabaseAdmin
    .from("factures").select("montant_paye").eq("id", factureId).maybeSingle();
  const paye = Number(f?.montant_paye ?? 0);

  await supabaseAdmin.from("factures").update({
    montant_total: total, montant_ttc: total, montant_ht: total,
    montant_restant: Math.round((total - paye) * 100) / 100,
  }).eq("id", factureId);
}
