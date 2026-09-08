import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import {
  compteProduitCategorie,
  compteProduitReservation,
  joursConsommes,
  lignesExpiration,
  lignesJourConsomme,
  transfertsDeLaCarte,
  valeurRestante,
  type CarteAbonnement,
  type MouvementCarte,
} from "@/src/lib/abonnementProduitLogique";

/**
 * La reconnaissance du produit d'une carte, journée par journée.
 *
 * L'achat est porté par la FACTURE (2031 au crédit, 1100 au débit) : rien
 * n'est reconnu ce jour-là. Ce sont les journées consommées qui font sortir la
 * valeur de 2031 vers le produit de la pension, et l'expiration qui solde le
 * reste.
 *
 * Chaque écriture est attachée au MOUVEMENT qui la déclenche : une écriture
 * existe pour ce mouvement, ou elle n'existe pas. Rejouer la synchronisation
 * ne double donc rien, et aucune écriture passée n'est jamais réécrite.
 */

export const PIECE_JOUR = "abonnement_jour";
export const PIECE_EXPIRATION = "abonnement_expiration";

type Carte = CarteAbonnement & {
  id: string;
  categorie: string | null;
  facture_id: string | null;
  date_expiration: string | null;
};

async function lireCarte(abonnementId: string): Promise<Carte | null> {
  const { data } = await supabaseAdmin
    .from("abonnements")
    .select("id, categorie, prix_paye, jours_total, jours_offerts, facture_id, date_expiration")
    .eq("id", abonnementId)
    .maybeSingle();
  return (data as unknown as Carte | null) ?? null;
}

async function lireMouvements(abonnementId: string): Promise<(MouvementCarte & { created_at: string })[]> {
  const { data } = await supabaseAdmin
    .from("abonnements_mouvements")
    .select("id, type, delta, reservation_id, created_at")
    .eq("abonnement_id", abonnementId)
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as (MouvementCarte & { created_at: string })[];
}

/** Les mouvements qui ont déjà leur écriture : on ne les repasse pas. */
async function mouvementsDejaPasses(pieceType: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data } = await supabaseAdmin
    .from("ecritures")
    .select("piece_id")
    .eq("piece_type", pieceType)
    .in("piece_id", ids);
  return new Set(((data ?? []) as { piece_id: string }[]).map((e) => e.piece_id));
}

/** Le type de la réservation réglée : c'est lui qui choisit le compte de produit. */
async function typeDeLaReservation(reservationId: string | null): Promise<string | null> {
  if (!reservationId) return null;
  const { data } = await supabaseAdmin
    .from("reservations").select("type_reservation").eq("id", reservationId).maybeSingle();
  return (data?.type_reservation as string) ?? null;
}

/**
 * Passe les transferts manquants d'une carte : une écriture par journée
 * consommée, une par journée recréditée.
 *
 * Ne lance jamais : une erreur part dans Sentry, la carte reste utilisable.
 */
export async function reconnaitreJoursAbonnement(
  abonnementId: string,
  userId?: string | null
): Promise<void> {
  try {
    const carte = await lireCarte(abonnementId);
    // Les cartes d'avant APP 15 gardent leur comptabilisation d'origine : leur
    // produit a été reconnu autrement, et on ne réécrit pas l'histoire.
    if (!carte || !carte.facture_id) return;

    const mouvements = await lireMouvements(abonnementId);
    const transferts = transfertsDeLaCarte(carte, mouvements);
    if (transferts.length === 0) return;

    const deja = await mouvementsDejaPasses(PIECE_JOUR, transferts.map((t) => t.mouvementId));

    for (const t of transferts) {
      if (deja.has(t.mouvementId)) continue;
      if (t.part === 0) continue; // Une journée offerte ne porte aucun produit.

      const compte = compteProduitReservation(await typeDeLaReservation(t.reservationId));
      const lignes = lignesJourConsomme(t.part, compte);
      if (lignes.length === 0) continue;

      const dateMouvement = (mouvements.find((m) => m.id === t.mouvementId)?.created_at ?? "")
        .slice(0, 10) || new Date().toISOString().slice(0, 10);

      const { error } = await supabaseAdmin.rpc("passer_ecriture", {
        p_date: dateMouvement,
        p_libelle: t.part > 0
          ? `Journée d'abonnement consommée (${t.rang}/${carte.jours_total})`
          : `Journée d'abonnement recréditée (${t.rang}/${carte.jours_total})`,
        p_piece_type: PIECE_JOUR,
        p_piece_id: t.mouvementId,
        p_lignes: lignes,
        p_created_by: userId ?? null,
      });
      if (error) throw error;
    }
  } catch (e: unknown) {
    Sentry.captureException(e);
    console.error("compta abonnement (journées):", e);
  }
}

/**
 * L'expiration : ce qui reste en 2031 devient un produit, à la date du
 * mouvement d'expiration.
 *
 * Le client a payé, il n'a pas utilisé, la prestation n'est plus due.
 */
export async function reconnaitreExpirationAbonnement(
  abonnementId: string,
  userId?: string | null
): Promise<void> {
  try {
    const carte = await lireCarte(abonnementId);
    if (!carte || !carte.facture_id) return;

    const mouvements = await lireMouvements(abonnementId);
    const expiration = mouvements.filter((m) => m.type === "expiration");
    if (expiration.length === 0) return;

    const deja = await mouvementsDejaPasses(PIECE_EXPIRATION, expiration.map((m) => m.id));

    // Les journées consommées AVANT l'expiration décident de ce qui reste.
    for (const m of expiration) {
      if (deja.has(m.id)) continue;
      const avant = mouvements.filter((x) => x.created_at < m.created_at);
      const reste = valeurRestante(carte, joursConsommes(avant));
      if (reste === 0) continue;

      const lignes = lignesExpiration(reste, compteProduitCategorie(carte.categorie));
      const { error } = await supabaseAdmin.rpc("passer_ecriture", {
        p_date: m.created_at.slice(0, 10),
        p_libelle: "Abonnement expiré — journées non consommées",
        p_piece_type: PIECE_EXPIRATION,
        p_piece_id: m.id,
        p_lignes: lignes,
        p_created_by: userId ?? null,
      });
      if (error) throw error;

      await tracerEvenement({
        entite: "abonnement",
        entiteId: abonnementId,
        evenement: "abonnement_expire",
        apres: {
          valeur_non_consommee: reste,
          compte: compteProduitCategorie(carte.categorie),
          jours_consommes: joursConsommes(avant),
        },
        userId: userId ?? null,
      });
    }
  } catch (e: unknown) {
    Sentry.captureException(e);
    console.error("compta abonnement (expiration):", e);
  }
}

/** Les deux d'un coup, dans l'ordre : les journées, puis ce qui reste. */
export async function synchroniserProduitAbonnement(
  abonnementId: string,
  userId?: string | null
): Promise<void> {
  await reconnaitreJoursAbonnement(abonnementId, userId);
  await reconnaitreExpirationAbonnement(abonnementId, userId);
}

/**
 * Ce que 2031 devrait porter, carte par carte : la valeur des journées non
 * encore consommées. C'est l'assertion du système, et l'écran de contrôle la
 * compare au solde réel du compte.
 */
export async function valeurPrepayeeRestante(): Promise<number> {
  const { data: cartes } = await supabaseAdmin
    .from("abonnements")
    .select("id, prix_paye, jours_total, jours_offerts, facture_id, statut")
    .not("facture_id", "is", null);

  let total = 0;
  for (const c of (cartes ?? []) as unknown as (Carte & { statut: string })[]) {
    // Une carte annulée ou expirée ne porte plus rien : l'avoir ou l'écriture
    // d'expiration a déjà vidé sa part de 2031.
    if (c.statut === "annule" || c.statut === "expire") continue;
    const mouvements = await lireMouvements(c.id);
    total += valeurRestante(c, joursConsommes(mouvements));
  }
  return Math.round(total * 100) / 100;
}
