/**
 * La doublure de base commune aux tests d'e-mails (APP 60).
 *
 * Elle rend juste ce qu'il faut pour que les DIX-HUIT fonctions d'envoi aillent
 * jusqu'au bout : une commande, un client, deux lignes, une adresse. Sans elle,
 * `commande_confirmee` et `commande_expediee` s'arrêtaient avant d'écrire quoi
 * que ce soit, et la comparaison « avant / après » ne les couvrait pas — deux
 * trous dans le seul filet du lot.
 */

export type ReponseTable = { data: unknown; error: null };

export const COMMANDE = {
  id: "cmd-1",
  numero: "CMD-2026-0007",
  numero_suivi: "99.00.123456.78901234",
  mode_remise: "postal",
  mode_paiement: "facture",
  frais_port: 9,
  remise_membre: 0,
  montant_total: 77,
  client_id: "cl-1",
  adresse_livraison: {
    nom: "Sabrina Jean", rue: "Rue du Lac 3", npa: "1950", localite: "Sion", pays: "Suisse",
  },
};

export const CLIENT = { prenom: "Sabrina", email: "client@exemple.ch" };

export const LIGNES_COMMANDE = [
  {
    id: "l-1", libelle: "Collier en cuir sur mesure", quantite: 1,
    prix_unitaire: 68, montant: 68, configuration: null, commande_personnalisee_id: null,
  },
];

/** Ce que chaque table rend, par défaut. Les réglages restent VIDES. */
export function donneesTable(table: string): unknown {
  if (table === "commandes") return COMMANDE;
  if (table === "clients") return CLIENT;
  return null;
}

export function lignesTable(table: string): unknown[] {
  if (table === "commandes_lignes") return LIGNES_COMMANDE;
  return [];
}
