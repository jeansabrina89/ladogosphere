import { createSupabaseServerClient } from "../../../src/lib/supabase-server";
import { redirect } from "next/navigation";
import { supabase } from "../../../src/lib/supabase";
import Link from "next/link";
import GestionModeles from "./GestionModeles";
import BoutonSupprimerFiche from "./BoutonSupprimerFiche";

export default async function FichesSalairePage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const { data: modeles } = await supabase
    .from("modeles_deductions")
    .select("*")
    .order("ordre");

  const { data: fiches } = await supabase
    .from("fiches_salaire")
    .select("*, employes_rh(prenom, nom)")
    .order("annee", { ascending: false })
    .order("mois", { ascending: false });

  const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">

        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-4xl font-bold" style={{ color: "#1B2B5E" }}>📊 Fiches de salaire</h1>
            <p className="text-gray-500 mt-1">Génération et gestion des fiches de salaire</p>
          </div>
          <div className="flex gap-3">
            <Link href="/employes/fiches-salaire/creer"
              className="px-4 py-2 rounded-xl font-semibold text-white text-sm"
              style={{ backgroundColor: "#4AAEA0" }}>
              ➕ Nouvelle fiche
            </Link>
            <Link href="/employes"
              className="px-4 py-2 rounded-xl font-semibold text-sm"
              style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
              ← Retour
            </Link>
          </div>
        </div>

        {/* Gestion des modèles de déductions */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
            ⚙️ Modèles de déductions
          </h2>
          <GestionModeles modeles={modeles ?? []} />
        </div>

        {/* Liste des fiches */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
            📋 Fiches générées
          </h2>
          {fiches?.length === 0 && (
            <p className="text-gray-400 text-sm">Aucune fiche générée pour l'instant.</p>
          )}
          <div className="space-y-3">
            {fiches?.map((f: any) => (
              <div key={f.id} className="flex justify-between items-center border rounded-xl p-4">
                <div>
                  <p className="font-bold" style={{ color: "#1B2B5E" }}>
                    {f.employes_rh?.prenom} {f.employes_rh?.nom}
                  </p>
                  <p className="text-sm text-gray-500">
                    {MOIS[f.mois - 1]} {f.annee}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm" style={{ color: "#4AAEA0" }}>
                    Brut : CHF {Number(f.salaire_brut).toFixed(2)}
                  </p>
                  <p className="font-bold text-sm" style={{ color: "#1B2B5E" }}>
                    Net : CHF {Number(f.salaire_net).toFixed(2)}
                  </p>
                </div>
                <div className="flex ml-4">
                  <Link href={`/employes/fiches-salaire/${f.id}`}
                    className="px-3 py-2 rounded-xl text-sm font-semibold text-white"
                    style={{ backgroundColor: "#C9A84C" }}>
                    👁️ Voir
                  </Link>
                  <BoutonSupprimerFiche id={f.id} />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}