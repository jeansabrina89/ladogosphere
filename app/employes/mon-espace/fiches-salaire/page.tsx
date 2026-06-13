import { createSupabaseServerClient } from "../../../../src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "../../../../src/utils/supabase/server";
import { getEmployeRhActuel } from "../../../../src/lib/employeActuel";
import Link from "next/link";

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export default async function MesFichesSalairePage() {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role, email").eq("id", user.id).single();
  if (!["admin", "employe"].includes(profile?.role)) redirect("/");

  const employe = await getEmployeRhActuel(supabase, user.id, profile?.email);
  if (!employe) redirect("/employes/mon-espace");

  const { data: fiches } = await supabase
    .from("fiches_salaire")
    .select("*")
    .eq("employe_id", employe.id)
    .order("annee", { ascending: false })
    .order("mois", { ascending: false });

  const anneeActuelle = new Date().getFullYear();

  // Années disponibles
  const annees = [...new Set(fiches?.map((f: any) => f.annee) ?? [])].sort((a, b) => b - a);

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold" style={{ color: "#1B2B5E" }}>📊 Mes fiches de salaire</h1>
          <Link href="/employes/mon-espace"
            className="px-4 py-2 rounded-xl font-semibold text-sm"
            style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
            ← Retour
          </Link>
        </div>

        {/* Certificats annuels */}
        {annees.length > 0 && (
          <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
            <h2 className="font-bold mb-3" style={{ color: "#1B2B5E" }}>📋 Certificats de salaire</h2>
            <div className="flex flex-wrap gap-3">
              {annees.map((annee: number) => (
                <Link key={annee}
                  href={`/employes/fiches-salaire/certificat?annee=${annee}`}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                  style={{ backgroundColor: "#1B2B5E" }}>
                  📋 Certificat {annee}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Fiches mensuelles */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>Fiches mensuelles</h2>
          {fiches?.length === 0 && (
            <p className="text-gray-400 text-sm">Aucune fiche de salaire disponible.</p>
          )}
          <div className="space-y-3">
            {fiches?.map((f: any) => (
              <Link key={f.id} href={`/employes/fiches-salaire/${f.id}`}
                className="flex justify-between items-center border rounded-xl p-4 hover:bg-slate-50">
                <div>
                  <p className="font-bold" style={{ color: "#1B2B5E" }}>
                    {MOIS[f.mois - 1]} {f.annee}
                  </p>
                  <p className="text-sm text-gray-500">
                    Brut : CHF {Number(f.salaire_brut).toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg" style={{ color: "#4AAEA0" }}>
                    CHF {Number(f.salaire_net).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400">Net</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}