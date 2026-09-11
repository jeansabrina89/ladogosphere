import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { calculerMontant } from "@/src/lib/calculTarif";
import { calculerStatut } from "@/src/lib/factures";
import { estMembreActif } from "@/src/lib/membre";
import { estPrivatifPourSelection } from "@/src/lib/cohabitation";
import { lireCohabitationChiens } from "@/src/lib/cohabitationDb";
import { rafraichirFactureBrouillon } from "@/src/lib/factureResa";
import { synchroniserComptaResa } from "@/src/lib/comptaResa";
import { synchroniserComptaAvoir } from "@/src/lib/comptaAvoir";
import type { EcartType } from "@/src/lib/facturation";
import { reglesFacturation, urgenceDerivee } from "@/src/lib/typeSejour";

/**
 * Prix d'une réservation — couche métier, sans session.
 *
 * Le calcul ne vivait que dans /api/reservations/[id]/statut, au passage à
 * « validée ». Une réservation créée directement au statut « Validée » gardait
 * donc un prix de 0 : au départ, la facture n'avait aucune ligne, l'émission
 * échouait, et personne n'était prévenu.
 *
 * Ces fonctions s'appellent depuis n'importe quel chemin (route, action,
 * import) : elles ne dépendent d'aucune permission de session, la garde est
 * faite par l'appelant.
 */

export type RecalculResult = {
  error?: string;
  nouveau_total?: number;
  ecart?: number;
  type_ecart?: EcartType;
};

/**
 * Recalcule montant_final = montant_calcule + ajustement_manuel + Σ(extras)
 * (plancher 0), puis réévalue montant_paye / statut_paiement.
 * - Trop-perçu (montant_paye > nouveau_total) : crédite l'avoir du client.
 * - Manque (0 < montant_paye < nouveau_total) : reste 'partiel', sans mouvement.
 * À appeler après toute modif de montant_calcule, ajustement_manuel ou extras.
 */
export async function recalculerTotalEtPaiement(
  reservationId: string,
  createdBy?: string
): Promise<RecalculResult> {
  const { data: reservation, error: resError } = await supabaseAdmin
    .from("reservations")
    .select("montant_calcule, ajustement_manuel, montant_paye, numero, client_id, offerte")
    .eq("id", reservationId)
    .single();
  if (resError || !reservation) return { error: "Réservation introuvable." };

  const { data: extras, error: extrasError } = await supabaseAdmin
    .from("reservation_extras")
    .select("montant")
    .eq("reservation_id", reservationId);
  if (extrasError) return { error: extrasError.message };

  const montantCalcule = Number(reservation.montant_calcule) || 0;
  const ajustement = Number(reservation.ajustement_manuel) || 0;
  const sommeExtras = (extras ?? []).reduce((s, e) => s + (Number(e.montant) || 0), 0);
  let nouveauTotal = Math.max(0, montantCalcule + ajustement + sommeExtras);
  if (reservation.offerte) nouveauTotal = 0;
  const montantPaye = Number(reservation.montant_paye) || 0;

  let nouveauMontantPaye = montantPaye;
  let statut: string;
  let ecart = 0;
  let type_ecart: EcartType = "aucun";

  if (montantPaye > nouveauTotal) {
    const tropPercu = montantPaye - nouveauTotal;
    if (!reservation.client_id) {
      return { error: "Client introuvable (impossible de créditer le trop-perçu)." };
    }

    const { data: mvt, error: mvtError } = await supabaseAdmin
      .from("avoirs_mouvements")
      .insert({
        client_id: reservation.client_id,
        montant: tropPercu,
        type: "trop_percu",
        motif: `Trop-perçu — modification montant résa #${reservation.numero}`,
        reservation_id: reservationId,
        created_by: createdBy ?? null,
      })
      .select("id")
      .single();
    if (mvtError) return { error: mvtError.message };

    // Le trop-perçu devient une dette envers le client : D 1100 / C 2035.
    await synchroniserComptaAvoir(mvt.id, createdBy ?? null);

    nouveauMontantPaye = nouveauTotal;
    statut = "paye";
    ecart = tropPercu;
    type_ecart = "trop_percu";
  } else {
    statut = nouveauTotal === 0 ? "paye" : calculerStatut(nouveauMontantPaye, nouveauTotal);
    if (nouveauMontantPaye > 0 && nouveauMontantPaye < nouveauTotal) {
      ecart = nouveauTotal - nouveauMontantPaye;
      type_ecart = "complement";
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from("reservations")
    .update({
      montant_final: nouveauTotal,
      montant_paye: nouveauMontantPaye,
      statut_paiement: statut,
    })
    .eq("id", reservationId);
  if (updateError) return { error: updateError.message };

  await rafraichirFactureBrouillon(reservationId);
  await synchroniserComptaResa(reservationId);

  return { nouveau_total: nouveauTotal, ecart, type_ecart };
}

export type ResultatMontantCalcule = {
  montant?: number;
  calcule: boolean;
  /** Pourquoi rien n'a été calculé, quand ce n'est pas une erreur. */
  raison?: "deja_calcule" | "offerte" | "sans_chien" | "gratuit_par_defaut";
  erreur?: string;
};

/**
 * Garantit qu'une réservation porte un prix. Idempotente : un montant déjà
 * calculé n'est pas recalculé (le personnel peut l'avoir ajusté à la main).
 *
 * Une réservation offerte ou d'une fiche interne reste à 0, c'est voulu.
 *
 * Le type de séjour porte sa règle de facturation, et cette règle est celle
 * qui existait déjà : « personnel » et « abandon » ne déclenchent aucun calcul
 * (le montant part à zéro et n'y est ramené par personne — un refuge ou une
 * commune peut toujours participer, à la main), « urgence » passe par le tarif
 * d'urgence déjà en place. Rien de neuf ici : le type rattache, il n'invente pas.
 *
 * Le type est la SEULE référence de l'urgence. La colonne `urgence` n'est plus
 * lue ici : elle est dérivée du type à l'écriture, et deux sources pour un même
 * fait finissent toujours par se contredire au pire moment.
 */
export async function assurerMontantCalcule(
  reservationId: string,
  createdBy?: string | null
): Promise<ResultatMontantCalcule> {
  const { data: resa, error } = await supabaseAdmin
    .from("reservations")
    .select(`
      id, statut, type_reservation, offerte, type_sejour,
      date_debut, date_fin, heure_arrivee, heure_depart,
      montant_calcule, client_id,
      reservation_chiens (chien_id)
    `)
    .eq("id", reservationId)
    .maybeSingle();

  if (error) return { calcule: false, erreur: error.message };
  if (!resa) return { calcule: false, erreur: "Réservation introuvable." };

  if (resa.offerte) return { montant: 0, calcule: false, raison: "offerte" };

  // Gratuit par défaut : on ne pose aucun montant automatique. Le montant
  // reste libre (montant_final, ajustement_manuel) pour les types qui
  // l'autorisent — c'est ainsi qu'une participation d'un refuge s'inscrit.
  const regles = reglesFacturation(resa.type_sejour);
  if (regles.gratuitParDefaut) {
    return { montant: 0, calcule: false, raison: "gratuit_par_defaut" };
  }

  // Un montant déjà posé fait foi : 0 vaut « pas encore calculé », comme partout
  // ailleurs dans l'application (une réservation gratuite passe par `offerte`).
  const dejaCalcule = Number(resa.montant_calcule) || 0;
  if (dejaCalcule > 0) {
    return { montant: dejaCalcule, calcule: false, raison: "deja_calcule" };
  }

  const chienIds = (resa.reservation_chiens ?? []).map(
    (rc: { chien_id: string }) => rc.chien_id
  );
  if (chienIds.length === 0) return { calcule: false, raison: "sans_chien" };

  const { data: tarifs, error: errTarifs } = await supabaseAdmin
    .from("tarifs")
    .select("categorie, membre, prix")
    .eq("actif", true);
  if (errTarifs) return { calcule: false, erreur: errTarifs.message };
  if (!tarifs || tarifs.length === 0) {
    return { calcule: false, erreur: "Aucun tarif actif : le prix ne peut pas être calculé." };
  }

  const [estMembre, cohabitation] = await Promise.all([
    resa.client_id ? estMembreActif(supabaseAdmin, resa.client_id, resa.date_debut) : false,
    lireCohabitationChiens(chienIds),
  ]);

  const montant = calculerMontant({
    tarifs,
    type_reservation: resa.type_reservation,
    nb_chiens: chienIds.length,
    est_membre: estMembre,
    est_urgence: urgenceDerivee(resa.type_sejour),
    est_privatif: estPrivatifPourSelection(cohabitation),
    date_debut: resa.date_debut,
    date_fin: resa.date_fin,
    heure_arrivee: resa.heure_arrivee,
    heure_depart: resa.heure_depart,
  });

  const { error: errMaj } = await supabaseAdmin
    .from("reservations")
    .update({ montant_calcule: montant })
    .eq("id", reservationId);
  if (errMaj) return { calcule: false, erreur: errMaj.message };

  const total = await recalculerTotalEtPaiement(reservationId, createdBy ?? undefined);
  if (total.error) return { montant, calcule: true, erreur: total.error };

  return { montant, calcule: true };
}
