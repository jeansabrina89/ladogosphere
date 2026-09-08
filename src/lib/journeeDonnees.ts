import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { clientsAvecCommandeARemettre } from "@/src/lib/venteEnLigne";
import {
  calculerJournee,
  decalerJours,
  HORIZON_RAPPELS_JOURS,
  type DroitsJournee,
  type Journee,
  type LigneCheckin,
} from "@/src/lib/journee";

/**
 * Lecture de la journée. Elle ne décide RIEN : tout le calcul est dans
 * journee.ts, qui est pur et testé. Ici, on ne fait que chercher les lignes.
 *
 * Aucune table ni colonne n'a été créée : ces données vivaient déjà, réparties
 * entre le check-in, les réservations, les adhésions, les commandes, les
 * dépenses et les factures.
 */

const LIGNE = `
  id, statut, date_arrivee_prevue, date_depart_prevu, chien_id,
  reservations (
    id, type_reservation, heure_arrivee, heure_depart, statut, offerte,
    montant_final, montant_calcule, montant_paye,
    clients ( id, prenom, nom ),
    boxes ( numero, nom )
  ),
  chiens ( id, nom, statut_essai )
` as const;

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Le box tel qu'on le nomme : son nom s'il en a un, son numéro sinon. */
function nomBox(b: any): string | null {
  const box = Array.isArray(b) ? b[0] : b;
  if (!box) return null;
  return (box.nom as string) || (box.numero != null ? `Box ${box.numero}` : null);
}

function enLigne(brut: any): LigneCheckin {
  const r = Array.isArray(brut.reservations) ? brut.reservations[0] : brut.reservations;
  const c = r ? (Array.isArray(r.clients) ? r.clients[0] : r.clients) : null;
  const chien = Array.isArray(brut.chiens) ? brut.chiens[0] : brut.chiens;

  return {
    id: brut.id as string,
    statut: brut.statut as string,
    date_arrivee_prevue: brut.date_arrivee_prevue ?? null,
    date_depart_prevu: brut.date_depart_prevu ?? null,
    reservation: r
      ? {
          id: r.id ?? null,
          type_reservation: r.type_reservation ?? null,
          heure_arrivee: r.heure_arrivee ?? null,
          heure_depart: r.heure_depart ?? null,
          statut: r.statut ?? null,
          offerte: r.offerte ?? null,
          montant_final: r.montant_final ?? null,
          montant_calcule: r.montant_calcule ?? null,
          montant_paye: r.montant_paye ?? null,
          box: nomBox(r.boxes),
          client: c ? { id: c.id ?? null, prenom: c.prenom ?? null, nom: c.nom ?? null } : null,
        }
      : null,
    chien: chien
      ? { id: chien.id ?? null, nom: chien.nom ?? null, statut_essai: chien.statut_essai ?? null }
      : null,
  };
}

export async function lireJournee(jourISO: string, droits: DroitsJournee): Promise<Journee> {
  const jour = jourISO.slice(0, 10);
  const debut = `${jour}T00:00:00Z`;
  const fin = `${jour}T23:59:59Z`;
  const limite = decalerJours(jour, HORIZON_RAPPELS_JOURS);

  const [{ data: arriveesBrutes }, { data: departsBruts }] = await Promise.all([
    supabaseAdmin.from("checkin_checkout").select(LIGNE)
      .gte("date_arrivee_prevue", debut).lte("date_arrivee_prevue", fin),
    supabaseAdmin.from("checkin_checkout").select(LIGNE)
      .gte("date_depart_prevu", debut).lte("date_depart_prevu", fin),
  ]);

  const arrivees = ((arriveesBrutes ?? []) as any[]).map(enLigne);
  const departs = ((departsBruts ?? []) as any[]).map(enLigne);

  const idsChiens = [...new Set(
    arrivees.map((l) => l.chien?.id).filter((id): id is string => !!id)
  )];
  const idsClients = [...new Set(
    departs.map((l) => l.reservation?.client?.id).filter((id): id is string => !!id)
  )];
  const idsDuJour = new Set([...arrivees, ...departs].map((l) => l.id));

  // « 1re fois » : aucun séjour n'a jamais commencé pour ce chien. C'est
  // l'arrivée RÉELLE qui fait foi, pas la réservation — une réservation
  // annulée n'a fait venir personne.
  const dejaVenus: string[] = [];
  if (idsChiens.length > 0) {
    const { data } = await supabaseAdmin
      .from("checkin_checkout")
      .select("id, chien_id")
      .in("chien_id", idsChiens)
      .not("date_arrivee_reelle", "is", null);
    for (const row of (data ?? []) as any[]) {
      if (idsDuJour.has(row.id)) continue;
      if (row.chien_id) dejaVenus.push(row.chien_id as string);
    }
  }

  const colis = idsClients.length > 0
    ? await clientsAvecCommandeARemettre(idsClients)
    : new Map<string, number>();

  // Les échéances comptables ne sont même pas lues pour qui n'y a pas droit :
  // une donnée qu'on ne doit pas voir ne doit pas partir de la base.
  const [adhesionsRes, commandesRes, depensesRes, facturesRes] = await Promise.all([
    droits.isAdmin || droits.perm_encaissements
      ? supabaseAdmin.from("cotisations_membres")
          .select("id, date_fin, clients ( id, prenom, nom )")
          .eq("statut", "payee")
          .not("date_fin", "is", null)
          .lte("date_fin", limite)
          .gte("date_fin", decalerJours(jour, -30))
          .order("date_fin")
      : Promise.resolve({ data: [] as any[] }),
    droits.perm_boutique_vente
      ? supabaseAdmin.from("commandes_personnalisees")
          .select("id, numero, date_promise, statut, clients ( id, prenom, nom )")
          .eq("statut", "a_faire")
          .not("date_promise", "is", null)
          .lte("date_promise", limite)
          .order("date_promise")
      : Promise.resolve({ data: [] as any[] }),
    droits.isAdmin
      ? supabaseAdmin.from("depenses")
          .select("id, numero, libelle, date_depense, montant")
          .not("statut", "in", "(brouillon,annulee)")
          .order("date_depense", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as any[] }),
    droits.isAdmin
      ? supabaseAdmin.from("factures")
          .select("id, numero, date_echeance, montant_restant, type, statut, clients ( id, prenom, nom )")
          .lt("date_echeance", jour)
          .gt("montant_restant", 0)
          .order("date_echeance")
      : Promise.resolve({ data: [] as any[] }),
  ]);

  // Les justificatifs : une seule requête, puis une différence d'ensembles.
  let depensesSansJustificatif: any[] = [];
  const depenses = (depensesRes.data ?? []) as any[];
  if (depenses.length > 0) {
    const { data: pieces } = await supabaseAdmin
      .from("pieces").select("entite_id").eq("entite", "depense");
    const avecPiece = new Set((pieces ?? []).map((p: any) => p.entite_id as string));
    depensesSansJustificatif = depenses.filter((d) => !avecPiece.has(d.id));
  }

  const client = (v: any) => {
    const c = Array.isArray(v) ? v[0] : v;
    return c ? { id: c.id ?? null, prenom: c.prenom ?? null, nom: c.nom ?? null } : null;
  };

  return calculerJournee({
    jourISO: jour,
    arrivees,
    departs,
    chiensDejaVenus: dejaVenus,
    colisParClient: Object.fromEntries(colis),
    adhesions: ((adhesionsRes.data ?? []) as any[]).map((a) => ({
      id: a.id, date_fin: a.date_fin, client: client(a.clients),
    })),
    commandes: ((commandesRes.data ?? []) as any[]).map((c) => ({
      id: c.id, numero: c.numero, date_promise: c.date_promise, statut: c.statut,
      client: client(c.clients),
    })),
    depensesSansJustificatif: depensesSansJustificatif.map((d) => ({
      id: d.id, numero: d.numero, libelle: d.libelle,
      date_depense: d.date_depense, montant: d.montant,
    })),
    // Un avoir n'est pas une facture en retard : il n'attend aucun paiement.
    facturesEnRetard: ((facturesRes.data ?? []) as any[])
      .filter((f) => f.type !== "avoir" && f.statut !== "annulee" && f.statut !== "annulee_par_avoir")
      .map((f) => ({
        id: f.id, numero: f.numero, date_echeance: f.date_echeance,
        montant_restant: f.montant_restant, client: client(f.clients),
      })),
    droits,
  });
}
