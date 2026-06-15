import { HEURES_JOURNEE_PLEINE } from "./planningUtils";

export type JourPlanningInput = { date: string; statut: string };

export type TimbrageInput = {
  date: string;
  type_absence: string | null;
  heure_debut_matin: string | null;
  heure_fin_matin: string | null;
  heure_debut_aprem: string | null;
  heure_fin_aprem: string | null;
  valide_admin: boolean | null;
};

export type JourDecompte = {
  date: string;
  statut: string | null;
  pointe: number;
  du: number;
  typeAbsence: string | null;
  valideAdmin: boolean | null;
  timbreExiste: boolean;
};

export type Decompte = {
  heuresDues: number;
  heuresFaites: number;
  solde: number;
  jours: JourDecompte[];
};

// Créditent 8,5h uniquement si le planning prévoit un jour travaillé (du > 0)
const ABSENCES_CREDITEES_SUR_TRAVAIL = ["maladie", "accident", "militaire"];

function calculerDuree(debut: string | null, fin: string | null): number {
  if (!debut || !fin) return 0;
  const [hD, mD] = debut.split(":").map(Number);
  const [hF, mF] = fin.split(":").map(Number);
  return (hF * 60 + mF - (hD * 60 + mD)) / 60;
}

export function calculerDecompteHeures({
  planning,
  timbrages,
  dateDebut,
  dateFin,
  asOf,
}: {
  planning: JourPlanningInput[];
  timbrages: TimbrageInput[];
  dateDebut: string;
  dateFin: string;
  asOf?: string;
}): Decompte {
  const limite = asOf ?? new Date().toISOString().split("T")[0];

  const planningParDate: Record<string, string> = {};
  planning.forEach(p => { planningParDate[p.date] = p.statut; });

  const timbragesParDate: Record<string, TimbrageInput> = {};
  timbrages.forEach(t => { timbragesParDate[t.date] = t; });

  const finEffective = dateFin < limite ? dateFin : limite;

  let heuresDues = 0;
  let heuresFaites = 0;
  const jours: JourDecompte[] = [];

  const cur = new Date(dateDebut + "T12:00:00");
  const fin = new Date(finEffective + "T12:00:00");

  while (cur <= fin) {
    const dateStr = [
      cur.getFullYear(),
      String(cur.getMonth() + 1).padStart(2, "0"),
      String(cur.getDate()).padStart(2, "0"),
    ].join("-");

    const statut = planningParDate[dateStr] ?? null;
    const t = timbragesParDate[dateStr] ?? null;

    const du = (statut === "travail" || statut === "ferie_travaille")
      ? HEURES_JOURNEE_PLEINE
      : 0;

    let fait = 0;
    if (t && !t.type_absence) {
      fait = calculerDuree(t.heure_debut_matin, t.heure_fin_matin)
        + calculerDuree(t.heure_debut_aprem, t.heure_fin_aprem);
    } else if (t && du > 0 && t.type_absence !== null
      && ABSENCES_CREDITEES_SUR_TRAVAIL.includes(t.type_absence)) {
      fait = HEURES_JOURNEE_PLEINE;
    }

    heuresDues += du;
    heuresFaites += fait;

    jours.push({
      date: dateStr,
      statut,
      pointe: fait,
      du,
      typeAbsence: t?.type_absence ?? null,
      valideAdmin: t ? (t.valide_admin ?? null) : null,
      timbreExiste: t !== null,
    });

    cur.setDate(cur.getDate() + 1);
  }

  return { heuresDues, heuresFaites, solde: heuresFaites - heuresDues, jours };
}
