import { notFound } from "next/navigation";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { lireArticle } from "@/src/lib/boutique";
import { lireCatalogueOptions } from "@/src/lib/personnalisation";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import CommandeSurMesure from "./CommandeSurMesure";

export const dynamic = "force-dynamic";

export default async function SurMesurePage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const acces = await exigerAccesAdmin("perm_boutique_vente");
  const { articleId } = await params;

  const article = await lireArticle(articleId);
  if (!article || article.type_article !== "personnalisable") notFound();

  const { groupes, dependances } = await lireCatalogueOptions(articleId);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">
        <EnTete
          titre={`🎁 ${article.nom}`}
          sousTitre="Commande sur mesure"
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href={`/boutique/articles/${articleId}/options`} variante="secondaire">
                🎨 Options
              </Bouton>
              <Bouton href="/boutique/caisse" variante="secondaire">← Caisse</Bouton>
            </div>
          }
        />

        {groupes.length === 0 ? (
          <p style={{ color: "rgba(27,43,94,0.55)", fontSize: 15 }}>
            Cet article n&apos;a encore aucune option.{" "}
            <a href={`/boutique/articles/${articleId}/options`} style={{ color: "#1F6E5B", fontWeight: 600 }}>
              Composer son catalogue d&apos;options
            </a>{" "}
            avant de le proposer.
          </p>
        ) : (
          <CommandeSurMesure
            article={{
              id: article.id,
              nom: article.nom,
              description: article.description,
              prix_vente: article.prix_vente,
              delai_fabrication_jours: article.delai_fabrication_jours,
              photo_path: article.photo_path,
              taux_tva: article.taux_tva,
            }}
            groupes={groupes}
            dependances={dependances}
            affichage="liste"
            peutFacturer={acces.permissions.perm_encaissements === true}
          />
        )}
      </div>
    </main>
  );
}
