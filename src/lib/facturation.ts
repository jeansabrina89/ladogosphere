export type EcartType = "trop_percu" | "complement" | "aucun";

/**
 * Message à afficher après un recalcul de facturation ayant généré un écart
 * sur une réservation déjà payée (trop-perçu crédité en avoir, ou complément à demander).
 */
export function messageEcart(type_ecart: EcartType | undefined, ecart: number | undefined): string | null {
  if (type_ecart === "trop_percu" && ecart) {
    return `Trop-perçu de ${ecart.toFixed(2)} CHF porté en avoir du client.`;
  }
  if (type_ecart === "complement" && ecart) {
    return `Complément de ${ecart.toFixed(2)} CHF à demander au client.`;
  }
  return null;
}
