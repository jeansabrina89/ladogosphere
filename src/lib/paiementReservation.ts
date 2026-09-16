import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { montantDuReservation, type ResaMontant } from "@/src/lib/montants";

/**
 * Le paiement d'une réservation — UNE règle, UN endroit.
 *
 * statut_paiement, montant_paye et montant_restant d'une réservation ne se
 * saisissent jamais : ils se DÉRIVENT des factures qui la couvrent et du
 * journal des paiements. Tout chemin qui enregistre ou défait un paiement, émet
 * une facture ou un avoir, appelle `recalculerPaiementReservation` (ou sa
 * variante par facture) ensuite. Un test relit le dépôt : aucune autre écriture
 * de statut_paiement n'existe.
 *
 * LA RÈGLE
 *
 * Ce qui est dû
 *   - Si une facture DÉFINITIVE émise (facture ou libre, non annulée « à
 *     l'ancienne ») porte des lignes de la réservation, le dû est la somme de
 *     ces lignes, moins les lignes de la réservation reprises par des avoirs
 *     émis sur ces factures. Un avoir qui efface tout laisse un dû nul ; une
 *     nouvelle facture le fait renaître.
 *   - Sinon, le dû est le prix de la réservation (montant_final), sauf si elle
 *     est réglée autrement : par une carte journées, offerte, ou fiche du
 *     personnel — alors rien n'est dû.
 *
 * Ce qui est payé
 *   - Chaque paiement rattaché à une facture (définitive ou d'acompte) compte
 *     pour la réservation AU PRORATA de ses lignes dans cette facture : une
 *     facture qui couvre deux séjours de 100 et 300 attribue un quart de chaque
 *     versement au premier.
 *   - Un paiement rattaché à la réservation seule (acompte avant facture, ou
 *     contre-passation à l'annulation) compte entièrement.
 *   - Un trop-perçu déjà reversé en avoir au client ne compte plus.
 *   - Avant le journal des paiements (migration du 23 juin 2026), un paiement
 *     par avoir ne laissait que son mouvement d'avoir : ces mouvements-là,
 *     et eux seuls, comptent comme payé.
 *
 * Le statut
 *   - reste = max(0, dû − payé) ;
 *   - « paye » quand le reste est nul et qu'il y a une raison de l'être
 *     (quelque chose a été payé, facturé, ou la réservation est réglée
 *     autrement) ; une demande dont le prix n'est pas encore calculé reste
 *     « impaye » ;
 *   - « partiel » quand une partie est payée ; « impaye » sinon.
 */

export type StatutPaiement = "paye" | "partiel" | "impaye";

/** Une pièce émise qui porte au moins une ligne de la réservation. */
export type PieceCouvrante = {
  id: string;
  type: "facture" | "libre" | "acompte" | "avoir" | string;
  statut: string;
  /** Somme des lignes de CETTE réservation dans la pièce. */
  lignesReservation: number;
  /** Somme de toutes les lignes de la pièce. */
  lignesTotal: number;
  /** Somme des paiements rattachés à la pièce (journal, contre-passations comprises). */
  paiements: number;
  /** Pour un avoir : le type de la pièce qu'il corrige. */
  typeOrigine?: string | null;
};

export type EntreeDerivation = {
  /** Le prix de la réservation (montant_final, sinon calculé + ajustement). */
  prix: number;
  /** Carte journées, offerte, fiche du personnel : rien n'est dû hors facture. */
  regleeAutrement: boolean;
  pieces: PieceCouvrante[];
  /** Paiements rattachés à la réservation sans facture. */
  paiementsDirects: number;
  /** Trop-perçus reversés en avoir au client (montants positifs). */
  tropPercuReverse: number;
  /** Avoir consommé sur la réservation avant le journal des paiements (positif). */
  payeAvantJournal?: number;
};

export type PaiementDerive = {
  du: number;
  paye: number;
  reste: number;
  statut: StatutPaiement;
  facturee: boolean;
};

/**
 * Création du journal des paiements (migration 20260623181111). Avant, l'avoir
 * consommé sur une réservation était son seul paiement enregistré.
 */
export const JOURNAL_PAIEMENTS_DEPUIS = "2026-06-23T18:11:11Z";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const TOLERANCE = 0.005;

const estDefinitive = (p: PieceCouvrante) =>
  (p.type === "facture" || p.type === "libre") && p.statut !== "annulee" && p.statut !== "brouillon";

/** La dérivation elle-même : pure, sans base, testée cas par cas. */
export function deriverPaiement(e: EntreeDerivation): PaiementDerive {
  const definitives = e.pieces.filter(estDefinitive);
  const facturee = definitives.length > 0;

  let du: number;
  if (facturee) {
    const facture = definitives.reduce((s, p) => s + p.lignesReservation, 0);
    const credite = e.pieces
      .filter((p) => p.type === "avoir" && p.statut !== "brouillon"
        && (p.typeOrigine === "facture" || p.typeOrigine === "libre"))
      .reduce((s, p) => s + p.lignesReservation, 0);
    du = Math.max(0, facture - credite);
  } else {
    du = e.regleeAutrement ? 0 : Math.max(0, e.prix);
  }

  let paye = e.paiementsDirects - e.tropPercuReverse + (e.payeAvantJournal ?? 0);
  for (const p of e.pieces) {
    if (p.type === "avoir" || p.statut === "brouillon") continue;
    if (p.lignesTotal <= 0 || p.paiements === 0) continue;
    paye += p.paiements * (p.lignesReservation / p.lignesTotal);
  }

  du = r2(du);
  paye = r2(paye);
  const reste = r2(Math.max(0, du - paye));

  let statut: StatutPaiement;
  if (reste <= TOLERANCE) {
    statut = paye > TOLERANCE || facturee || e.regleeAutrement || du > TOLERANCE ? "paye" : "impaye";
  } else if (paye > TOLERANCE) {
    statut = "partiel";
  } else {
    statut = "impaye";
  }

  return { du, paye, reste, statut, facturee };
}

// ── La base ────────────────────────────────────────────────────────────────

type ResaLue = ResaMontant & {
  id: string;
  abonnement_id: string | null;
  offerte: boolean | null;
  statut_paiement: string | null;
  montant_restant: number | string | null;
  clients: { interne: boolean | null } | { interne: boolean | null }[] | null;
};

const num = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

const unique = (ids: Iterable<string | null | undefined>) =>
  [...new Set([...ids].filter((x): x is string => !!x))];

/** Lit tout ce qu'il faut pour dériver le paiement de plusieurs réservations. */
export async function lirePaiementsReservations(
  reservationIds: Iterable<string>,
): Promise<Map<string, PaiementDerive & { avant: { statut: string | null; paye: number; reste: number | null } }>> {
  const ids = unique(reservationIds);
  const resultat = new Map<string, PaiementDerive & { avant: { statut: string | null; paye: number; reste: number | null } }>();
  if (ids.length === 0) return resultat;

  const [
    { data: resas, error: errResas },
    { data: lignesResa, error: errLignes },
    { data: directs, error: errDirects },
    { data: tropPercus, error: errTrop },
    { data: avantJournal, error: errAvant },
  ] = await Promise.all([
    supabaseAdmin.from("reservations")
      .select("id, montant_calcule, montant_final, ajustement_manuel, montant_paye, montant_restant, statut_paiement, abonnement_id, offerte, clients (interne)")
      .in("id", ids),
    supabaseAdmin.from("facture_lignes")
      .select("facture_id, reservation_id, montant")
      .in("reservation_id", ids),
    supabaseAdmin.from("paiements_resa")
      .select("reservation_id, montant")
      .in("reservation_id", ids)
      .is("facture_id", null),
    supabaseAdmin.from("avoirs_mouvements")
      .select("reservation_id, montant")
      .in("reservation_id", ids)
      .eq("type", "trop_percu"),
    supabaseAdmin.from("avoirs_mouvements")
      .select("reservation_id, montant")
      .in("reservation_id", ids)
      .in("type", ["utilisation", "annulation_paiement"])
      .is("facture_id", null)
      .lt("created_at", JOURNAL_PAIEMENTS_DEPUIS),
  ]);

  // Une lecture qui échoue ne rend JAMAIS un résultat vide : « rien de payé » ou
  // « rien de dû » serait faux, et un encaissement serait refusé comme soldé.
  const erreur = errResas ?? errLignes ?? errDirects ?? errTrop ?? errAvant;
  if (erreur) throw new Error(`Paiement des réservations illisible : ${erreur.message}`);

  const factureIds = unique((lignesResa ?? []).map((l: { facture_id: string }) => l.facture_id));
  const [
    { data: factures, error: errFactures },
    { data: toutesLignes, error: errToutes },
    { data: paiementsFactures, error: errPaiements },
  ] = factureIds.length
    ? await Promise.all([
        supabaseAdmin.from("factures")
          .select("id, type, statut, numero, facture_origine_id")
          .in("id", factureIds),
        supabaseAdmin.from("facture_lignes").select("facture_id, montant").in("facture_id", factureIds),
        supabaseAdmin.from("paiements_resa").select("facture_id, montant").in("facture_id", factureIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  const erreurFactures = errFactures ?? errToutes ?? errPaiements;
  if (erreurFactures) throw new Error(`Factures des réservations illisibles : ${erreurFactures.message}`);

  type FactureLue = { id: string; type: string; statut: string; numero: string | null; facture_origine_id: string | null };
  const facturesParId = new Map(((factures ?? []) as FactureLue[]).map((f) => [f.id, f]));

  const origineIds = unique([...facturesParId.values()].map((f) => f.facture_origine_id));
  const typesOrigine = new Map<string, string>();
  const manquantes = origineIds.filter((id) => !facturesParId.has(id));
  if (manquantes.length) {
    const { data, error } = await supabaseAdmin.from("factures").select("id, type").in("id", manquantes);
    if (error) throw new Error(`Factures d'origine illisibles : ${error.message}`);
    for (const f of (data ?? []) as { id: string; type: string }[]) typesOrigine.set(f.id, f.type);
  }
  for (const f of facturesParId.values()) typesOrigine.set(f.id, f.type);

  const somme = <T,>(rows: T[] | null, cle: (r: T) => string | null, val: (r: T) => number) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) {
      const k = cle(r);
      if (k) m.set(k, (m.get(k) ?? 0) + val(r));
    }
    return m;
  };
  type L = { facture_id: string; reservation_id?: string | null; montant: number | string };
  const totalParFacture = somme(toutesLignes as L[] | null, (l) => l.facture_id, (l) => num(l.montant));
  const payeParFacture = somme(paiementsFactures as { facture_id: string; montant: number }[] | null,
    (p) => p.facture_id, (p) => num(p.montant));
  const directsParResa = somme(directs as { reservation_id: string; montant: number }[] | null,
    (p) => p.reservation_id, (p) => num(p.montant));
  const tropParResa = somme(tropPercus as { reservation_id: string; montant: number }[] | null,
    (p) => p.reservation_id, (p) => num(p.montant));
  // Consommé = mouvements négatifs : le payé est leur opposé.
  const avantJournalParResa = somme(avantJournal as { reservation_id: string; montant: number }[] | null,
    (p) => p.reservation_id, (p) => -num(p.montant));
  const lignesParResaFacture = somme(lignesResa as L[] | null,
    (l) => `${l.reservation_id}|${l.facture_id}`, (l) => num(l.montant));

  for (const r of (resas ?? []) as ResaLue[]) {
    const client = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    const pieces: PieceCouvrante[] = [];
    for (const [cle, lignes] of lignesParResaFacture) {
      const [resaId, factureId] = cle.split("|");
      if (resaId !== r.id) continue;
      const f = facturesParId.get(factureId);
      // Un brouillon ne couvre rien : il n'est pas encore une pièce.
      if (!f || !f.numero) continue;
      pieces.push({
        id: f.id,
        type: f.type,
        statut: f.statut,
        lignesReservation: lignes,
        lignesTotal: totalParFacture.get(f.id) ?? 0,
        paiements: payeParFacture.get(f.id) ?? 0,
        typeOrigine: f.facture_origine_id ? typesOrigine.get(f.facture_origine_id) ?? null : null,
      });
    }

    const derive = deriverPaiement({
      prix: montantDuReservation(r),
      regleeAutrement: !!r.abonnement_id || !!r.offerte || !!client?.interne,
      pieces,
      paiementsDirects: directsParResa.get(r.id) ?? 0,
      tropPercuReverse: tropParResa.get(r.id) ?? 0,
      payeAvantJournal: avantJournalParResa.get(r.id) ?? 0,
    });
    resultat.set(r.id, {
      ...derive,
      avant: {
        statut: r.statut_paiement ?? null,
        paye: num(r.montant_paye),
        reste: r.montant_restant === null || r.montant_restant === undefined ? null : num(r.montant_restant),
      },
    });
  }
  return resultat;
}

/**
 * Recalcule et enregistre le paiement dérivé de réservations. N'écrit que ce
 * qui a changé. C'est la SEULE écriture de statut_paiement de l'application.
 */
export async function recalculerPaiementsReservations(
  reservationIds: Iterable<string>,
): Promise<Map<string, PaiementDerive>> {
  const derives = await lirePaiementsReservations(reservationIds);
  for (const [id, d] of derives) {
    const inchange = d.avant.statut === d.statut
      && Math.abs(d.avant.paye - d.paye) < TOLERANCE
      && d.avant.reste !== null && Math.abs(d.avant.reste - d.reste) < TOLERANCE;
    if (inchange) continue;
    await supabaseAdmin
      .from("reservations")
      .update({ statut_paiement: d.statut, montant_paye: d.paye, montant_restant: d.reste })
      .eq("id", id);
  }
  return derives;
}

/** Recalcule une réservation. */
export async function recalculerPaiementReservation(reservationId: string): Promise<PaiementDerive | null> {
  return (await recalculerPaiementsReservations([reservationId])).get(reservationId) ?? null;
}

/**
 * Recalcule toutes les réservations couvertes par une pièce (facture, acompte
 * ou avoir) — et, pour un avoir, celles de la facture qu'il corrige.
 */
export async function recalculerPaiementsDeFacture(factureId: string): Promise<void> {
  const [{ data: lignes }, { data: f }] = await Promise.all([
    supabaseAdmin.from("facture_lignes").select("reservation_id").eq("facture_id", factureId)
      .not("reservation_id", "is", null),
    supabaseAdmin.from("factures").select("facture_origine_id").eq("id", factureId).maybeSingle(),
  ]);
  const ids = new Set(((lignes ?? []) as { reservation_id: string }[]).map((l) => l.reservation_id));
  if (f?.facture_origine_id) {
    const { data: lo } = await supabaseAdmin.from("facture_lignes").select("reservation_id")
      .eq("facture_id", f.facture_origine_id).not("reservation_id", "is", null);
    for (const l of (lo ?? []) as { reservation_id: string }[]) ids.add(l.reservation_id);
  }
  if (ids.size > 0) await recalculerPaiementsReservations(ids);
}

/** La facture définitive émise et encore ouverte d'une réservation, s'il y en a une. */
export async function factureOuverteDeReservation(
  reservationId: string,
): Promise<{ id: string; numero: string; montant_restant: number } | null> {
  const { data } = await supabaseAdmin
    .from("facture_lignes")
    .select("factures!inner(id, numero, type, statut, montant_restant, date_facture)")
    .eq("reservation_id", reservationId)
    .not("factures.numero", "is", null)
    .in("factures.type", ["facture", "libre"])
    .in("factures.statut", ["envoyee", "partiellement_reglee"]);
  const factures = ((data ?? []) as { factures: unknown }[])
    .map((l) => (Array.isArray(l.factures) ? l.factures[0] : l.factures) as
      { id: string; numero: string; montant_restant: number | string; date_facture: string })
    .filter(Boolean)
    .sort((a, b) => (a.date_facture < b.date_facture ? 1 : -1));
  const f = factures[0];
  return f ? { id: f.id, numero: f.numero, montant_restant: num(f.montant_restant) } : null;
}
