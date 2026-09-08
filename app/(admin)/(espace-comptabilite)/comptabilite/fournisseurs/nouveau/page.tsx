import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import FormFournisseur from "../FormFournisseur";

export default async function NouveauFournisseurPage() {
  await exigerAccesAdmin("perm_depenses");

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-xl mx-auto">
        <EnTete
          titre="🏢 Nouveau fournisseur"
          sousTitre="Seul le nom est obligatoire."
          action={<Bouton href="/comptabilite/fournisseurs" variante="secondaire">← Fournisseurs</Bouton>}
        />
        <Carte>
          <FormFournisseur />
        </Carte>
      </div>
    </main>
  );
}
