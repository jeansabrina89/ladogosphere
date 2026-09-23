import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { tracerEvenement } from "@/src/lib/journalEvenements";

/**
 * Bascule une fiche `clients` existante en fiche INTERNE (personnel) et valide
 * ses chiens. Le sens inverse n'existe pas.
 *
 * Ce n'est PAS une action serveur : ce module n'a pas de "use server", donc
 * aucune requête ne peut l'atteindre directement. Seul un code serveur qui a
 * déjà vérifié à qui appartient la fiche l'appelle — le layout client, pour la
 * fiche de la personne connectée quand son profil est du personnel.
 */
export async function basculerFicheEnInterneServeur(client_id: string, userId: string | null): Promise<void> {
  await tracerEvenement({
    entite: "client", entiteId: client_id, evenement: "bascule_interne",
    apres: { interne: true, cotisation_exemptee: true, membre: true, chiens_valides: true },
    userId,
  });
  await supabaseAdmin
    .from("clients")
    .update({
      interne: true,
      cotisation_exemptee: true,
      cotisation_exemptee_raison: "Personnel de la pension",
      membre: true,
    })
    .eq("id", client_id);

  // Aucune journée d'essai n'est jamais exigée pour les chiens du personnel.
  await supabaseAdmin
    .from("chiens")
    .update({ statut_essai: "valide" })
    .eq("client_id", client_id)
    .neq("statut_essai", "valide");
}
