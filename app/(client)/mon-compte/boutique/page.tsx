import Link from "next/link";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { catalogueEnLigne, nombreArticlesPanier } from "@/src/lib/venteEnLigne";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import EtatVide from "@/app/components/ui/EtatVide";
import CatalogueBoutique, { type ArticleVitrine } from "./CatalogueBoutique";
import BarrePanier from "./BarrePanier";

export const dynamic = "force-dynamic";

/**
 * La boutique en ligne.
 *
 * Le catalogue est PUBLIC : un visiteur non connecté le parcourt librement —
 * c'est déjà le cas de la vue articles_vitrine. Il doit se connecter pour
 * commander, et le panier qu'il aura commencé à garnir l'attend après.
 */
export default async function BoutiqueClientPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let clientId: string | null = null;
  if (user) {
    const { data } = await supabase
      .from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
    clientId = (data?.id as string) ?? null;
  }

  const [articles, nombre] = await Promise.all([
    catalogueEnLigne(),
    clientId ? nombreArticlesPanier(clientId) : Promise.resolve(0),
  ]);

  const liste: ArticleVitrine[] = articles.map((a) => ({
    id: a.id,
    nom: a.nom,
    description: a.description,
    categorie: a.categorie,
    marque: a.marque,
    prix_vente: Number(a.prix_vente),
    photo_path: a.photo_path,
    type_article: a.type_article,
    delai_fabrication_jours: a.delai_fabrication_jours,
    stock_disponible: a.stock_disponible,
  }));

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8", paddingBottom: 96 }}>
      <div className="max-w-5xl mx-auto">
        <EnTete
          titre="🛍️ Boutique"
          sousTitre="Croquettes, accessoires et sur-mesure. Retrait à la pension, au départ de votre chien, ou par la poste."
        />

        {!user && (
          <Carte>
            <p style={{ color: "#1B2B5E", fontSize: 15, margin: 0 }}>
              Vous pouvez parcourir la boutique librement.{" "}
              <Link href="/login?suite=/mon-compte/boutique" style={{ color: "#1F6E5B", fontWeight: 700 }}>
                Connectez-vous
              </Link>{" "}
              pour commander — ce que vous aurez mis au panier vous attendra.
            </p>
          </Carte>
        )}

        {liste.length === 0 ? (
          <Carte>
            <EtatVide
              icone="🛍️"
              titre="La boutique ouvre bientôt"
              message="Les articles apparaîtront ici dès qu'ils seront proposés à la vente en ligne."
            />
          </Carte>
        ) : (
          <CatalogueBoutique articles={liste} connecte={!!clientId} />
        )}
      </div>

      <BarrePanier nombre={nombre} />
    </main>
  );
}
