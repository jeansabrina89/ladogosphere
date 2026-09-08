import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { createClient } from "@/src/utils/supabase/server";
import GestionTarifs from "./GestionTarifs";

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
    .in("cle", [
      "cotisation_montant", "iban", "titulaire",
      "adresse_rue", "adresse_numero", "adresse_npa", "adresse_ville", "adresse_pays",
      // Les paramètres de TVA ont leur écran et leur table : Réglages → TVA.
    ]);

  const { data: anneesDispo } = await supabase
    .from("tarifs")
    .select("annee")
    .order("annee", { ascending: false });

  const anneesUniques = [...new Set(anneesDispo?.map(t => t.annee) ?? [])];

  const val = (cle: string, def = "") => parametres?.find(p => p.cle === cle)?.valeur ?? def;

  const cotisationMontant = parseFloat(val("cotisation_montant", "200"));
  const iban = val("iban");
  const titulaire = val("titulaire");
  const adresseRue = val("adresse_rue");
  const adresseNumero = val("adresse_numero");
  const adresseNpa = val("adresse_npa");
  const adresseVille = val("adresse_ville");
  const adressePays = val("adresse_pays", "CH");


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
          titulaireInitial={titulaire}
          adresseRueInitial={adresseRue}
          adresseNumeroInitial={adresseNumero}
          adresseNpaInitial={adresseNpa}
          adresseVilleInitial={adresseVille}
          adressePaysInitial={adressePays}
        />
      </div>
    </main>
  );
}
