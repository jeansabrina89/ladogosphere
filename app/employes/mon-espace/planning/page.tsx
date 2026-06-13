import { createSupabaseServerClient } from "../../../../src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "../../../../src/utils/supabase/server";
import { getEmployeRhActuel } from "../../../../src/lib/employeActuel";

export default async function MonPlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string; annee?: string }>;
}) {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role, email").eq("id", user.id).single();
  if (!profile || !["admin", "employe"].includes(profile.role)) redirect("/");

  const employe = await getEmployeRhActuel(supabase, user.id, profile?.email);
  if (!employe) redirect("/employes/mon-espace");

  const params = await searchParams;
  const aujourd_hui = new Date();
  const moisActuel = parseInt(params.mois || String(aujourd_hui.getMonth() + 1));
  const anneeActuelle = parseInt(params.annee || String(aujourd_hui.getFullYear()));

  const moisSuivant = moisActuel === 12 ? 1 : moisActuel + 1;
  const anneeSuivante = moisActuel === 12 ? anneeActuelle + 1 : anneeActuelle;
  const moisPrecedent = moisActuel === 1 ? 12 : moisActuel - 1;
  const anneePrecedente = moisActuel === 1 ? anneeActuelle - 1 : anneeActuelle;

  const dateDebutMois = `${anneeActuelle}-${String(moisActuel).padStart(2, "0")}-01`;
  const dateFinMois = new Date(anneeActuelle, moisActuel, 0).toISOString().split("T")[0];

  const { data: planning } = await supabase
    .from("planning_employes")
    .select("*")
    .eq("employe_id", employe.id)
    .gte("date", dateDebutMois)
    .lte("date", dateFinMois)
    .order("date", { ascending: true });

  const { data: indisponibilites } = await supabase
    .from("indisponibilites")
    .select("*")
    .eq("employe_id", employe.id)
    .gte("date", dateDebutMois)
    .lte("date", dateFinMois);

  const nomsMois = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

  const joursParMois = new Date(anneeActuelle, moisActuel, 0).getDate();

  const couleurStatut = (statut: string) => {
    switch (statut) {
      case "travail": return { bg: "#E8F5F4", text: "#4AAEA0", label: "✅ Travail" };
      case "repos": return { bg: "#F1F5F9", text: "#6B7280", label: "😴 Repos" };
      case "vacances": return { bg: "#FEF9C3", text: "#CA8A04", label: "🏖️ Vacances" };
      case "maladie": return { bg: "#FEE2E2", text: "#DC2626", label: "🤒 Maladie" };
      case "accident": return { bg: "#FEE2E2", text: "#DC2626", label: "🤕 Accident" };
      case "militaire": return { bg: "#EDE9FE", text: "#7C3AED", label: "🎖️ Militaire" };
      case "ferie": return { bg: "#FEF3C7", text: "#D97706", label: "🎉 Férié" };
      case "ferie_travaille": return { bg: "#FEF3C7", text: "#D97706", label: "🎉 Férié+1j" };
      case "absent": return { bg: "#FEE2E2", text: "#DC2626", label: "🚫 Absent" };
      case "heures_sup": return { bg: "#DBEAFE", text: "#2563EB", label: "⏱️ H.sup" };
      case "autre": return { bg: "#F1F5F9", text: "#6B7280", label: "📋 Autre" };
      default: return { bg: "#F1F5F9", text: "#9CA3AF", label: "—" };
    }
  };

  const planningParDate: Record<string, any> = {};
  planning?.forEach(p => { planningParDate[p.date] = p; });

  const indispoParDate: Record<string, any> = {};
  indisponibilites?.forEach(i => { indispoParDate[i.date] = i; });

  const joursOuvres = planning?.filter(p => p.statut === "travail" || p.statut === "ferie_travaille").length ?? 0;
  const joursFeriesTravailles = planning?.filter(p => p.statut === "ferie_travaille").length ?? 0;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">

        <h1 className="text-3xl font-bold mb-2" style={{ color: "#1B2B5E" }}>
          📅 Mon planning
        </h1>

        {/* Navigation mois */}
        <div className="flex justify-between items-center mb-6">
          <a href={`/employes/mon-espace/planning?mois=${moisPrecedent}&annee=${anneePrecedente}`}
            className="px-4 py-2 rounded-xl font-semibold text-sm"
            style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
            ← {nomsMois[moisPrecedent - 1]}
          </a>
          <h2 className="text-xl font-bold" style={{ color: "#1B2B5E" }}>
            {nomsMois[moisActuel - 1]} {anneeActuelle}
          </h2>
          <a href={`/employes/mon-espace/planning?mois=${moisSuivant}&annee=${anneeSuivante}`}
            className="px-4 py-2 rounded-xl font-semibold text-sm"
            style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
            {nomsMois[moisSuivant - 1]} →
          </a>
        </div>

        {/* Stats du mois */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: "#4AAEA0" }}>{joursOuvres}j</p>
            <p className="text-xs text-gray-500 mt-1">Jours travaillés</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>
              {Math.round(employe.taux_travail / 100 * 5)}j/sem
            </p>
            <p className="text-xs text-gray-500 mt-1">Rythme habituel</p>
          </div>
          {joursFeriesTravailles > 0 ? (
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <p className="text-2xl font-bold" style={{ color: "#D97706" }}>
                +{joursFeriesTravailles}j 🎉
              </p>
              <p className="text-xs text-gray-500 mt-1">Fériés → vacances</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <p className="text-2xl font-bold" style={{ color: "#C9A84C" }}>
                {(joursOuvres * 8.4).toFixed(1)}h
              </p>
              <p className="text-xs text-gray-500 mt-1">Heures prévues</p>
            </div>
          )}
        </div>

        {/* Planning pas encore généré */}
        {planning?.length === 0 && (
          <div className="bg-white rounded-xl p-8 shadow-sm text-center mb-6">
            <p className="text-4xl mb-3">📅</p>
            <p className="font-semibold text-gray-500">
              Le planning de {nomsMois[moisActuel - 1]} n'a pas encore été généré.
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Votre responsable le publiera vers le 15 du mois précédent.
            </p>
          </div>
        )}

        {/* Calendrier */}
        {planning && planning.length > 0 && (
          <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
            <div className="grid grid-cols-7 gap-1 mb-2">
              {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(j => (
                <div key={j} className="text-center text-xs font-semibold text-gray-400 py-1">{j}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: (new Date(anneeActuelle, moisActuel - 1, 1).getDay() + 6) % 7 }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: joursParMois }).map((_, i) => {
                const jour = i + 1;
                const dateStr = `${anneeActuelle}-${String(moisActuel).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
                const jourSemaine = new Date(dateStr + "T12:00:00").getDay();
                const estWeekend = jourSemaine === 0 || jourSemaine === 6;
                const p = planningParDate[dateStr];
                const indispo = indispoParDate[dateStr];
                const estAujourdhui = dateStr === aujourd_hui.toISOString().split("T")[0];
                const couleur = p ? couleurStatut(p.statut) : null;

                return (
                  <div key={dateStr}
                    className="rounded-lg p-1.5 text-center text-xs min-h-12 flex flex-col items-center justify-center"
                    style={{
                      backgroundColor: couleur?.bg || (estWeekend ? "#F8FAFC" : "white"),
                      border: estAujourdhui ? "2px solid #4AAEA0" : "1px solid #E2E8F0",
                    }}>
                    <span className="font-bold" style={{
                      color: estAujourdhui ? "#4AAEA0" : estWeekend ? "#CBD5E1" : "#1B2B5E"
                    }}>
                      {jour}
                    </span>
                    {p && (
                      <span className="text-xs mt-0.5" style={{ color: couleur?.text, fontSize: "9px" }}>
                        {couleur?.label.split(" ")[0]}
                      </span>
                    )}
                    {indispo && !p && (
                      <span style={{ fontSize: "9px", color: "#E8847A" }}>🚫</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Légende */}
        <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
          <div className="flex flex-wrap gap-2">
            {[
              { statut: "travail", label: "Travail" },
              { statut: "repos", label: "Repos" },
              { statut: "vacances", label: "Vacances" },
              { statut: "maladie", label: "Maladie" },
              { statut: "ferie_travaille", label: "Férié+1j" },
              { statut: "heures_sup", label: "Déd. H.sup" },
              { statut: "absent", label: "Absent" },
            ].map(({ statut, label }) => {
              const c = couleurStatut(statut);
              return (
                <span key={statut} className="px-2 py-1 rounded-full text-xs font-semibold"
                  style={{ backgroundColor: c.bg, color: c.text }}>
                  {c.label.split(" ")[0]} {label}
                </span>
              );
            })}
            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-400">
              🚫 Indispo
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <a href="/employes/mon-espace"
            className="px-4 py-2 rounded-xl font-semibold text-sm"
            style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
            ← Retour
          </a>
        </div>

      </div>
    </main>
  );
}