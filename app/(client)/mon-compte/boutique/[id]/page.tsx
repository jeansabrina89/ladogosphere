import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { lireArticle } from "@/src/lib/boutique";
import { lireGroupes } from "@/src/lib/personnalisation";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import Configurateur from "@/app/components/Configurateur";

export const dynamic = "force-dynamic";

/**
 * Fiche produit d'un article sur mesure, côté client.
 *
 * C'est le MÊME configurateur qu'au comptoir : même grille de coloris, même
 * récapitulatif, même prix. La commande, elle, se passe au comptoir — ce qui
 * viendra en ligne avec APP 12.
 */
export default async function ArticleSurMesurePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const article = await lireArticle(id);

  if (
    !article ||
    article.type_article !== "personnalisable" ||
    !article.actif ||
    !article.vendable_en_ligne ||
    article.composant
  ) {
    notFound();
  }

  const groupes = await lireGroupes(id);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">
        <EnTete
          titre={`🎁 ${article.nom}`}
          sousTitre={article.description ?? "Composez le vôtre."}
          action={<Bouton href="/mon-compte/boutique" variante="secondaire">← Sur mesure</Bouton>}
        />

        {groupes.length === 0 ? (
          <p style={{ color: "rgba(27,43,94,0.55)", fontSize: 15 }}>
            Cet article n&apos;a pas encore d&apos;options à choisir. Passez nous voir, nous en
            parlerons de vive voix.
          </p>
        ) : (
          <Configurateur
            article={{
              id: article.id,
              nom: article.nom,
              description: article.description,
              prix_vente: article.prix_vente,
              delai_fabrication_jours: article.delai_fabrication_jours,
              photo_path: article.photo_path,
            }}
            groupes={groupes}
            noteFin="Cette configuration se commande au comptoir : montrez-la-nous, ou dites-nous les couleurs par leur nom. Le paiement en ligne viendra plus tard."
          />
        )}
      </div>
    </main>
  );
}
