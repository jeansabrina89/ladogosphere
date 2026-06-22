import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import { getEmployeRhActuel } from "@/src/lib/employeActuel";
import FormDemandeVacances from "./FormDemandeVacances";
import { formatDateFR } from "@/src/lib/dates";
import EnTete from "@/app/components/ui/EnTete";
import BadgeStatut from "@/app/components/ui/BadgeStatut";

export default async function VacancesPage() {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role, email").eq("id", user.id).single();
  if (!["admin", "employe"].includes(profile?.role)) redirect("/");

  const employe = await getEmployeRhActuel(supabase, user.id, profile?.email);
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

        <EnTete titre="🏖️ Mes vacances" />

        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
            <p className="text-2xl font-bold" style={{ color: "#4AAEA0" }}>
              {joursVacancesTotal}j
            </p>
            <p className="text-xs text-[rgba(27,43,94,0.5)] mt-1">Droit annuel</p>
          </div>
          {bonusFeriers > 0 && (
            <div className="text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
              <p className="text-2xl font-bold" style={{ color: "#D97706" }}>
                +{bonusFeriers}j 🎉
              </p>
              <p className="text-xs text-[rgba(27,43,94,0.5)] mt-1">Fériés travaillés</p>
            </div>
          )}
          <div className="text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
            <p className="text-2xl font-bold" style={{ color: "#E8847A" }}>
              {joursVacancesPris}j
            </p>
            <p className="text-xs text-[rgba(27,43,94,0.5)] mt-1">Pris</p>
          </div>
          <div className="text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
            <p className="text-2xl font-bold" style={{ color: "#C9A84C" }}>
              {joursVacancesRestants}j
            </p>
            <p className="text-xs text-[rgba(27,43,94,0.5)] mt-1">Restants</p>
          </div>
        </div>

        <div className="mb-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "24px" }}>
          <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>
            ➕ Nouvelle demande
          </h2>
          <FormDemandeVacances
            employe_id={employe.id}
            jours_restants={joursVacancesRestants}
            taux_travail={employe.taux_travail}
          />
        </div>

        <div style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "24px" }}>
          <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>
            📋 Mes demandes
          </h2>
          <div className="space-y-3">
            {demandes?.length === 0 && (
              <p className="text-[rgba(27,43,94,0.45)] text-sm">Aucune demande.</p>
            )}
            {demandes?.map((d: any) => (
              <div key={d.id} className="rounded-xl p-4" style={{ border: "1px solid rgba(27,43,94,0.12)" }}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: "#1B2B5E" }}>
                      {formatDateFR(d.date_debut)} →{" "}
                      {formatDateFR(d.date_fin)}
                    </p>
                    <p className="text-xs text-[rgba(27,43,94,0.5)]">{d.nb_jours}j</p>
                    {d.note_employe && (
                      <p className="text-xs text-[rgba(27,43,94,0.45)] mt-1">"{d.note_employe}"</p>
                    )}
                    {d.note_admin && (
                      <p className="text-xs text-[#1F6E5B] mt-1">Admin : "{d.note_admin}"</p>
                    )}
                  </div>
                  <BadgeStatut statut={d.statut} />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}