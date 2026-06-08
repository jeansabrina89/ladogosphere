import { createSupabaseServerClient } from "../../src/lib/supabase-server";
import { redirect } from "next/navigation";
import { supabase } from "../../src/lib/supabase";
import GestionTarifs from "./GestionTarifs";

export default async function TarifsPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const params = await searchParams;
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const annee = parseInt(params.annee || new Date().getFullYear().toString());

  const { data: tarifs } = await supabase
    .from("tarifs")
    .select("*")
    .eq("annee", annee)
    .eq("actif", true)
    .order("categorie");

  const { data: parametre } = await supabase
    .from("parametres")
    .select("valeur")
    .eq("cle", "cotisation_montant")
    .single();

  const { data: anneesDispo } = await supabase
    .from("tarifs")
    .select("annee")
    .order("annee", { ascending: false });

  const anneesUniques = [...new Set(anneesDispo?.map(t => t.annee) ?? [])];

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold mb-2" style={{ color: "#1B2B5E" }}>💰 Tarifs</h1>
        <p className="text-gray-500 mb-6">Gestion des tarifs et cotisation membre</p>

        <GestionTarifs
          tarifs={tarifs ?? []}
          annee={annee}
          anneesDisponibles={anneesUniques}
          cotisationMontant={parseFloat(parametre?.valeur ?? "180")}
        />
      </div>
    </main>
  );
}