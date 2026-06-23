import { SwissQRBill } from "swissqrbill/svg";
import { isIBANValid, isQRIBAN } from "swissqrbill/utils";
import { referenceQrrDepuisNumero } from "./referenceQrr";
import type { AdresseCreancier } from "./coordonneesPaiement";

// Retourne le SVG du bulletin QR, ou null si les donnees sont incompletes/invalides
// (dans ce cas la facture affiche le bloc texte de coordonnees de paiement).
export function genererQrBillSvg(opts: {
  iban: string;
  titulaire: string;
  adresse: AdresseCreancier;
  montant?: number;
  numeroFacture: string;
  referenceStockee?: string | null;
}): string | null {
  const { iban, titulaire, adresse, montant, numeroFacture, referenceStockee } = opts;
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

  // QR-IBAN -> reference QRR obligatoire. On prend la reference figee sur la
  // facture si elle existe (27 chiffres), sinon on la derive du numero.
  if (isQRIBAN(ibanClean)) {
    const ref = (referenceStockee || "").replace(/\D/g, "");
    data.reference = ref.length === 27 ? ref : referenceQrrDepuisNumero(numeroFacture);
  }

  try {
    return new SwissQRBill(data, { language: "FR" }).toString();
  } catch {
    return null;
  }
}
