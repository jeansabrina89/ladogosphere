import { notFound, redirect } from "next/navigation";
import { exigerAccesAdmin, refusStock } from "@/src/lib/accesAdmin";
import { perimetreDeArticle } from "@/src/lib/perimetreStock";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { lireArticle } from "@/src/lib/boutique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import FormArticle, { type ArticleFormulaire } from "../../FormArticle";

export const dynamic = "force-dynamic";

export default async function ModifierArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Le rôle d'abord. La permission ensuite, mais elle dépend de la donnée :
  // une fourniture relève de l'atelier, un article revendu de la boutique. On
  // lit donc la fiche avant de savoir quelle porte il fallait pousser.
  const acces = await exigerAccesAdmin();
  const { id } = await params;

  const [article, { data: fournisseurs }] = await Promise.all([
    lireArticle(id),
    supabaseAdmin.from("fournisseurs").select("id, nom").eq("actif", true).order("nom"),
  ]);
  if (!article) notFound();

  const refus = refusStock(acces, perimetreDeArticle(article), "gestion");
  if (refus) redirect(refus);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto">
        <EnTete
          titre={`✏️ ${article.nom}`}
          sousTitre={`${article.reference} — le stock ne se modifie pas ici, il vient des mouvements.`}
          action={<Bouton href={`/boutique/articles/${id}`} variante="secondaire">← Fiche</Bouton>}
        />
        <Carte>
          <FormArticle
            article={article as unknown as ArticleFormulaire}
            fournisseurs={(fournisseurs ?? []) as { id: string; nom: string }[]}
          />
        </Carte>
      </div>
    </main>
  );
}
