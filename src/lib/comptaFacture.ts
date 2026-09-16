import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { calculerLignesFacture, type FactureCompta } from "@/src/lib/comptaFactureLogique";
import { lireParametresTva } from "@/src/lib/tva";

export const PIECE_TYPE_FACTURE = "facture";

/**
 * La pièce doit-elle porter sa TVA en comptabilité ?
 *
 * Oui en MÉTHODE EFFECTIVE seulement, et seulement à partir de la date
 * d'assujettissement. En dette fiscale nette — le régime de la pension — la
 * réponse est non : les produits restent TTC et la dette naît au décompte,
 * une fois par période. La comptabiliser aux deux endroits la compterait deux
 * fois, et c'est l'erreur classique de ce régime.
 *
 * Le régime lu est celui EN VIGUEUR À LA DATE de la pièce : une facture
 * ancienne garde sa comptabilisation même si le régime change ensuite.
 */
async function tvaEffectivePour(dateFacture: string | null): Promise<boolean> {
  const regime = await lireParametresTva(dateFacture);
  if (!regime.assujettie || regime.methode !== "effective") return false;
  if (regime.dateAssujettissement && dateFacture && dateFacture < regime.dateAssujettissement) {
    return false;
  }
  return true;
}

/**
 * Acomptes déjà encaissés sur les réservations d'une facture : ils dorment en
 * 2030 (posés par la comptabilité de la réservation) et l'émission les bascule
 * sur le débiteur. Même calcul que dans la RPC emettre_facture — les deux
 * doivent donner le même nombre, sans quoi le delta ferait des va-et-vient.
 */
async function acomptesImputes(factureId: string, total: number): Promise<number> {
  // Une seule règle, partagée avec la RPC d'émission : sans cela, le moteur
  // par delta ferait des allers-retours entre deux valeurs différentes.
  const { data, error } = await supabaseAdmin.rpc("acomptes_a_imputer", { p_facture_id: factureId });
  if (error) throw error;
  const somme = Number(data ?? 0);
  return Math.min(Math.round(Math.max(somme, 0) * 100) / 100, Math.round(total * 100) / 100);
}

/**
 * Synchronise les écritures d'une facture (idempotent, par delta).
 * Ne throw jamais : l'erreur part dans Sentry et la pièce reste consultable.
 */
export async function synchroniserComptaFacture(
  factureId: string,
  createdBy?: string | null,
): Promise<void> {
  try {
    const { data: f } = await supabaseAdmin
      .from("factures")
      .select("id, type, numero, statut, date_facture, motif")
      .eq("id", factureId)
      .maybeSingle();
    if (!f) return;

    const { data: lignes } = await supabaseAdmin
      .from("facture_lignes")
      .select("compte_produit, montant, taux_tva")
      .eq("facture_id", factureId);

    const { data: paiements } = await supabaseAdmin
      .from("paiements_resa")
      .select("mode, montant, arrondi")
      .eq("facture_id", factureId);

    const { data: dejaLignes } = await supabaseAdmin
      .from("ecritures_lignes")
      .select("compte_numero, debit, credit, ecritures!inner(piece_id, piece_type)")
      .eq("ecritures.piece_id", factureId)
      .eq("ecritures.piece_type", PIECE_TYPE_FACTURE);

    const total = (lignes ?? []).reduce(
      (s: number, l: { montant: number | string }) => s + Number(l.montant), 0);

    // La part d'un avoir portée au crédit du client EST son mouvement d'avoir :
    // les deux ne peuvent donc pas diverger.
    let montantCredite = 0;
    if (f.type === "avoir") {
      const { data: mvts } = await supabaseAdmin
        .from("avoirs_mouvements")
        .select("montant")
        .eq("facture_id", factureId)
        .eq("type", "avoir_facture");
      montantCredite = (mvts ?? []).reduce(
        (s: number, m: { montant: number | string }) => s + Number(m.montant), 0);
    }

    const etat: FactureCompta = {
      type: f.type,
      emise: !!f.numero,
      statut: f.statut,
      lignes: (lignes ?? []) as { compte_produit: string; montant: number; taux_tva: number }[],
      paiements: (paiements ?? []) as { mode: string; montant: number; arrondi: number }[],
      acomptesImputes: f.type === "facture" || f.type === "libre"
        ? await acomptesImputes(factureId, total)
        : 0,
      montantCredite,
      // Le régime EN VIGUEUR À LA DATE de la pièce décide, pas celui
      // d'aujourd'hui : une facture ancienne garde sa comptabilisation même si
      // le régime change ensuite.
      tvaEffective: await tvaEffectivePour(f.date_facture as string | null),
    };

    const lignesEcriture = calculerLignesFacture(
      etat,
      (dejaLignes ?? []) as { compte_numero: string; debit: number; credit: number }[],
    );
    if (lignesEcriture.length === 0) return;

    const { error } = await supabaseAdmin.rpc("passer_ecriture", {
      p_date: (f.date_facture as string) ?? new Date().toISOString().split("T")[0],
      p_libelle: `Facture ${f.numero ?? factureId.slice(0, 8)}`,
      p_piece_type: PIECE_TYPE_FACTURE,
      p_piece_id: factureId,
      p_lignes: lignesEcriture,
      p_created_by: createdBy ?? null,
    });
    if (error) throw error;
  } catch (e: unknown) {
    Sentry.captureException(e);
    console.error("compta facture:", e);
  }
}

export type ResteFacture = { paye: number; avoirs: number; reste: number; statut: string };

/**
 * Payé, reste et statut d'une facture — calculés à UN seul endroit, la
 * fonction SQL `recalculer_paiement_facture` :
 *   reste = total − paiements rattachés (acomptes compris) − avoirs émis.
 * L'émission, la caisse et le retour l'appellent en base ; l'application
 * l'appelle ici. Personne d'autre n'écrit montant_paye ni montant_restant :
 * un test relit le dépôt.
 */
export async function recalculerResteFacture(factureId: string): Promise<ResteFacture | null> {
  const { data, error } = await supabaseAdmin.rpc("recalculer_paiement_facture", { p_facture_id: factureId });
  if (error) throw new Error(`Reste de la facture non recalculé : ${error.message}`);
  if (!data) return null;
  const r = data as { paye: number | string; avoirs: number | string; reste: number | string; statut: string };
  return { paye: Number(r.paye), avoirs: Number(r.avoirs), reste: Number(r.reste), statut: r.statut };
}

/**
 * Après un encaissement, un avoir ou une annulation de paiement : le reste se
 * recalcule, puis la comptabilité de la facture se resynchronise.
 * Le montant payé n'est JAMAIS saisi : il est toujours la somme des versements.
 */
export async function rafraichirPaiementFacture(
  factureId: string,
  createdBy?: string | null,
): Promise<void> {
  await recalculerResteFacture(factureId);
  await synchroniserComptaFacture(factureId, createdBy);
}
