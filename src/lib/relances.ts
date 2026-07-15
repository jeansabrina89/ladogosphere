// Niveau de relance de paiement du pour un sejour, base sur sa date de fin.
// 0 = aucune ; 1 = relance (14 j apres) ; 2 = 1er rappel (1 mois) ; 3 = 2eme rappel (2 mois).
export function niveauRelanceDu(
  dateFin: string | null,
  aujourdhui: Date = new Date()
): number {
  if (!dateFin) return 0;
  const fin = new Date(dateFin + "T00:00:00");
  const ajoutJours = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  const ajoutMois = (d: Date, n: number) => {
    const x = new Date(d);
    x.setMonth(x.getMonth() + n);
    return x;
  };
  const t = new Date(aujourdhui.toISOString().split("T")[0] + "T00:00:00");
  if (t >= ajoutMois(fin, 2)) return 3;
  if (t >= ajoutMois(fin, 1)) return 2;
  if (t >= ajoutJours(fin, 14)) return 1;
  return 0;
}

export const LABEL_RELANCE: Record<number, string> = {
  1: "Relance",
  2: "1er rappel",
  3: "2ème rappel",
};
