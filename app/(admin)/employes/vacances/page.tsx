import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import BoutonGestionVacances from "./BoutonGestionVacances";
import BoutonSupprimerVacances from "./BoutonSupprimerVacances";
import { formatDateFR } from "@/src/lib/dates";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import FormPoserVacances from "./FormPoserVacances";
import FormModifierVacances from "./FormModifierVacances";

export default async function GestionVacancesPage() {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const { data: demandes } = await supabase
    .from("demandes_vacances")
    .select(`*, employes_rh (prenom, nom, taux_travail)`)
    .order("created_at", { ascending: false });

  const { data: employes } = await supabaseAdmin
    .from("employes_rh")
    .select("id, prenom, nom, taux_travail")
    .eq("actif", true)
    .order("nom");

  const enAttente = demandes?.filter(d => d.statut === "en_attente") ?? [];
  const traitees = demandes?.filter(d => d.statut !== "en_attente") ?? [];

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold" style={{ color: "#1B2B5E" }}>
            🏖️ Demandes de vacances
          </h1>
          <div className="flex gap-3 items-center">
            <FormPoserVacances employes={employes ?? []} />
            <a href="/employes"
              className="px-4 py-2 rounded-xl font-semibold text-sm"
              style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
              ← Équipe
            </a>
          </div>
        </div>

        {/* En attente */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>
            ⏳ En attente
            {enAttente.length > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-sm bg-yellow-100 text-yellow-700">
                {enAttente.length}
              </span>
            )}
          </h2>
          {enAttente.length === 0 && (
            <p className="text-gray-400 text-sm">Aucune demande en attente.</p>
          )}
          <div className="space-y-4">
            {enAttente.map((d: any) => (
              <div key={d.id} className="border border-yellow-200 rounded-xl p-4 bg-yellow-50">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold" style={{ color: "#1B2B5E" }}>
                      {d.employes_rh?.prenom} {d.employes_rh?.nom}
                      <span className="ml-2 text-xs text-gray-400 font-normal">
                        ({d.employes_rh?.taux_travail}%)
                      </span>
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      📅 {formatDateFR(d.date_debut)} →{" "}
                      {formatDateFR(d.date_fin)}
                      <span className="ml-2 font-semibold">{d.nb_jours}j</span>
                    </p>
                    {d.note_employe && (
                      <p className="text-xs text-gray-500 mt-1">"{d.note_employe}"</p>
                    )}
                  </div>
                  <div className="flex gap-2 items-start">
                    <FormModifierVacances
                      id={d.id}
                      date_debut_initiale={d.date_debut}
                      date_fin_initiale={d.date_fin}
                      statut={d.statut}
                      taux_travail={d.employes_rh?.taux_travail ?? 100}
                      note_admin_initiale={d.note_admin ?? null}
                    />
                    <BoutonGestionVacances id={d.id} />
                    <BoutonSupprimerVacances id={d.id} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Traitées */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>
            📋 Historique
          </h2>
          {traitees.length === 0 && (
            <p className="text-gray-400 text-sm">Aucune demande traitée.</p>
          )}
          <div className="space-y-3">
            {traitees.map((d: any) => (
              <div key={d.id} className="border rounded-xl p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: "#1B2B5E" }}>
                      {d.employes_rh?.prenom} {d.employes_rh?.nom}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDateFR(d.date_debut)} →{" "}
                      {formatDateFR(d.date_fin)} · {d.nb_jours}j
                    </p>
                    {d.note_admin && (
                      <p className="text-xs text-blue-500 mt-1">Note : "{d.note_admin}"</p>
                    )}
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      d.statut === "acceptee" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {d.statut === "acceptee" ? "✅ Acceptée" : "❌ Refusée"}
                    </span>
                    {d.statut === "acceptee" && (
                      <FormModifierVacances
                        id={d.id}
                        date_debut_initiale={d.date_debut}
                        date_fin_initiale={d.date_fin}
                        statut={d.statut}
                        taux_travail={d.employes_rh?.taux_travail ?? 100}
                        note_admin_initiale={d.note_admin ?? null}
                      />
                    )}
                    <BoutonSupprimerVacances id={d.id} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}