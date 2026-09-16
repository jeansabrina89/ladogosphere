/**
 * L'usage d'un fournisseur, dérivé de son compte de charge habituel.
 *
 * Un seul carnet de fournisseurs, c'est voulu : un même grossiste vend des
 * croquettes au magasin et du cuir à l'atelier. L'usage sert à FILTRER la
 * liste, pas à la découper. Il se lit dans compte_charge_defaut, et cette table
 * est la seule qui fait la correspondance.
 *
 * Module pur.
 */

export type Usage = "magasin" | "atelier" | "pension" | "loyer" | "assurances" | "frais_generaux" | "sans_compte";

export const USAGES: { valeur: Usage; libelle: string; fond: string; texte: string }[] = [
  { valeur: "magasin", libelle: "Magasin", fond: "#E4F1EC", texte: "#1F6E5B" },
  { valeur: "atelier", libelle: "Atelier", fond: "#F4EAC9", texte: "#6E5410" },
  { valeur: "pension", libelle: "Pension", fond: "#E4E7F1", texte: "#2A3B6B" },
  { valeur: "loyer", libelle: "Loyer et locaux", fond: "#E0F2FE", texte: "#0369A1" },
  { valeur: "assurances", libelle: "Assurances", fond: "#F3E8F7", texte: "#6B3A7D" },
  { valeur: "frais_generaux", libelle: "Frais généraux", fond: "#EDE8DF", texte: "#5C5446" },
  { valeur: "sans_compte", libelle: "Sans compte", fond: "#FBE2DE", texte: "#A8453A" },
];

/**
 * Les règles, dans l'ordre : comptes exacts d'abord, plages ensuite. Un compte
 * hors de toute plage tombe dans « Frais généraux ».
 */
const EXACTS: Record<string, Usage> = {
  "4200": "magasin",
  "4000": "atelier",
  "4400": "pension",
  "4410": "pension",
};
const PLAGES: { de: number; a: number; usage: Usage }[] = [
  { de: 6000, a: 6099, usage: "loyer" },
  { de: 6300, a: 6399, usage: "assurances" },
];

export function usageDuCompte(compte: string | null | undefined): Usage {
  const c = String(compte ?? "").trim();
  if (c === "") return "sans_compte";
  if (EXACTS[c]) return EXACTS[c];
  const n = Number(c);
  if (Number.isInteger(n)) {
    const plage = PLAGES.find((p) => n >= p.de && n <= p.a);
    if (plage) return plage.usage;
  }
  return "frais_generaux";
}

export function infoUsage(usage: Usage) {
  return USAGES.find((u) => u.valeur === usage)!;
}

/** Les usages cochés, lus dans l'adresse (?usages=magasin,atelier). Inconnus ignorés. */
export function lireUsages(brut: string | string[] | null | undefined): Usage[] {
  const texte = Array.isArray(brut) ? brut.join(",") : String(brut ?? "");
  const connus = new Set(USAGES.map((u) => u.valeur));
  return [...new Set(texte.split(",").map((s) => s.trim()).filter((s): s is Usage => connus.has(s as Usage)))];
}

/** Union des usages cochés ; rien de coché = tout. */
export function fournisseurRetenu(compte: string | null | undefined, coches: Usage[]): boolean {
  return coches.length === 0 || coches.includes(usageDuCompte(compte));
}

/** L'adresse après avoir coché ou décoché une pastille. */
export function basculerUsage(coches: Usage[], usage: Usage): string {
  const suite = coches.includes(usage) ? coches.filter((u) => u !== usage) : [...coches, usage];
  const ordonnes = USAGES.map((u) => u.valeur).filter((u) => suite.includes(u));
  return ordonnes.length === 0 ? "" : `?usages=${ordonnes.join(",")}`;
}
