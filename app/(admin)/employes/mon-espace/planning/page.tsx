import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import { getEmployeRhActuel } from "@/src/lib/employeActuel";
import { HEURES_JOURNEE_PLEINE } from "@/src/lib/planningUtils";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";

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
      case "cours": return { bg: "#E0F2FE", text: "#0369A1", label: "🎓 Cours" };
      case "repos": return { bg: "#F1F5F9", text: "#6B7280", label: "😴 Repos" };
      case "repos_vacances": return { bg: "#FFFBEB", text: "#D97706", label: "🏖️ RV" };
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

        <EnTete titre="📅 Mon planning" />

        {/* Navigation mois */}
        <div className="flex justify-between items-center mb-6">
          <Bouton href={`/employes/mon-espace/planning?mois=${moisPrecedent}&annee=${anneePrecedente}`} variante="secondaire">
            ← {nomsMois[moisPrecedent - 1]}
          </Bouton>
          <h2 className="text-xl font-bold" style={{ color: "#1B2B5E" }}>
            {nomsMois[moisActuel - 1]} {anneeActuelle}
          </h2>
          <Bouton href={`/employes/mon-espace/planning?mois=${moisSuivant}&annee=${anneeSuivante}`} variante="secondaire">
            {nomsMois[moisSuivant - 1]} →
          </Bouton>
        </div>

        {/* Stats du mois */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
            <p className="text-2xl font-bold" style={{ color: "#4AAEA0" }}>{joursOuvres}j</p>
            <p className="text-xs text-[rgba(27,43,94,0.5)] mt-1">Jours travaillés</p>
          </div>
          <div className="text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
            <p className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>
              {Math.round(employe.taux_travail / 100 * 5)}j/sem
            </p>
            <p className="text-xs text-[rgba(27,43,94,0.5)] mt-1">Rythme habituel</p>
          </div>
          {joursFeriesTravailles > 0 ? (
            <div className="text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
              <p className="text-2xl font-bold" style={{ color: "#D97706" }}>
                +{joursFeriesTravailles}j 🎉
              </p>
              <p className="text-xs text-[rgba(27,43,94,0.5)] mt-1">Fériés → vacances</p>
            </div>
          ) : (
            <div className="text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
              <p className="text-2xl font-bold" style={{ color: "#C9A84C" }}>
                {(joursOuvres * HEURES_JOURNEE_PLEINE).toFixed(1)}h
              </p>
              <p className="text-xs text-[rgba(27,43,94,0.5)] mt-1">Heures prévues</p>
            </div>
          )}
        </div>

        {/* Planning pas encore généré */}
        {planning?.length === 0 && (
          <div className="mb-6">
            <EtatVide
              icone="📅"
              titre={`Le planning de ${nomsMois[moisActuel - 1]} n'a pas encore été généré.`}
              message="Votre responsable le publiera vers le 15 du mois précédent."
            />
          </div>
        )}

        {/* Calendrier */}
        {planning && planning.length > 0 && (
          <div className="mb-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "24px" }}>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(j => (
                <div key={j} className="text-center text-xs font-semibold py-1" style={{ color: "rgba(27,43,94,0.45)" }}>{j}</div>
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
                      backgroundColor: couleur?.bg || (estWeekend ? "#EDE8DF" : "white"),
                      border: estAujourdhui ? "2px solid #4AAEA0" : "1px solid rgba(27,43,94,0.12)",
                    }}>
                    <span className="font-bold" style={{
                      color: estAujourdhui ? "#4AAEA0" : estWeekend ? "rgba(27,43,94,0.35)" : "#1B2B5E"
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
        <div className="mb-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
          <div className="flex flex-wrap gap-2">
            {[
              { statut: "travail", label: "Travail" },
              { statut: "repos", label: "Repos" },
              { statut: "repos_vacances", label: "Repos vacances" },
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
            <span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: "#FBE2DE", color: "#A8453A" }}>
              🚫 Indispo
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <Bouton href="/employes/mon-espace" variante="secondaire">← Retour</Bouton>
        </div>

      </div>
    </main>
  );
}