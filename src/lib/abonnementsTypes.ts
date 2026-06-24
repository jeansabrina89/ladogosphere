export const JOURS_PAR_CARTE = 11;
export const JOURS_PAYES = 10;

export type TypeAbonnement = { categorie: string; label: string };

export const TYPES_ABONNEMENT: TypeAbonnement[] = [
  { categorie: "journee_partage_1", label: "1 chien sociable" },
  { categorie: "journee_partage_2", label: "2 chiens ensemble" },
  { categorie: "journee_partage_3", label: "3 chiens ensemble" },
  { categorie: "journee_privatif",  label: "1 chien box prive" },
];

export function labelAbonnement(categorie: string | null | undefined): string {
  return TYPES_ABONNEMENT.find((t) => t.categorie === categorie)?.label ?? (categorie ?? "Carte");
}

export type ChienHebergement = { hebergement_autorise: string | null; actif?: boolean | null };

export function cartesEligibles(chiens: ChienHebergement[]): string[] {
  const actifs = chiens.filter((c) => c.actif !== false);
  const soc = actifs.filter((c) => c.hebergement_autorise === "partage_autorise").length;
  const priv = actifs.filter((c) => c.hebergement_autorise === "privatif_obligatoire").length;
  const out: string[] = [];
  if (soc >= 1) out.push("journee_partage_1");
  if (soc >= 2) out.push("journee_partage_2");
  if (soc >= 3) out.push("journee_partage_3");
  if (priv >= 1) out.push("journee_privatif");
  return out;
}

export function categorieJourneePourChiens(chiens: ChienHebergement[]): string | null {
  const actifs = chiens.filter((c) => c.actif !== false);
  if (actifs.some((c) => c.hebergement_autorise === "privatif_obligatoire")) return "journee_privatif";
  const n = actifs.length;
  if (n === 1) return "journee_partage_1";
  if (n === 2) return "journee_partage_2";
  if (n === 3) return "journee_partage_3";
  return null;
}
