import Link from "next/link";
import { createSupabaseServerClient } from "../../src/lib/supabase-server";
import { redirect } from "next/navigation";
import { supabase } from "../../src/lib/supabase";

export default async function EmployesPage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const { data: employes } = await supabase
    .from("profiles")
    .select("*")
    .in("role", ["admin", "employe"])
    .order("created_at");

  const { data: employesRh } = await supabase
    .from("employes_rh")
    .select("*")
    .eq("actif", true);

  // Demandes en attente
  const { data: demandesEnAttente } = await supabase
    .from("demandes_vacances")
    .select("id")
    .eq("statut", "en_attente");

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">

        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-4xl font-bold" style={{ color: "#1B2B5E" }}>👥 Équipe</h1>
            <p className="text-gray-500 mt-1">Gestion des comptes et module RH</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Link href="/employes/nouveau"
              className="px-4 py-2 rounded-xl font-semibold text-white text-sm"
              style={{ backgroundColor: "#4AAEA0" }}>
              ➕ Ajouter un employé
            </Link>
            <Link href="/employes/vacances"
              className="px-4 py-2 rounded-xl font-semibold text-white text-sm relative"
              style={{ backgroundColor: "#C9A84C" }}>
              🏖️ Vacances
              {demandesEnAttente && demandesEnAttente.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {demandesEnAttente.length}
                </span>
              )}
            </Link>
            <Link href="/employes/planning"
              className="px-4 py-2 rounded-xl font-semibold text-white text-sm"
              style={{ backgroundColor: "#1B2B5E" }}>
              📅 Planning
            </Link>
          </div>
        </div>

        <div className="grid gap-4">
          {employes?.map((emp: any) => {
            const rh = employesRh?.find(r => r.email === emp.email);
            const salaireBrut = rh ? (rh.salaire_base * rh.taux_travail / 100).toFixed(2) : null;
            const joursParSemaine = rh ? Math.round(rh.taux_travail / 100 * 5) : null;
            const joursVacances = rh ? Math.round(20 * rh.taux_travail / 100) : null;

            return (
              <div key={emp.id} className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xl font-bold" style={{ color: "#1B2B5E" }}>
                        {emp.prenom || rh?.prenom || "—"} {emp.nom || rh?.nom || ""}
                      </p>
                      {emp.role === "admin" && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                          Admin
                        </span>
                      )}
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        emp.actif ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}>
                        {emp.actif ? "🟢 Actif" : "🔴 Inactif"}
                      </span>
                    </div>
                    <p className="text-gray-500 text-sm mt-1">{emp.email}</p>

                    {/* Infos RH */}
                    {rh && (
                      <div className="flex gap-3 mt-3 flex-wrap">
                        <span className="px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-700">
                          {rh.taux_travail}% — {joursParSemaine}j/semaine
                        </span>
                        <span className="px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-700">
                          💰 {salaireBrut} CHF/mois
                        </span>
                        <span className="px-3 py-1 rounded-full text-sm font-semibold bg-yellow-100 text-yellow-700">
                          🏖️ {joursVacances}j vacances/an
                        </span>
                      </div>
                    )}
                    {!rh && (
                      <p className="text-xs text-orange-500 mt-2">
                        ⚠️ Pas encore de fiche RH —{" "}
                        <Link href="/employes/nouveau-rh" style={{ color: "#4AAEA0" }}>
                          créer la fiche RH
                        </Link>
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 ml-4">
                    {rh && (
                      <Link href={`/employes/${rh.id}/rh`}
                        className="px-3 py-2 rounded-xl text-sm font-semibold text-white"
                        style={{ backgroundColor: "#C9A84C" }}>
                        📊 RH
                      </Link>
                    )}
                    {emp.role !== "admin" && (
                      <Link href={`/employes/${emp.id}/modifier`}
                        className="px-3 py-2 rounded-xl text-sm font-semibold"
                        style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
                        ✏️
                      </Link>
                    )}
                  </div>
                </div>

                {/* Permissions */}
                {emp.role === "employe" && (
                  <div className="mt-4 border-t pt-4">
                    <p className="text-sm font-semibold mb-2 text-gray-600">Permissions :</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { key: "perm_checkin", label: "Check-in/out" },
                        { key: "perm_reservations_creer", label: "Créer résa" },
                        { key: "perm_reservations_modifier", label: "Modifier résa" },
                        { key: "perm_reservations_annuler", label: "Annuler résa" },
                        { key: "perm_clients_creer", label: "Créer clients" },
                        { key: "perm_clients_modifier", label: "Modifier clients" },
                        { key: "perm_chiens_modifier", label: "Modifier chiens" },
                        { key: "perm_planning", label: "Planning" },
                        { key: "perm_tarifs_urgence", label: "Tarifs urgence" },
                      ].map(({ key, label }) => (
                        <span key={key} className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          emp[key] ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        }`}>
                          {emp[key] ? "✅" : "❌"} {label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </main>
  );
}