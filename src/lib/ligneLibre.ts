import { tvaDeLaPrestation } from "@/src/lib/tva";
import { prestationDuCompte, secteurParDefautCompte } from "@/src/lib/tvaLogique";

/**
 * Ce qu'une ligne libre fige au moment où on l'écrit.
 *
 * UNE seule fonction pour toutes les lignes libres, qu'elles viennent de
 * l'assistant de facture de la comptabilité ou de la facture d'un locataire.
 * Deux copies de cette règle finiraient par figer deux taux différents pour la
 * même prestation, sur deux factures du même jour.
 *
 * La règle : une ligne libre suit la prestation de son compte de produit. Son
 * taux passe par `tvaDeLaPrestation`, donc par `tauxAFiger` — zéro tant que
 * l'entreprise n'est pas assujettie, et le motif qui va avec.
 */
export async function figerLigneLibre(
  compteProduit: string,
  /** Date qui décide du régime de TVA : celle de la pièce, ou de la période facturée. */
  dateTva: string
): Promise<{ taux_tva: number; motif_tva: string | null; secteur_tdfn: string }> {
  const tva = await tvaDeLaPrestation(prestationDuCompte(compteProduit) ?? "sejour", dateTva);
  return {
    taux_tva: tva.taux,
    motif_tva: tva.motif,
    secteur_tdfn: secteurParDefautCompte(compteProduit),
  };
}
