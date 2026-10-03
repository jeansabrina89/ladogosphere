import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import FormFournisseur from "../FormFournisseur";
import { lireDomaine } from "@/src/lib/domainesFournisseurs";

export default async function NouveauFournisseurPage({
  searchParams,
}: {
  searchParams: Promise<{ domaine?: string }>;
}) {
  await exigerAccesAdmin("perm_depenses");
  // APP 73 — venu de Boutique ou d'Atelier, ce domaine est coché d'office.
  const domaine = lireDomaine((await searchParams).domaine);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-xl mx-auto">
        <EnTete
          titre="🏢 Nouveau fournisseur"
          sousTitre="Seul le nom est obligatoire."
          action={<Bouton href="/comptabilite/fournisseurs" variante="secondaire">← Fournisseurs</Bouton>}
        />
        <Carte>
          <FormFournisseur domainesParDefaut={[domaine ?? "general"]} />
        </Carte>
      </div>
    </main>
  );
}
