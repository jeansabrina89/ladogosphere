export type FiltrePeriode = "toutes" | "futures" | "en_cours" | "passees" | "annulees";

export const ONGLETS_PERIODE: { val: FiltrePeriode; label: string }[] = [
  { val: "toutes", label: "Toutes" },
  { val: "futures", label: "📅 À venir" },
  { val: "en_cours", label: "🟢 En cours" },
  { val: "passees", label: "📁 Passées" },
  { val: "annulees", label: "❌ Annulées" },
];

export function aujourdhuiISO(): string {
  return new Date().toISOString().split("T")[0];
}

// Applique le filtre de période + le tri à une requête Supabase et la retourne.
export function appliquerPeriodeEtTri(query: any, filtre: string, aujourd_hui: string) {
  const ANNULES = "(annulee,refusee)";
  switch (filtre) {
    case "futures":
      return query
        .not("statut", "in", ANNULES)
        .gt("date_debut", aujourd_hui)
        .order("date_debut", { ascending: true })
        .order("heure_arrivee", { ascending: true, nullsFirst: false });
    case "en_cours":
      return query
        .not("statut", "in", ANNULES)
        .lte("date_debut", aujourd_hui)
        .gte("date_fin", aujourd_hui)
        .order("date_debut", { ascending: true })
        .order("heure_arrivee", { ascending: true, nullsFirst: false });
    case "passees":
      return query
        .not("statut", "in", ANNULES)
        .lt("date_fin", aujourd_hui)
        .order("date_fin", { ascending: false })
        .order("heure_arrivee", { ascending: false, nullsFirst: false });
    case "annulees":
      return query
        .in("statut", ["annulee", "refusee"])
        .order("date_debut", { ascending: false });
    case "toutes":
    default:
      return query.order("date_debut", { ascending: false });
  }
}
