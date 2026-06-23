import { SwissQRBill } from "swissqrbill/svg";
import { isIBANValid, isQRIBAN, calculateQRReferenceChecksum } from "swissqrbill/utils";
import type { AdresseCreancier } from "./coordonneesPaiement";

function referenceQRR(seed: string): string {
  const digits = (seed || "").replace(/\D/g, "");
  const base = (digits || "0").padStart(26, "0").slice(-26);
  return base + calculateQRReferenceChecksum(base);
}

// Retourne le SVG du bulletin QR, ou null si les donnees sont incompletes/invalides
// (dans ce cas la facture affiche le bloc texte de coordonnees de paiement).
export function genererQrBillSvg(opts: {
  iban: string;
  titulaire: string;
  adresse: AdresseCreancier;
  montant?: number;
  numeroFacture: string;
}): string | null {
  const { iban, titulaire, adresse, montant, numeroFacture } = opts;
  const ibanClean = (iban || "").replace(/\s/g, "");

  if (!ibanClean || !isIBANValid(ibanClean)) return null;
  if (!titulaire || !adresse.rue || !adresse.npa || !adresse.ville || !adresse.pays) return null;

  const data: any = {
    currency: "CHF",
    creditor: {
      account: ibanClean,
      name: titulaire,
      address: adresse.rue,
      buildingNumber: adresse.numero || undefined,
      zip: adresse.npa,
      city: adresse.ville,
      country: (adresse.pays || "CH").toUpperCase().slice(0, 2),
    },
    message: `Facture ${numeroFacture}`,
  };

  if (typeof montant === "number" && montant > 0) {
    data.amount = Math.round(montant * 100) / 100;
  }

  // QR-IBAN -> reference QRR obligatoire ; IBAN normal -> pas de reference (NON)
  if (isQRIBAN(ibanClean)) {
    data.reference = referenceQRR(numeroFacture);
  }

  try {
    return new SwissQRBill(data, { language: "FR" }).toString();
  } catch {
    return null;
  }
}
