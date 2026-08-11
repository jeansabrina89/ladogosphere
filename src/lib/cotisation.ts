export type EtatAdhesion = "payee" | "en_attente" | "aucune";

/**
 * État de l'adhésion d'une année, pour l'affichage admin :
 * - "payee"      → verrouillé (✅), rien à faire ;
 * - "en_attente" → une cotisation existe mais n'est pas réglée → à ENCAISSER / corriger ;
 * - "aucune"     → aucune cotisation pour l'année → à enregistrer.
 *
 * Règle : SEUL le statut 'payee' verrouille l'affichage. Tout autre statut sur
 * une ligne existante est traité comme « en attente » (donc encaissable).
 */
export function etatAdhesion(
  cotisation?: { statut?: string | null } | null
): EtatAdhesion {
  if (!cotisation) return "aucune";
  return cotisation.statut === "payee" ? "payee" : "en_attente";
}
