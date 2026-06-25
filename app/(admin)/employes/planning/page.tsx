import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { redirect } from "next/navigation";
import GenerateurPlanning from "./GenerateurPlanning";

export default async function PlanningAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string; annee?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const params = await searchParams;
  const aujourd_hui = new Date();
  const moisActuel = parseInt(params.mois || String(aujourd_hui.getMonth() + 1));
  const anneeActuelle = parseInt(params.annee || String(aujourd_hui.getFullYear()));

  const dateDebutMois = `${anneeActuelle}-${String(moisActuel).padStart(2, "0")}-01`;
  const dateFinMois = new Date(anneeActuelle, moisActuel, 0).toISOString().split("T")[0];

  // Fenetre du mois precedent (controle des jours consecutifs a la jonction des mois)
  const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const premierDuMois = new Date(anneeActuelle, moisActuel - 1, 1);
  const debutPrec = new Date(premierDuMois); debutPrec.setDate(premierDuMois.getDate() - 16);
  const finPrec = new Date(premierDuMois); finPrec.setDate(premierDuMois.getDate() - 1);
  const dateDebutPrec = fmtDate(debutPrec);
  const dateFinPrec = fmtDate(finPrec);

  const [
    { data: employes },
    { data: planningExistant },
    { data: planningPrecedent },
    { data: vacancesAcceptees },
    { data: indisponibilites },
  ] = await Promise.all([
    supabaseAdmin
      .from("employes_rh")
      .select("*")
      .eq("actif", true)
      .order("nom"),
    supabaseAdmin
      .from("planning_employes")
      .select("*")
      .gte("date", dateDebutMois)
      .lte("date", dateFinMois),
    supabaseAdmin
      .from("planning_employes")
      .select("employe_id, date, statut")
      .gte("date", dateDebutPrec)
      .lte("date", dateFinPrec),
    supabaseAdmin
      .from("demandes_vacances")
      .select("*, employes_rh (id)")
      .eq("statut", "acceptee")
      .or(`and(date_debut.lte.${dateFinMois},date_fin.gte.${dateDebutMois})`),
    supabaseAdmin
      .from("indisponibilites")
      .select("*")
      .gte("date", dateDebutMois)
      .lte("date", dateFinMois),
  ]);

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-7xl mx-auto">

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold" style={{ color: "#1B2B5E" }}>
            📅 Planning mensuel
          </h1>
          <a href="/employes"
            className="px-4 py-2 rounded-xl font-semibold text-sm"
            style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
            ← Équipe
          </a>
        </div>

        <GenerateurPlanning
          employes={employes ?? []}
          mois={moisActuel}
          annee={anneeActuelle}
          planningExistant={planningExistant ?? []}
          planningPrecedent={planningPrecedent ?? []}
          vacancesAcceptees={vacancesAcceptees ?? []}
          indisponibilites={indisponibilites ?? []}
        />

      </div>
    </main>
  );
}
