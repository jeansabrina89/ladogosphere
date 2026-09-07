import { SwissQRBill } from "swissqrbill/svg";
import { isIBANValid, isQRIBAN } from "swissqrbill/utils";
import { referenceQrrDepuisNumero } from "./referenceQrr";
import type { AdresseCreancier } from "./coordonneesPaiement";

// Retourne le SVG du bulletin QR, ou null si les donnees sont incompletes/invalides
// (dans ce cas la facture affiche le bloc texte de coordonnees de paiement).
/** Adresse du debiteur telle qu'elle figure sur le bulletin. */
export type Debiteur = { nom: string; adresse: string[] };

// Decoupe une adresse libre ("Rue du Lac 12\n1000 Lausanne") en rue / NPA / ville.
function decouperAdresse(lignes: string[]): { rue: string; npa: string; ville: string } | null {
  const propres = lignes.map((l) => l.trim()).filter(Boolean);
  if (propres.length === 0) return null;
  const derniere = propres[propres.length - 1];
  const m = derniere.match(/^(\d{4})\s+(.+)$/);
  if (!m) return null;
  const rue = propres.slice(0, -1).join(", ").trim();
  if (!rue) return null;
  return { rue, npa: m[1], ville: m[2] };
}

export function genererQrBillSvg(opts: {
  iban: string;
  titulaire: string;
  adresse: AdresseCreancier;
  montant?: number;
  numeroFacture: string;
  referenceStockee?: string | null;
  debiteur?: Debiteur | null;
}): string | null {
  const { iban, titulaire, adresse, montant, numeroFacture, referenceStockee, debiteur } = opts;
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

  // Le debiteur n'est ajoute que si son adresse est exploitable : un bulletin
  // avec une adresse incomplete est refuse par la norme.
  if (debiteur?.nom) {
    const a = decouperAdresse(debiteur.adresse ?? []);
    if (a) {
      data.debtor = {
        name: debiteur.nom,
        address: a.rue,
        zip: a.npa,
        city: a.ville,
        country: "CH",
      };
    }
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
