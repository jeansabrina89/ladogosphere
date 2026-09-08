import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { articlesChoisissables } from "@/src/lib/promotions";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import FormPromotion from "../FormPromotion";

export const dynamic = "force-dynamic";

export default async function NouvelleRubriquePage() {
  await exigerAccesAdmin("perm_boutique_gestion");
  const articles = await articlesChoisissables();

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">
        <EnTete
          titre="🏷️ Nouvelle rubrique"
          sousTitre="Les articles se choisissent à la main : une nouveauté n'est pas une date."
          action={<Bouton href="/boutique/actions" variante="secondaire">← Actions</Bouton>}
        />
        <Carte>
          <FormPromotion articles={articles} articlesChoisis={[]} />
        </Carte>
      </div>
    </main>
  );
}
