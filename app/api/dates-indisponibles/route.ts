import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../src/lib/supabase";

function getJoursFeries(annee: number): string[] {
  const feries: string[] = [];

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  // Calcul de Pâques (algorithme de Butcher)
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  const paques = new Date(annee, mois, jour);

  // Ascension = Pâques + 39 jours
  const ascension = new Date(paques);
  ascension.setDate(ascension.getDate() + 39);

  // Fête-Dieu = Pâques + 60 jours
  const fetesDieu = new Date(paques);
  fetesDieu.setDate(fetesDieu.getDate() + 60);

  feries.push(
    fmt(new Date(annee, 0, 1)),   // Nouvel An
    fmt(new Date(annee, 2, 19)),  // St-Joseph
    fmt(ascension),               // Ascension
    fmt(fetesDieu),               // Fête-Dieu
    fmt(new Date(annee, 7, 1)),   // Fête nationale
    fmt(new Date(annee, 7, 15)),  // Assomption
    fmt(new Date(annee, 10, 1)),  // Toussaint
    fmt(new Date(annee, 11, 8)),  // Immaculée Conception
    fmt(new Date(annee, 11, 25)), // Noël
  );

  return feries;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const annee = parseInt(searchParams.get("annee") || String(new Date().getFullYear()));
  const nb_boxes = 12;

  // Récupérer toutes les réservations de type essai pour l'année
  const debut = `${annee}-01-01`;
  const fin = `${annee}-12-31`;

  const { data: reservations } = await supabase
    .from("reservations")
    .select("date_debut, date_fin, box_id")
    .neq("statut", "annulee")
    .gte("date_debut", debut)
    .lte("date_debut", fin)
    .eq("type_reservation", "essai");

  // Compter les boxes utilisées par jour
  const boxesParJour: Record<string, number> = {};
  reservations?.forEach(res => {
    const date = res.date_debut;
    boxesParJour[date] = (boxesParJour[date] || 0) + 1;
  });

  // Dates pleines = nb_boxes réservations
  const datesPleine = Object.entries(boxesParJour)
    .filter(([_, count]) => count >= nb_boxes)
    .map(([date]) => date);

  const joursFeries = [
    ...getJoursFeries(annee),
    ...getJoursFeries(annee + 1),
  ];

  return NextResponse.json({
    jours_feries: joursFeries,
    dates_pleines: datesPleine,
  });
}