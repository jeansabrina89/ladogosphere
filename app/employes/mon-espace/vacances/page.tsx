import { createSupabaseServerClient } from "../../../../src/lib/supabase-server";
import { redirect } from "next/navigation";
import { supabase } from "../../../../src/lib/supabase";
import FormDemandeVacances from "./FormDemandeVacances";

export default async function VacancesPage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role, email").eq("id", user.id).single();
  if (!["admin", "employe"].includes(profile?.role)) redirect("/");

  const { data: employe } = await supabase
    .from("employes_rh").select("*").eq("email", profile?.email ?? "").single();
  if (!employe) redirect("/employes/mon-espace");

  const { data: demandes } = await supabase
    .from("demandes_vacances")
    .select("*")
    .eq("employe_id", employe.id)
    .order("date_debut", { ascending: false });

  const { data: feriesTravailles } = await supabase
    .from("planning_employes")
    .select("id")
    .eq("employe_id", employe.id)
    .eq("statut", "ferie_travaille");

  const bonusFeriers = feriesTravailles?.length ?? 0;
  const joursVacancesTotal = 20 * employe.taux_travail / 100;
  const joursVacancesPris = demandes
    ?.filter((d: any) => d.statut === "acceptee")
    .reduce((acc: number, d: any) => acc + d.nb_jours, 0) ?? 0;
  const joursVacancesRestants = joursVacancesTotal + bonusFeriers - joursVacancesPris;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">

        <h1 className="text-3xl font-bold mb-2" style={{ color: "#1B2B5E" }}>
          🏖️ Mes vacances
        </h1>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: "#4AAEA0" }}>
              {joursVacancesTotal}j
            </p>
            <p className="text-xs text-gray-500 mt-1">Droit annuel</p>
          </div>
          {bonusFeriers > 0 && (
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <p className="text-2xl font-bold" style={{ color: "#D97706" }}>
                +{bonusFeriers}j 🎉
              </p>
              <p className="text-xs text-gray-500 mt-1">Fériés travaillés</p>
            </div>
          )}
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: "#E8847A" }}>
              {joursVacancesPris}j
            </p>
            <p className="text-xs text-gray-500 mt-1">Pris</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: "#C9A84C" }}>
              {joursVacancesRestants}j
            </p>
            <p className="text-xs text-gray-500 mt-1">Restants</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>
            ➕ Nouvelle demande
          </h2>
          <FormDemandeVacances
            employe_id={employe.id}
            jours_restants={joursVacancesRestants}
            taux_travail={employe.taux_travail}
          />
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>
            📋 Mes demandes
          </h2>
          <div className="space-y-3">
            {demandes?.length === 0 && (
              <p className="text-gray-400 text-sm">Aucune demande.</p>
            )}
            {demandes?.map((d: any) => (
              <div key={d.id} className="border rounded-xl p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: "#1B2B5E" }}>
                      {new Date(d.date_debut + "T12:00:00").toLocaleDateString("fr-CH")} →{" "}
                      {new Date(d.date_fin + "T12:00:00").toLocaleDateString("fr-CH")}
                    </p>
                    <p className="text-xs text-gray-500">{d.nb_jours}j</p>
                    {d.note_employe && (
                      <p className="text-xs text-gray-400 mt-1">"{d.note_employe}"</p>
                    )}
                    {d.note_admin && (
                      <p className="text-xs text-blue-500 mt-1">Admin : "{d.note_admin}"</p>
                    )}
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    d.statut === "acceptee" ? "bg-green-100 text-green-700" :
                    d.statut === "refusee" ? "bg-red-100 text-red-700" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>
                    {d.statut === "acceptee" ? "✅ Acceptée" :
                     d.statut === "refusee" ? "❌ Refusée" : "⏳ En attente"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}