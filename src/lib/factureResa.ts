import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { montantDuReservation } from "@/src/lib/montants";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { synchroniserComptaFacture } from "@/src/lib/comptaFacture";
import { synchroniserComptaResa } from "@/src/lib/comptaResa";
import { secteurParDefautCompte, tauxParDefautCompte } from "@/src/lib/tvaLogique";

// La facture est la pièce pivot : elle porte des LIGNES, et c'est l'émission
// (RPC emettre_facture) qui lui donne son numéro, son échéance et ses écritures.
// Ce module fabrique et rafraîchit le brouillon d'une réservation, puis
// déclenche l'émission au check-out.

const CHAMPS_MONTANT =
  "id, client_id, type_reservation, date_debut, date_fin, montant_calcule, montant_final, ajustement_manuel, montant_paye";

type ResaFacturable = {
  id: string;
  client_id: string | null;
  type_reservation: string | null;
  date_debut: string | null;
  date_fin: string | null;
  montant_calcule: number | string | null;
  montant_final: number | string | null;
  ajustement_manuel: number | string | null;
  montant_paye: number | string | null;
};

async function chargerResa(reservationId: string): Promise<ResaFacturable | null> {
  const { data } = await supabaseAdmin
    .from("reservations")
    .select(CHAMPS_MONTANT)
    .eq("id", reservationId)
    .maybeSingle();
  return (data as ResaFacturable) ?? null;
}

async function factureActive(
  reservationId: string
): Promise<{ facture_id: string; numero: string | null; statut: string } | null> {
  const { data } = await supabaseAdmin
    .from("facture_reservations")
    .select("facture_id, factures!inner(id, numero, statut)")
    .eq("reservation_id", reservationId)
    .eq("facture_annulee", false)
    .maybeSingle();
  if (!data) return null;
  const f = premier<{ id: string; numero: string | null; statut: string }>(
    (data as { factures?: unknown }).factures);
  if (!f) return null;
  return { facture_id: f.id, numero: f.numero ?? null, statut: f.statut };
}

/** PostgREST renvoie une relation imbriquée tantôt seule, tantôt en tableau. */
function premier<T>(v: unknown): T | null {
  if (Array.isArray(v)) return (v[0] as T) ?? null;
  return (v as T) ?? null;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

const jolieDate = (iso: string | null) => {
  if (!iso) return "";
  const [a, m, j] = iso.slice(0, 10).split("-");
  return j ? `${j}.${m}.${a}` : iso;
};

export type LigneAInserer = {
  libelle: string;
  quantite: number;
  prix_unitaire: number;
  compte_produit: string;
  reservation_id?: string | null;
  cotisation_id?: string | null;
};

/**
 * Lignes de facture d'une réservation : le séjour (ou la garderie), chaque
 * extra, et l'adhésion éventuellement embarquée. La somme vaut exactement le
 * montant dû de la réservation.
 */
export async function lignesDepuisReservation(reservationId: string): Promise<LigneAInserer[]> {
  const resa = await chargerResa(reservationId);
  if (!resa) return [];

  const [{ data: extras }, { data: cotis }, { count: nbChiens }] = await Promise.all([
    supabaseAdmin.from("reservation_extras").select("libelle, montant")
      .eq("reservation_id", reservationId).order("created_at"),
    supabaseAdmin.from("cotisations_membres").select("id, montant")
      .eq("reservation_id", reservationId).eq("statut", "payee").maybeSingle(),
    supabaseAdmin.from("reservation_chiens").select("id", { count: "exact", head: true })
      .eq("reservation_id", reservationId),
  ]);

  const totalExtras = arrondi((extras ?? []).reduce(
    (s: number, e: { montant: number | string }) => s + Number(e.montant), 0));
  const montantAdhesion = arrondi(Number(cotis?.montant ?? 0));
  const total = arrondi(montantDuReservation(resa));
  const base = arrondi(total - totalExtras - montantAdhesion);

  const n = Math.max(nbChiens ?? 0, 1);
  const suffixe = ` — ${n} chien${n > 1 ? "s" : ""}`;
  const estSejour = resa.type_reservation === "sejour";
  const libelle = estSejour
    ? `Séjour du ${jolieDate(resa.date_debut)} au ${jolieDate(resa.date_fin)}${suffixe}`
    : `Garderie du ${jolieDate(resa.date_debut)}${suffixe}`;

  const lignes: LigneAInserer[] = [];
  if (base !== 0) {
    lignes.push({
      libelle,
      quantite: 1,
      prix_unitaire: base,
      compte_produit: estSejour ? "3000" : "3001",
      reservation_id: reservationId,
    });
  }
  for (const e of (extras ?? []) as { libelle: string; montant: number | string }[]) {
    if (Number(e.montant) === 0) continue;
    lignes.push({
      libelle: e.libelle,
      quantite: 1,
      prix_unitaire: arrondi(Number(e.montant)),
      compte_produit: "3010",
      reservation_id: reservationId,
    });
  }
  if (montantAdhesion !== 0 && cotis) {
    lignes.push({
      libelle: "Adhésion membre",
      quantite: 1,
      prix_unitaire: montantAdhesion,
      compte_produit: "3005",
      reservation_id: reservationId,
      cotisation_id: cotis.id as string,
    });
  }
  return lignes;
}

/** Remplace les lignes d'un BROUILLON (une facture émise est figée par trigger). */
export async function remplacerLignesBrouillon(
  factureId: string,
  lignes: LigneAInserer[],
): Promise<number> {
  await supabaseAdmin.from("facture_lignes").delete().eq("facture_id", factureId);

  if (lignes.length > 0) {
    await supabaseAdmin.from("facture_lignes").insert(
      lignes.map((l, i) => ({
        facture_id: factureId,
        ordre: i + 1,
        libelle: l.libelle,
        quantite: l.quantite,
        prix_unitaire: l.prix_unitaire,
        compte_produit: l.compte_produit,
        // Le taux et le secteur sont FIGÉS ici, à l'écriture de la ligne.
        taux_tva: tauxParDefautCompte(l.compte_produit),
        secteur_tdfn: secteurParDefautCompte(l.compte_produit),
        reservation_id: l.reservation_id ?? null,
        cotisation_id: l.cotisation_id ?? null,
      })),
    );
  }

  const total = arrondi(lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0));
  return total;
}

/** Aligne les montants d'un brouillon sur ses lignes et ses encaissements. */
async function rafraichirTotauxBrouillon(factureId: string): Promise<void> {
  const { data: lignes } = await supabaseAdmin
    .from("facture_lignes").select("montant").eq("facture_id", factureId);
  const total = arrondi((lignes ?? []).reduce(
    (s: number, l: { montant: number | string }) => s + Number(l.montant), 0));

  const { data: paiements } = await supabaseAdmin
    .from("paiements_resa").select("montant").eq("facture_id", factureId);
  const paye = arrondi((paiements ?? []).reduce(
    (s: number, p: { montant: number | string }) => s + Number(p.montant), 0));

  await supabaseAdmin
    .from("factures")
    .update({
      montant_total: total, montant_ttc: total, montant_ht: total, montant_tva: 0,
      montant_paye: paye, montant_restant: arrondi(total - paye),
    })
    .eq("id", factureId);
}

/** Crée (ou rafraîchit) le brouillon de facture d'une réservation. */
export async function creerOuMajFactureBrouillon(reservationId: string): Promise<void> {
  const resa = await chargerResa(reservationId);
  if (!resa || !resa.client_id) return;

  let active = await factureActive(reservationId);

  if (!active) {
    const { data: facture, error } = await supabaseAdmin
      .from("factures")
      .insert({
        numero: null,
        client_id: resa.client_id,
        type: "facture",
        type_facture: "reservation",
        date_facture: new Date().toISOString().split("T")[0],
        statut: "brouillon",
        reservation_id: null,
      })
      .select("id")
      .single();
    if (error || !facture) return;

    await supabaseAdmin.from("facture_reservations").insert({
      facture_id: facture.id,
      reservation_id: reservationId,
      montant: arrondi(montantDuReservation(resa)),
    });
    active = { facture_id: facture.id, numero: null, statut: "brouillon" };
  }

  // Une facture émise ne bouge plus : ni ses lignes, ni ses montants.
  if (active.numero) return;

  await remplacerLignesBrouillon(active.facture_id, await lignesDepuisReservation(reservationId));
  await supabaseAdmin
    .from("facture_reservations")
    .update({ montant: arrondi(montantDuReservation(resa)) })
    .eq("facture_id", active.facture_id)
    .eq("reservation_id", reservationId);
  await rafraichirTotauxBrouillon(active.facture_id);
}

/**
 * Au CHECK-OUT : la facture est émise pour de bon (numéro, échéance, écritures).
 * Si elle l'est déjà (re-check-out), on ne touche à rien.
 */
export async function figerFactureResa(
  reservationId: string,
  userId?: string | null,
): Promise<{ factureId?: string; numero?: string; error?: string }> {
  await creerOuMajFactureBrouillon(reservationId);
  const active = await factureActive(reservationId);
  if (!active) return { error: "Aucune facture à émettre." };
  if (active.numero) return { factureId: active.facture_id, numero: active.numero };

  const { data, error } = await supabaseAdmin.rpc("emettre_facture", {
    p_facture_id: active.facture_id,
    p_user_id: userId ?? null,
  });
  if (error) return { error: error.message };

  // La réservation ne porte plus le produit : elle se resynchronise en acompte.
  await synchroniserComptaResa(reservationId);
  await synchroniserComptaFacture(active.facture_id, userId ?? null);

  return { factureId: active.facture_id, numero: (data as string) ?? undefined };
}

/**
 * Annulation du check-out : seul un BROUILLON redevient modifiable. Une facture
 * émise reste émise — elle se corrige par un avoir, jamais en marche arrière.
 */
export async function defigerFactureResa(reservationId: string): Promise<void> {
  const active = await factureActive(reservationId);
  if (!active || active.numero) return;
  await supabaseAdmin.from("factures").update({ statut: "brouillon" }).eq("id", active.facture_id);
}

/**
 * Réservation annulée ou refusée : le brouillon disparaît. Une facture émise
 * est conservée telle quelle — l'admin crée un avoir depuis la fiche facture.
 */
export async function annulerFactureResa(reservationId: string): Promise<void> {
  const active = await factureActive(reservationId);
  if (!active) return;

  if (!active.numero) {
    await supabaseAdmin.from("facture_lignes").delete().eq("facture_id", active.facture_id);
    await supabaseAdmin.from("facture_reservations").delete().eq("facture_id", active.facture_id);
    await supabaseAdmin.from("factures").delete().eq("id", active.facture_id);
    return;
  }

  await tracerEvenement({
    entite: "facture",
    entiteId: active.facture_id,
    evenement: "reservation_annulee",
    motif: "Réservation annulée : la facture émise doit être corrigée par un avoir.",
  });
}

/** Un montant de réservation a bougé : le brouillon suit, l'émise ne bouge pas. */
export async function rafraichirFactureBrouillon(reservationId: string): Promise<void> {
  const active = await factureActive(reservationId);
  if (!active || active.numero) return;
  await creerOuMajFactureBrouillon(reservationId);
}

/** La réservation est-elle déjà portée par une facture émise ? */
export async function factureEmisePourReservation(
  reservationId: string,
): Promise<{ id: string; numero: string } | null> {
  const { data } = await supabaseAdmin
    .from("facture_lignes")
    .select("factures!inner(id, numero, statut)")
    .eq("reservation_id", reservationId)
    .not("factures.numero", "is", null)
    .neq("factures.statut", "annulee")
    .limit(1);
  const ligne = (data ?? [])[0] as { factures?: unknown } | undefined;
  const f = premier<{ id: string; numero: string }>(ligne?.factures);
  return f ? { id: f.id, numero: f.numero } : null;
}
