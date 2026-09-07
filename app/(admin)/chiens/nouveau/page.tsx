import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { clientsMembresAJour } from "@/src/lib/membre";
import EnTete from "@/app/components/ui/EnTete";
import FormNouveauChien, { type ProprietaireChoix } from "./FormNouveauChien";

export default async function NouveauChienPage() {
  await exigerAccesAdmin();
  const supabase = supabaseAdmin;
  const { data: clients } = await supabase
    .from("clients")
    .select("id, prenom, nom, membre")
    .order("nom");

  const idsAJourProprio = await clientsMembresAJour(supabase, (clients ?? []).map((c) => c.id));

  const proprietaires: ProprietaireChoix[] = (clients ?? []).map((c) => ({
    id: c.id,
    prenom: c.prenom,
    nom: c.nom,
    membre: c.membre,
    aJour: idsAJourProprio.has(c.id),
  }));

  return (
    <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">
        <EnTete titre="➕ Ajouter un chien" sousTitre="Nouvelle fiche chien" />
        <FormNouveauChien proprietaires={proprietaires} />
      </div>
    </main>
  );
}
