import Link from "next/link";
import { createSupabaseServerClient } from "../../../src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "../../../src/utils/supabase/server";
import { supabaseAdmin } from "../../../src/lib/supabase-admin";
import { calculerDecompteHeures } from "../../../src/lib/decompteHeures";

const NOMS_MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const NOMS_JOURS_COURT = ["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"];

function labelStatut(statut: string | null): string {
  switch (statut) {
    case "travail":         return "Travail";
    case "ferie_travaille": return "Ferie+";
    case "repos":           return "Repos";
    case "repos_vacances":  return "RV";
    case "vacances":        return "Vacances";
    case "absent":          return "Absent";
    case "maladie":         return "Maladie";
    case "accident":        return "Accident";
    case "militaire":       return "Militaire";
    case "heures_sup":      return "H.sup";
    case "autre":           return "Autre";
    default:                return "—";
  }
}

function bgStatut(statut: string | null): string {
  switch (statut) {
    case "travail":         return "#E8F5F4";
    case "ferie_travaille": return "#FEF3C7";
    case "repos":           return "#F1F5F9";
    case "repos_vacances":  return "#FFFBEB";
    case "vacances":        return "#FEF9C3";
    case "absent":
    case "maladie":
    case "accident":        return "#FEE2E2";
    case "militaire":       return "#EDE9FE";
    case "heures_sup":      return "#DBEAFE";
    default:                return "#F1F5F9";
  }
}

function textStatut(statut: string | null): string {
  switch (statut) {
    case "travail":         return "#4AAEA0";
    case "ferie_travaille": return "#D97706";
    case "repos":           return "#6B7280";
    case "repos_vacances":  return "#D97706";
    case "vacances":        return "#CA8A04";
    case "absent":
    case "maladie":
    case "accident":        return "#DC2626";
    case "militaire":       return "#7C3AED";
    case "heures_sup":      return "#2563EB";
    default:                return "#9CA3AF";
  }
}

function labelAbsence(type: string | null): string {
  switch (type) {
    case "maladie":   return "Maladie";
    case "accident":  return "Accident";
    case "militaire": return "Militaire";
    case "vacances":  return "Vacances";
    case "autre":     return "Autre";
    default:          return type ?? "";
  }
}

export default async function TimbrageAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ employe?: string; mois?: string }>;
}) {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const { data: employes } = await supabaseAdmin
    .from("employes_rh")
    .select("id, prenom, nom, taux_travail")
    .eq("actif", true)
    .order("nom");

  if (!employes || employes.length === 0) {
    return (
      <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
        <div className="max-w-4xl mx-auto bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-gray-500">Aucun employé actif.</p>
          <Link href="/employes" className="mt-4 inline-block px-4 py-2 rounded-xl font-semibold text-sm"
            style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>← Équipe</Link>
        </div>
      </main>
    );
  }

  const params = await searchParams;
  const maintenant = new Date();
  const aujourd_hui = [
    maintenant.getFullYear(),
    String(maintenant.getMonth() + 1).padStart(2, "0"),
    String(maintenant.getDate()).padStart(2, "0"),
  ].join("-");

  const moisParam = params.mois
    || `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, "0")}`;
  const [anneeStr, moisStr] = moisParam.split("-");
  const annee = parseInt(anneeStr);
  const mois = parseInt(moisStr);

  const emp = employes.find((e: any) => e.id === params.employe) ?? employes[0];

  const moisPad = String(mois).padStart(2, "0");
  const dateDebutMois = `${annee}-${moisPad}-01`;
  const dateFinMois = new Date(annee, mois, 0).toISOString().split("T")[0];
  const dateDebutAnnee = `${annee}-01-01`;

  // Charge planning + timbrage du MOIS et de l'ANNÉE en parallèle
  const [
    { data: planningMoisData },
    { data: timbragesMoisData },
    { data: planningAnneeData },
    { data: timbragesAnneeData },
    { data: vacancesAcceptees },
    { data: feriesTravailles },
  ] = await Promise.all([
    supabaseAdmin.from("planning_employes")
      .select("date, statut").eq("employe_id", emp.id)
      .gte("date", dateDebutMois).lte("date", dateFinMois),
    supabaseAdmin.from("timbrage")
      .select("date, type_absence, heure_debut_matin, heure_fin_matin, heure_debut_aprem, heure_fin_aprem, valide_admin")
      .eq("employe_id", emp.id).gte("date", dateDebutMois).lte("date", dateFinMois),
    supabaseAdmin.from("planning_employes")
      .select("date, statut").eq("employe_id", emp.id)
      .gte("date", dateDebutAnnee).lte("date", dateFinMois),
    supabaseAdmin.from("timbrage")
      .select("date, type_absence, heure_debut_matin, heure_fin_matin, heure_debut_aprem, heure_fin_aprem, valide_admin")
      .eq("employe_id", emp.id).gte("date", dateDebutAnnee).lte("date", dateFinMois),
    supabaseAdmin.from("demandes_vacances")
      .select("nb_jours").eq("employe_id", emp.id).eq("statut", "acceptee")
      .gte("date_debut", `${annee}-01-01`).lte("date_debut", `${annee}-12-31`),
    supabaseAdmin.from("planning_employes")
      .select("id").eq("employe_id", emp.id).eq("statut", "ferie_travaille")
      .gte("date", `${annee}-01-01`).lte("date", `${annee}-12-31`),
  ]);

  const decompteMois = calculerDecompteHeures({
    planning: planningMoisData ?? [],
    timbrages: timbragesMoisData ?? [],
    dateDebut: dateDebutMois,
    dateFin: dateFinMois,
    asOf: aujourd_hui,
  });

  const decompteAnnee = calculerDecompteHeures({
    planning: planningAnneeData ?? [],
    timbrages: timbragesAnneeData ?? [],
    dateDebut: dateDebutAnnee,
    dateFin: dateFinMois,
    asOf: aujourd_hui,
  });

  const joursVacancesTotal = 20 * emp.taux_travail / 100;
  const bonusFeriers = feriesTravailles?.length ?? 0;
  const joursVacancesPris = vacancesAcceptees?.reduce(
    (acc: number, d: any) => acc + (d.nb_jours ?? 0), 0
  ) ?? 0;
  const joursVacancesRestants = joursVacancesTotal + bonusFeriers - joursVacancesPris;

  // Navigation mois
  const moisPrecNum = mois === 1 ? 12 : mois - 1;
  const anneePrecNum = mois === 1 ? annee - 1 : annee;
  const moisSuivNum = mois === 12 ? 1 : mois + 1;
  const anneeSuivNum = mois === 12 ? annee + 1 : annee;
  const moisPrecedent = `${anneePrecNum}-${String(moisPrecNum).padStart(2, "0")}`;
  const moisSuivant = `${anneeSuivNum}-${String(moisSuivNum).padStart(2, "0")}`;

  // Index des jours du décompte pour accès rapide
  const joursParDate: Record<string, typeof decompteMois.jours[0]> = {};
  decompteMois.jours.forEach(j => { joursParDate[j.date] = j; });

  const nbJoursMois = new Date(annee, mois, 0).getDate();
  const nonValides = decompteMois.jours.filter(j => j.valideAdmin === false).length;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: "#1B2B5E" }}>⏱️ Timbrage équipe</h1>
            <p className="text-gray-500 mt-1">Consultation — lecture seule</p>
          </div>
          <Link href="/employes" className="px-4 py-2 rounded-xl font-semibold text-sm"
            style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>← Équipe</Link>
        </div>

        {/* Sélecteur */}
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <form method="GET" className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold mb-1 text-gray-500">Employé</label>
              <select name="employe" defaultValue={emp.id}
                className="border border-gray-200 rounded-xl p-2 text-sm min-w-48">
                {employes.map((e: any) => (
                  <option key={e.id} value={e.id}>
                    {e.prenom} {e.nom} — {e.taux_travail}%
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 text-gray-500">Mois</label>
              <input type="month" name="mois" defaultValue={moisParam}
                className="border border-gray-200 rounded-xl p-2 text-sm" />
            </div>
            <button type="submit" className="px-4 py-2 rounded-xl font-semibold text-white text-sm"
              style={{ backgroundColor: "#4AAEA0" }}>Afficher</button>
          </form>
        </div>

        {/* Navigation mois */}
        <div className="flex justify-between items-center mb-4">
          <a href={`/employes/timbrage?employe=${emp.id}&mois=${moisPrecedent}`}
            className="px-4 py-2 rounded-xl font-semibold text-sm"
            style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
            ← {NOMS_MOIS[moisPrecNum - 1]}
          </a>
          <h2 className="text-xl font-bold" style={{ color: "#1B2B5E" }}>
            {NOMS_MOIS[mois - 1]} {annee} — {emp.prenom} {emp.nom}
          </h2>
          <a href={`/employes/timbrage?employe=${emp.id}&mois=${moisSuivant}`}
            className="px-4 py-2 rounded-xl font-semibold text-sm"
            style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
            {NOMS_MOIS[moisSuivNum - 1]} →
          </a>
        </div>

        {/* Totaux du mois */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>
              {decompteMois.heuresFaites.toFixed(1)}h
            </p>
            <p className="text-xs text-gray-500 mt-1">Faites ce mois</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: "#6B7280" }}>
              {decompteMois.heuresDues.toFixed(1)}h
            </p>
            <p className="text-xs text-gray-500 mt-1">Dues ce mois</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold"
              style={{ color: decompteMois.solde >= 0 ? "#4AAEA0" : "#D97706" }}>
              {decompteMois.solde >= 0 ? "+" : ""}{decompteMois.solde.toFixed(1)}h
            </p>
            <p className="text-xs text-gray-500 mt-1">Solde du mois</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            {nonValides > 0 ? (
              <>
                <p className="text-2xl font-bold text-orange-500">{nonValides}</p>
                <p className="text-xs text-gray-500 mt-1">⚠ Non validé(s)</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-green-600">✓</p>
                <p className="text-xs text-gray-500 mt-1">Tout validé</p>
              </>
            )}
          </div>
        </div>

        {/* Cumul année + solde vacances */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>
              {decompteAnnee.heuresFaites.toFixed(1)}h
            </p>
            <p className="text-xs text-gray-500 mt-1">Faites {annee}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: "#6B7280" }}>
              {decompteAnnee.heuresDues.toFixed(1)}h
            </p>
            <p className="text-xs text-gray-500 mt-1">Dues {annee}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold"
              style={{ color: decompteAnnee.solde >= 0 ? "#4AAEA0" : "#D97706" }}>
              {decompteAnnee.solde >= 0 ? "+" : ""}{decompteAnnee.solde.toFixed(1)}h
            </p>
            <p className="text-xs text-gray-500 mt-1">Solde {annee}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: "#C9A84C" }}>
              {joursVacancesRestants.toFixed(1)}j
              {bonusFeriers > 0 && (
                <span className="text-sm text-orange-500 ml-1">+{bonusFeriers}🎉</span>
              )}
            </p>
            <p className="text-xs text-gray-500 mt-1">Vacances rest. {annee}</p>
          </div>
        </div>

        {/* Tableau jour par jour */}
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr style={{ backgroundColor: "#1B2B5E" }}>
                <th className="px-3 py-2 text-left text-xs font-semibold text-white">Jour</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-white">Statut</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-white">Dû</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-white">Fait</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-white">Solde</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-white">Absence</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-white">Valid.</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: nbJoursMois }, (_, i) => {
                const jour = i + 1;
                const dateStr = `${annee}-${moisPad}-${String(jour).padStart(2, "0")}`;
                const jourSemaine = new Date(dateStr + "T12:00:00").getDay();
                const estWeekend = jourSemaine === 0 || jourSemaine === 6;
                const estFutur = dateStr > aujourd_hui;
                const j = joursParDate[dateStr] ?? null;
                const soldeJour = j ? j.pointe - j.du : null;

                let bgRow = "white";
                if (estFutur) bgRow = "#FAFAFA";
                else if (estWeekend) bgRow = "#F1F5F9";

                return (
                  <tr key={dateStr}
                    style={{
                      backgroundColor: bgRow,
                      borderBottom: "1px solid #E2E8F0",
                      opacity: estFutur ? 0.45 : 1,
                    }}>
                    {/* Jour */}
                    <td className="px-3 py-1.5 text-sm whitespace-nowrap">
                      <span className="font-bold" style={{ color: estWeekend ? "#94A3B8" : "#1B2B5E" }}>
                        {jour}
                      </span>
                      <span className="ml-1 text-xs text-gray-400">
                        {NOMS_JOURS_COURT[jourSemaine]}
                      </span>
                    </td>

                    {/* Statut planning */}
                    <td className="px-3 py-1.5">
                      {j?.statut ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{
                            backgroundColor: bgStatut(j.statut),
                            color: textStatut(j.statut),
                          }}>
                          {labelStatut(j.statut)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>

                    {/* Dû */}
                    <td className="px-3 py-1.5 text-right text-sm">
                      {j && j.du > 0
                        ? <span className="font-semibold text-gray-600">{j.du.toFixed(1)}h</span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>

                    {/* Fait */}
                    <td className="px-3 py-1.5 text-right text-sm">
                      {j?.timbreExiste && j.pointe > 0 ? (
                        <span className="font-semibold" style={{ color: "#1B2B5E" }}>
                          {j.pointe.toFixed(1)}h
                        </span>
                      ) : j?.timbreExiste && j.typeAbsence !== null ? (
                        <span className="text-gray-400 text-xs">—</span>
                      ) : !j?.timbreExiste && j?.du && j.du > 0 ? (
                        <span className="text-orange-400 text-xs font-semibold">manquant</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Solde jour */}
                    <td className="px-3 py-1.5 text-right text-sm">
                      {j && j.du > 0 && j.timbreExiste ? (
                        <span className="font-bold"
                          style={{ color: (soldeJour ?? 0) >= 0 ? "#4AAEA0" : "#D97706" }}>
                          {(soldeJour ?? 0) >= 0 ? "+" : ""}{(soldeJour ?? 0).toFixed(1)}h
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Type absence */}
                    <td className="px-3 py-1.5">
                      {j?.typeAbsence && (
                        <span className="px-2 py-0.5 rounded-full text-xs"
                          style={{ backgroundColor: "#FFF7ED", color: "#C2410C" }}>
                          {labelAbsence(j.typeAbsence)}
                        </span>
                      )}
                    </td>

                    {/* Validation */}
                    <td className="px-3 py-1.5 text-center">
                      {j?.valideAdmin === false ? (
                        <span className="text-orange-400 text-sm font-bold" title="Non validé par l'admin">⚠</span>
                      ) : j?.valideAdmin === true ? (
                        <span className="text-green-500 text-sm" title="Validé">✓</span>
                      ) : (
                        <span className="text-gray-200">·</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400 mt-3 text-right">
          ⚠ = timbrage non validé par l'admin · Lecture seule
        </p>

      </div>
    </main>
  );
}
