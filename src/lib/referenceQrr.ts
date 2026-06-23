import { calculateQRReferenceChecksum } from "swissqrbill/utils";

// Reference QRR (27 chiffres) derivee du numero de facture : stable et unique.
// On garde les chiffres du numero, on complete a 26 chiffres, puis on ajoute
// le chiffre de controle. Memes regles que l affichage du bulletin QR.
export function referenceQrrDepuisNumero(numero: string): string {
  const digits = (numero || "").replace(/\D/g, "");
  const base = (digits || "0").padStart(26, "0").slice(-26);
  return base + calculateQRReferenceChecksum(base);
}
