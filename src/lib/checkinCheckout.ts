import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { figerFactureResa, defigerFactureResa } from "@/src/lib/factureResa";
import { finaliserEmission } from "@/src/lib/factureDocument";
import { synchroniserComptaResa } from "@/src/lib/comptaResa";
import { synchroniserComptaAbonnement } from "@/src/lib/comptaAbonnement";
import { estResultatEssai, type ResultatEssai } from "@/src/lib/journeeEssai";
import { envoyerEmailResultatEssai } from "@/src/lib/email";
import { tracerEvenement } from "@/src/lib/journalEvenements";

type Resultat = { error?: string };

export const MESSAGE_RESULTAT_ESSAI_REQUIS =
  "Journée d'essai : indiquez le résultat (validé, seconde journée ou refusé) avant d'enregistrer le départ.";

/** Préfixe du message d'échec d'émission — le départ n'est PAS enregistré. */
export const MESSAGE_FACTURE_NON_EMISE = "La facture n'a pas pu être émise";

/** Options du check-out : résultat de la journée d'essai, le cas échéant. */
export type OptionsCheckout = {
  resultat?: string | null;
  note?: string | null;
  /** Profil du membre du personnel qui rend le chien. */
  profilId?: string | null;
};

// Met a jour la ligne checkin_checkout. Retourne le message d'erreur Supabase le cas echeant.
async function majCheckinCheckout(
  checkinId: string,
  updates: Record<string, unknown>,
): Promise<Resultat> {
  const { error } = await supabaseAdmin
    .from("checkin_checkout")
    .update(updates)
    .eq("id", checkinId);

  if (error) return { error: error.message };
  return {};
}

// Recupere la reservation liee a une ligne de checkin_checkout.
async function lireReservationId(checkinId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("checkin_checkout")
    .select("reservation_id")
    .eq("id", checkinId)
    .single();

  return data?.reservation_id ?? null;
}

// Check-in : la ligne passe a "arrive".
// Le statut d'essai du chien n'est PLUS touche ici : il reste 'programme' jusqu'a
// la saisie du resultat au depart (cf. appliquerCheckout). Les colonnes
// historiques journee_essai_effectuee / _invalide sont derivees par trigger SQL.
export async function appliquerCheckin(checkinId: string): Promise<Resultat> {
  return majCheckinCheckout(checkinId, {
    statut: "arrive",
    date_arrivee_reelle: new Date().toISOString(),
  });
}

/** Ligne de check-in avec ce qu'il faut pour traiter une journee d'essai. */
type LigneEssai = {
  chien_id: string | null;
  reservation_id: string | null;
  chiens: { id: string; nom: string } | null;
  reservations: {
    type_reservation: string | null;
    clients: { email: string | null; prenom: string | null } | null;
  } | null;
};

async function lireLigneEssai(checkinId: string): Promise<LigneEssai | null> {
  const { data } = await supabaseAdmin
    .from("checkin_checkout")
    .select(`
      chien_id, reservation_id,
      chiens (id, nom),
      reservations (type_reservation, clients (email, prenom))
    `)
    .eq("id", checkinId)
    .maybeSingle();
  return (data ?? null) as unknown as LigneEssai | null;
}

/**
 * Enregistre le resultat de la journee d'essai du chien de cette ligne, puis
 * previent le client (sauf refus, explique de vive voix).
 */
async function enregistrerResultatEssai(
  ligne: LigneEssai,
  resultat: ResultatEssai,
  note: string | null,
  profilId: string | null,
): Promise<Resultat> {
  const chienId = ligne.chien_id ?? ligne.chiens?.id ?? null;
  if (!chienId) return { error: "Chien introuvable pour cette journée d'essai." };

  const { error } = await supabaseAdmin
    .from("chiens")
    .update({
      statut_essai: resultat,
      journee_essai_resultat_le: new Date().toISOString(),
      journee_essai_resultat_par: profilId,
      journee_essai_note: note,
    })
    .eq("id", chienId);
  if (error) return { error: error.message };

  // La note interne n'est JAMAIS envoyee au client.
  const email = ligne.reservations?.clients?.email;
  if (email && resultat !== "refuse") {
    try {
      await envoyerEmailResultatEssai({
        email,
        prenom: ligne.reservations?.clients?.prenom || "Client",
        nom_chien: ligne.chiens?.nom || "votre chien",
        resultat,
      });
    } catch (e) {
      console.error("Erreur envoi email résultat essai:", e);
    }
  }

  return {};
}

// Check-out : la ligne passe a "parti", la reservation est cloturee, la facture figee
// et les ecritures comptables synchronisees.
// Pour une journee d'essai, le resultat (valide / seconde_journee / refuse) est
// OBLIGATOIRE : sans lui, le depart est refuse.
export async function appliquerCheckout(
  checkinId: string,
  options: OptionsCheckout = {},
): Promise<Resultat> {
  const ligne = await lireLigneEssai(checkinId);
  const estEssai = ligne?.reservations?.type_reservation === "essai";

  if (estEssai && !estResultatEssai(options.resultat)) {
    return { error: MESSAGE_RESULTAT_ESSAI_REQUIS };
  }

  const res = await majCheckinCheckout(checkinId, {
    statut: "parti",
    date_depart_reel: new Date().toISOString(),
  });
  if (res.error) return res;

  if (estEssai && ligne && estResultatEssai(options.resultat)) {
    const majEssai = await enregistrerResultatEssai(
      ligne,
      options.resultat,
      (options.note ?? "").trim() || null,
      options.profilId ?? null,
    );
    if (majEssai.error) return majEssai;
  }

  const reservationId = await lireReservationId(checkinId);
  if (reservationId) {
    const { data: avant } = await supabaseAdmin
      .from("reservations")
      .select("statut")
      .eq("id", reservationId)
      .maybeSingle();
    const statutAvant = avant?.statut ?? "validee";

    await supabaseAdmin.from("reservations").update({ statut: "terminee" }).eq("id", reservationId);

    // Le check-out EMET la facture : numero, echeance, ecritures, PDF et e-mail.
    // Un echec ici n'est JAMAIS avale : c'est un chemin qui produit de l'argent.
    const emission = await figerFactureResa(reservationId, options.profilId ?? null);
    if (emission.error) {
      // Retour a l'etat d'avant : la reservation reste en cours et le chien
      // n'est pas parti. Rien ne doit rester a moitie fait.
      await supabaseAdmin
        .from("reservations")
        .update({ statut: statutAvant })
        .eq("id", reservationId);
      await majCheckinCheckout(checkinId, { statut: "arrive", date_depart_reel: null });

      await tracerEvenement({
        entite: "reservation",
        entiteId: reservationId,
        evenement: "emission_facture_echouee",
        motif: emission.error,
        apres: { checkin_id: checkinId, statut_retabli: statutAvant },
        userId: options.profilId ?? null,
      });

      return { error: `${MESSAGE_FACTURE_NON_EMISE} : ${emission.error}` };
    }

    if (emission.factureId) {
      await finaliserEmission(emission.factureId, options.profilId ?? null);
    }
    const { data: resaDate } = await supabaseAdmin
      .from("reservations")
      .select("date_fin, abonnement_id")
      .eq("id", reservationId)
      .maybeSingle();
    await synchroniserComptaResa(reservationId, resaDate?.date_fin ?? undefined);
    if (resaDate?.abonnement_id) {
      await synchroniserComptaAbonnement(resaDate.abonnement_id);
    }
  }

  return {};
}

// Annulation du check-in : retour a l'etat "attendu".
export async function annulerCheckin(checkinId: string): Promise<Resultat> {
  return majCheckinCheckout(checkinId, {
    statut: "attendu",
    date_arrivee_reelle: null,
  });
}

// Annulation du check-out : la reservation est rouverte, la facture defigee,
// la compta de la reservation ET celle de l'abonnement eventuel resynchronisees.
// La resynchronisation de la reservation est indispensable : le sejour n'est plus
// "terminee", le produit ne doit donc plus etre reconnu et les encaissements
// repassent en acompte (2030).
export async function annulerCheckout(checkinId: string): Promise<Resultat> {
  const res = await majCheckinCheckout(checkinId, {
    statut: "arrive",
    date_depart_reel: null,
  });
  if (res.error) return res;

  const reservationId = await lireReservationId(checkinId);
  if (reservationId) {
    await supabaseAdmin.from("reservations").update({ statut: "validee" }).eq("id", reservationId);
    await defigerFactureResa(reservationId);
    await synchroniserComptaResa(reservationId);
    const { data: resaAbo } = await supabaseAdmin
      .from("reservations")
      .select("abonnement_id")
      .eq("id", reservationId)
      .maybeSingle();
    if (resaAbo?.abonnement_id) {
      await synchroniserComptaAbonnement(resaAbo.abonnement_id);
    }
  }

  return {};
}
