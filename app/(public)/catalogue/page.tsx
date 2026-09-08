import Link from "next/link";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { catalogueEnLigne, nombreArticlesPanier } from "@/src/lib/venteEnLigne";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import EtatVide from "@/app/components/ui/EtatVide";
import CatalogueBoutique, { type ArticleVitrine, type RubriqueAffichee } from "./CatalogueBoutique";
import BarrePanier from "./BarrePanier";
import FusionPanier from "./FusionPanier";
import { catalogueVitrine } from "@/src/lib/vitrine";
import { lireParametresEnLigne } from "@/src/lib/venteEnLigne";
import { mentionRemiseMembre } from "@/src/lib/venteEnLigneLogique";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { estMembreActif } from "@/src/lib/membre";
import { contextePrix, prixDe } from "@/src/lib/prix";
import { mentionDateLimite, rubriquesBoutique } from "@/src/lib/prixLogique";

export const dynamic = "force-dynamic";

/**
 * Pas d'indexation : la vitrine, c'est le site — ladogosphere.ch/boutique.
 * Ici, c'est la caisse. Deux catalogues indexés feraient double emploi et se
 * disputeraient les mêmes recherches. Une ligne à retirer le jour où Sabrina
 * en décide autrement.
 */
export const metadata = { robots: { index: false, follow: false } };

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

  // Un VISITEUR ne lit que la vitrine : ni prix d'achat, ni marge, ni
  // fournisseur, ni stock chiffré — ces colonnes n'existent pas dans la vue.
  // Un client connecté garde le catalogue complet, avec son « Plus que 2 ».
  const [articles, nombre, params, ctx, membre] = await Promise.all([
    clientId ? catalogueEnLigne() : catalogueVitrine(),
    clientId ? nombreArticlesPanier(clientId) : Promise.resolve(0),
    lireParametresEnLigne(),
    contextePrix(),
    clientId ? estMembreActif(supabaseAdmin, clientId) : Promise.resolve(false),
  ]);

  // Un visiteur non connecté n'est PAS membre : une action « membres » ne le
  // concerne pas, et il n'en verra ni le prix barré ni la mention.
  const client = { estMembre: membre };

  const liste: ArticleVitrine[] = articles.map((a) => {
    const prix = prixDe(ctx, a, client);
    return {
      id: a.id,
      nom: a.nom,
      description: a.description,
      categorie: a.categorie,
      marque: a.marque,
      // Le prix BARRÉ est le prix de base réel de l'article, jamais gonflé.
      prix_vente: prix.prixBase,
      prix_final: prix.prixFinal,
      remise_libelle: prix.libelle,
      photo_path: a.photo_path,
      type_article: a.type_article,
      delai_fabrication_jours: a.delai_fabrication_jours,
      // La date limite ne s'annonce que dans une rubrique anti-gaspillage :
      // ailleurs, elle ne regarde pas le client.
      mention_date_limite:
        prix.origine === "anti_gaspillage" ? mentionDateLimite(a.date_limite) : null,
      // L'un ou l'autre, jamais les deux : le chiffre n'est calculé que pour
      // qui y a droit.
      ...(clientId
        ? { stock_disponible: (a as { stock_disponible: number }).stock_disponible }
        : { en_stock: (a as { en_stock: boolean }).en_stock }),
    };
  });

  // Les rubriques ne montrent QUE des articles servis à cette personne : une
  // rubrique dont rien n'est visible n'apparaît pas, et une rubrique
  // « membres » n'existe pas pour qui ne l'est pas.
  const parId = new Map(liste.map((a) => [a.id, a]));
  const articlesParRubrique = new Map<string, ArticleVitrine[]>();
  for (const [articleId, promos] of ctx.parArticle) {
    const article = parId.get(articleId);
    if (!article) continue;
    for (const p of promos) {
      const deja = articlesParRubrique.get(p.id);
      if (deja) deja.push(article);
      else articlesParRubrique.set(p.id, [article]);
    }
  }

  const rubriques: RubriqueAffichee[] = rubriquesBoutique(
    ctx.promotions,
    articlesParRubrique,
    client,
    ctx.date
  ).map((r) => ({
    id: r.promotion.id,
    nom: r.promotion.nom,
    type: String(r.promotion.type),
    texte: r.promotion.texte ?? null,
    articles: r.articles,
  }));

  const mentionMembre = mentionRemiseMembre(params.remisePourcent);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8", paddingBottom: 96 }}>
      <div className="max-w-5xl mx-auto">
        <EnTete
          titre="🛍️ Boutique"
          sousTitre="Croquettes, accessoires et sur-mesure. Retrait à la pension, au départ de votre chien, ou par la poste."
        />

        {/* Connecté : le panier du navigateur rejoint le compte, et on le dit. */}
        {clientId && <FusionPanier />}

        {!user && (
          <Carte>
            <p style={{ color: "#1B2B5E", fontSize: 15, margin: 0 }}>
              Parcourez la boutique et remplissez votre panier librement. La
              connexion ne vous sera demandée qu&apos;au moment de valider — votre
              panier vous y suivra.
            </p>
            {mentionMembre && (
              /* On n'applique PAS la remise à un visiteur : la montrer puis la
                 retirer à la validation serait une petite trahison. On dit ce
                 qui est vrai, et c'est une raison d'adhérer. */
              <p style={{ color: "#6E5410", fontSize: 15, fontWeight: 600, margin: "10px 0 0" }}>
                🎫 {mentionMembre}{" "}
                <Link href="/inscription" style={{ color: "#1F6E5B", fontWeight: 700 }}>
                  Devenir membre
                </Link>
              </p>
            )}
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
          <CatalogueBoutique articles={liste} rubriques={rubriques} connecte={!!clientId} />
        )}
      </div>

      <BarrePanier nombre={nombre} local={!clientId} />
    </main>
  );
}
