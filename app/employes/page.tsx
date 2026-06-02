import Link from "next/link";
import { supabase } from "../../src/lib/supabase";

export default async function EmployesPage() {
  const { data: employes } = await supabase
    .from("profiles")
    .select("*")
    .in("role", ["admin", "employe"])
    .order("created_at");

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-5xl mx-auto">

        <h1 className="text-4xl font-bold mb-2">👥 Équipe</h1>
        <p className="text-gray-600 mb-6">Gestion des comptes et permissions</p>

        <div className="mb-6">
          <Link href="/employes/nouveau"
            className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700">
            ➕ Ajouter un employé
          </Link>
        </div>

        <div className="grid gap-4">
          {employes?.map(emp => (
            <div key={emp.id} className="bg-white rounded-xl p-6 shadow">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xl font-bold">
                    {emp.prenom} {emp.nom}
                    {emp.role === "admin" && (
                      <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                        Admin
                      </span>
                    )}
                  </p>
                  <p className="text-gray-500 text-sm">{emp.email}</p>
                  <p className="text-sm mt-1">
                    {emp.actif
                      ? <span className="text-green-600">🟢 Actif</span>
                      : <span className="text-red-600">🔴 Inactif</span>
                    }
                  </p>
                </div>
                <div className="flex gap-2">
                  {emp.role !== "admin" && (
                    <Link href={`/employes/${emp.id}/modifier`}
                      className="bg-blue-600 text-white px-3 py-2 rounded-xl hover:bg-blue-700 text-sm">
                      ✏️ Permissions
                    </Link>
                  )}
                </div>
              </div>

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
                        (emp as any)[key]
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}>
                        {(emp as any)[key] ? "✅" : "❌"} {label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}