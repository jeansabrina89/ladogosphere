import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { createClient } from "@/src/utils/supabase/server";
import GestionTarifs from "./GestionTarifs";
import { entiteCourante } from "@/src/lib/entiteJuridique";

export default async function TarifsPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;
  await exigerAdminPage();

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
    // APP 63 — plus que le montant d'adhésion. L'IBAN, le titulaire et
    // l'adresse vivaient ici en doublon de `entites_juridiques`, et chaque
    // sauvegarde des prix les y renvoyait : le 29.09.2026 à 20:45 UTC, cela a
    // mis l'IBAN de l'entité à null et changé sa raison sociale.
    // Les paramètres de TVA ont leur écran et leur table : Réglages → TVA.
    .in("cle", ["cotisation_montant"]);

  const { data: anneesDispo } = await supabase
    .from("tarifs")
    .select("annee")
    .order("annee", { ascending: false });

  const anneesUniques = [...new Set(anneesDispo?.map(t => t.annee) ?? [])];

  const val = (cle: string, def = "") => parametres?.find(p => p.cle === cle)?.valeur ?? def;

  const cotisationMontant = parseFloat(val("cotisation_montant", "200"));

  // L'identité de paiement se LIT ici, elle ne s'y règle pas.
  const entite = await entiteCourante();


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
          identite={{
            raisonSociale: entite?.raisonSociale ?? "",
            iban: entite?.iban ?? null,
            qrIban: entite?.qrIban ?? null,
          }}
        />
      </div>
    </main>
  );
}
