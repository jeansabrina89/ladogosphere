export const JOURS_PAR_CARTE = 11;
export const JOURS_PAYES = 10;

export type TypeAbonnement = { categorie: string; label: string };

export const TYPES_ABONNEMENT: TypeAbonnement[] = [
  { categorie: "journee_partage_1", label: "1 chien sociable" },
  { categorie: "journee_partage_2", label: "2 chiens ensemble" },
  { categorie: "journee_privatif", label: "1 chien box prive" },
];

export function labelAbonnement(categorie: string | null | undefined): string {
  return TYPES_ABONNEMENT.find((t) => t.categorie === categorie)?.label ?? (categorie ?? "Carte");
}
