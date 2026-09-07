import { notFound, redirect } from "next/navigation";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { lireArticle } from "@/src/lib/boutique";
import { lireCatalogueOptions, articlesPersonnalisables } from "@/src/lib/personnalisation";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import GestionOptions from "./GestionOptions";

export const dynamic = "force-dynamic";

export default async function OptionsArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerAccesAdmin("perm_boutique");
  const { id } = await params;

  const article = await lireArticle(id);
  if (!article) notFound();

  // Un article ordinaire n'a pas d'options : on renvoie à sa fiche.
  if (article.type_article !== "personnalisable") redirect(`/boutique/articles/${id}`);

  const [{ groupes, dependances }, sources, { data: fournitures }] = await Promise.all([
    lireCatalogueOptions(id),
    articlesPersonnalisables(id),
    supabaseAdmin
      .from("articles")
      .select("id, nom, unite")
      .eq("composant", true)
      .eq("actif", true)
      .order("nom"),
  ]);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">
        <EnTete
          titre={`🎨 Options — ${article.nom}`}
          sousTitre="Ce que le client pourra choisir, et ce que chaque choix coûte, allonge ou consomme."
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href={`/boutique/caisse/sur-mesure/${id}`} variante="principal">
                🎁 Commande sur mesure
              </Bouton>
              <Bouton href={`/boutique/articles/${id}`} variante="secondaire">← Fiche</Bouton>
            </div>
          }
        />

        <Carte>
          <GestionOptions
            articleId={id}
            groupes={groupes}
            dependances={dependances}
            fournitures={(fournitures ?? []) as { id: string; nom: string; unite: string }[]}
            sources={sources}
          />
        </Carte>
      </div>
    </main>
  );
}
