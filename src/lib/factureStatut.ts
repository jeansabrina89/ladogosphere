// Vocabulaire unique des factures, à l'écran comme dans les e-mails.
//
// En base, le statut garde ses valeurs historiques ('acquittee',
// 'partiellement_reglee') : les renommer aurait touché des données et des
// contraintes sans rien apporter. C'est ICI, et seulement ici, que l'on décide
// du mot affiché — « Payée », jamais « réglée » ni « acquittée ».

export type EtatFacture =
  | "brouillon"
  | "envoyee"
  | "en_retard"
  | "partiellement_payee"
  | "payee"
  | "annulee"
  | "avoir";

export type FacturePourEtat = {
  type?: string | null;
  statut?: string | null;
  numero?: string | null;
  date_echeance?: string | null;
  montant_restant?: number | string | null;
};

/**
 * État affiché d'une facture. « En retard » est CALCULÉ : échéance dépassée et
 * reste dû strictement positif — il n'est jamais stocké.
 */
export function etatFacture(f: FacturePourEtat, aujourdhui: string): EtatFacture {
  if (f.type === "avoir") return "avoir";
  if (f.statut === "annulee" || f.statut === "annulee_par_avoir") return "annulee";
  if (!f.numero || f.statut === "brouillon") return "brouillon";
  if (f.statut === "acquittee") return "payee";

  const reste = Number(f.montant_restant ?? 0);
  const echeance = (f.date_echeance ?? "").slice(0, 10);
  if (reste > 0 && echeance && echeance < aujourdhui.slice(0, 10)) return "en_retard";

  if (f.statut === "partiellement_reglee") return "partiellement_payee";
  return "envoyee";
}

const LIBELLES: Record<EtatFacture, string> = {
  brouillon: "Brouillon",
  envoyee: "Envoyée",
  en_retard: "En retard",
  partiellement_payee: "Partiellement payée",
  payee: "Payée",
  annulee: "Annulée",
  avoir: "Avoir",
};

const COULEURS: Record<EtatFacture, { fond: string; texte: string }> = {
  brouillon:           { fond: "#EDE8DF", texte: "rgba(27,43,94,0.65)" },
  envoyee:             { fond: "#E4E7F1", texte: "#2A3B6B" },
  en_retard:           { fond: "#FBE2DE", texte: "#A8453A" },
  partiellement_payee: { fond: "#F4EAC9", texte: "#6E5410" },
  payee:               { fond: "#DBEFEA", texte: "#1F6E5B" },
  annulee:             { fond: "#EDE8DF", texte: "rgba(27,43,94,0.5)" },
  avoir:               { fond: "#E0F2FE", texte: "#0369A1" },
};

export function libelleEtatFacture(etat: EtatFacture): string {
  return LIBELLES[etat];
}

export function couleursEtatFacture(etat: EtatFacture) {
  return COULEURS[etat];
}

/** Statut à écrire en base après un encaissement (valeurs historiques conservées). */
export function statutApresPaiement(montantPaye: number, total: number): string {
  const paye = Math.round(montantPaye * 100) / 100;
  const du = Math.round(total * 100) / 100;
  if (paye <= 0) return "envoyee";
  if (paye >= du) return "acquittee";
  return "partiellement_reglee";
}

/** Libellé français d'un mode de paiement — le même partout. */
const MODES: Record<string, string> = {
  cash: "Espèces",
  twint: "TWINT",
  carte: "Carte",
  virement: "Virement",
  stripe: "Carte",
  avoir: "Avoir",
};

export const MODES_ENCAISSEMENT = [
  { valeur: "cash", libelle: "Espèces" },
  { valeur: "twint", libelle: "TWINT" },
  { valeur: "carte", libelle: "Carte" },
  { valeur: "virement", libelle: "Virement" },
  { valeur: "avoir", libelle: "Avoir" },
] as const;

export function libelleMode(mode: string | null | undefined): string {
  return MODES[mode ?? ""] ?? (mode ?? "—");
}

/** Comptes de produit proposés à la saisie, en français. */
export const COMPTES_PRODUIT = [
  { numero: "3000", libelle: "Séjour" },
  { numero: "3001", libelle: "Garderie" },
  { numero: "3005", libelle: "Adhésion" },
  { numero: "3010", libelle: "Frais et suppléments" },
  { numero: "3020", libelle: "Prestation annexe" },
  { numero: "3200", libelle: "Boutique" },
] as const;

export function libelleCompteProduit(numero: string | null | undefined): string {
  return COMPTES_PRODUIT.find((c) => c.numero === numero)?.libelle ?? (numero ?? "—");
}
