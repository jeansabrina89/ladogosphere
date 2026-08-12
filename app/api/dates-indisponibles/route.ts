import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { createClient } from "@/src/utils/supabase/server";

function getJoursFeries(annee: number): string[] {
  const feries: string[] = [];

  const fmt = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

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

  const ascension = new Date(paques);
  ascension.setDate(ascension.getDate() + 39);

  const fetesDieu = new Date(paques);
  fetesDieu.setDate(fetesDieu.getDate() + 60);

  feries.push(
    fmt(new Date(annee, 0, 1)),
    fmt(new Date(annee, 2, 19)),
    fmt(ascension),
    fmt(fetesDieu),
    fmt(new Date(annee, 7, 1)),
    fmt(new Date(annee, 7, 15)),
    fmt(new Date(annee, 10, 1)),
    fmt(new Date(annee, 11, 8)),
    fmt(new Date(annee, 11, 25)),
  );

  return feries;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const annee = parseInt(searchParams.get("annee") || String(new Date().getFullYear()));
  const nb_boxes = 12;

  const debut = `${annee}-01-01`;
  const fin = `${annee + 1}-12-31`;

  // Réservations d'essai (toutes) pour compter les jours complets.
  const { data: reservations } = await supabaseAdmin
    .from("reservations")
    .select("date_debut")
    .neq("statut", "annulee")
    .gte("date_debut", debut)
    .lte("date_debut", fin)
    .eq("type_reservation", "essai");

  const boxesParJour: Record<string, number> = {};
  reservations?.forEach((res) => {
    const date = res.date_debut as string;
    boxesParJour[date] = (boxesParJour[date] || 0) + 1;
  });

  const datesPleine = Object.entries(boxesParJour)
    .filter(([, count]) => count >= nb_boxes)
    .map(([date]) => date);

  // Fermetures unitaires éventuelles (calendrier_essais).
  const { data: fermees } = await supabaseAdmin
    .from("calendrier_essais")
    .select("date_essai, disponible, fermeture_manuelle")
    .gte("date_essai", debut)
    .lte("date_essai", fin)
    .or("disponible.eq.false,fermeture_manuelle.eq.true");

  const datesUnitaires = (fermees ?? []).map((f) => f.date_essai as string);

  // Plages de fermeture des journées d'essai (fermetures_essai), dépliées en dates.
  const { data: plages } = await supabaseAdmin
    .from("fermetures_essai")
    .select("date_debut, date_fin")
    .gte("date_fin", debut)
    .lte("date_debut", fin);

  const datesPlages: string[] = [];
  (plages ?? []).forEach((p) => {
    const d = new Date((p.date_debut as string) + "T12:00:00");
    const f = new Date((p.date_fin as string) + "T12:00:00");
    while (d <= f) {
      datesPlages.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      );
      d.setDate(d.getDate() + 1);
    }
  });

  const datesFermees = Array.from(new Set([...datesUnitaires, ...datesPlages]));

  const joursFeries = [
    ...getJoursFeries(annee),
    ...getJoursFeries(annee + 1),
  ];

  return NextResponse.json({
    jours_feries: joursFeries,
    dates_pleines: datesPleine,
    dates_fermees: datesFermees,
  });
}
