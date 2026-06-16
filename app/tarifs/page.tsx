import { createSupabaseServerClient } from "../../src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "../../src/utils/supabase/server";
import GestionTarifs from "./GestionTarifs";

export default async function TarifsPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const supabase = await createClient();
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

  const { data: parametres } = await supabase
    .from("parametres")
    .select("cle, valeur")
    .in("cle", [
      "cotisation_montant", "iban",
      "tva_assujettie", "tva_taux", "tva_numero", "tva_date_debut", "tva_taux_dette_nette",
    ]);

  const { data: anneesDispo } = await supabase
    .from("tarifs")
    .select("annee")
    .order("annee", { ascending: false });

  const anneesUniques = [...new Set(anneesDispo?.map(t => t.annee) ?? [])];

  const cotisationMontant = parseFloat(
    parametres?.find(p => p.cle === "cotisation_montant")?.valeur ?? "180"
  );
  const iban = parametres?.find(p => p.cle === "iban")?.valeur ?? "";

  const tvaAssujettie = parametres?.find(p => p.cle === "tva_assujettie")?.valeur === "true";
  const tvaTaux       = parametres?.find(p => p.cle === "tva_taux")?.valeur ?? "8.1";
  const tvaNumero     = parametres?.find(p => p.cle === "tva_numero")?.valeur ?? "";
  const tvaDateDebut  = parametres?.find(p => p.cle === "tva_date_debut")?.valeur ?? "";
  const tvaTauxDetteNette = parametres?.find(p => p.cle === "tva_taux_dette_nette")?.valeur ?? "";

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold mb-2" style={{ color: "#1B2B5E" }}>💰 Tarifs</h1>
        <p className="text-gray-500 mb-6">Gestion des tarifs et adhésion membre</p>

        <GestionTarifs
          tarifs={tarifs ?? []}
          annee={annee}
          anneesDisponibles={anneesUniques}
          cotisationMontant={cotisationMontant}
          ibanInitial={iban}
          tvaAssujettie={tvaAssujettie}
          tvaTaux={tvaTaux}
          tvaNumero={tvaNumero}
          tvaDateDebut={tvaDateDebut}
          tvaTauxDetteNette={tvaTauxDetteNette}
        />
      </div>
    </main>
  );
}