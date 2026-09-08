import { notFound } from "next/navigation";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import {
  articlesChoisissables,
  articlesDeLaPromotion,
  lirePromotion,
} from "@/src/lib/promotions";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import FormPromotion from "../FormPromotion";

export const dynamic = "force-dynamic";

export default async function ModifierRubriquePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerAccesAdmin("perm_boutique_gestion");
  const { id } = await params;

  const [promotion, articles, choisis] = await Promise.all([
    lirePromotion(id),
    articlesChoisissables(),
    articlesDeLaPromotion(id),
  ]);
  if (!promotion) notFound();

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">
        <EnTete
          titre={`🏷️ ${promotion.nom}`}
          sousTitre="Une rubrique passée ne se supprime pas : elle se désactive et reste consultable."
          action={<Bouton href="/boutique/actions" variante="secondaire">← Actions</Bouton>}
        />
        <Carte>
          <FormPromotion promotion={promotion} articles={articles} articlesChoisis={choisis} />
        </Carte>
      </div>
    </main>
  );
}
