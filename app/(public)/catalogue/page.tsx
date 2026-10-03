import Link from "next/link";
import { lireRayonsRemises } from "@/src/lib/remiseMembre";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { catalogueEnLigne, nombreArticlesPanier } from "@/src/lib/venteEnLigne";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import EtatVide from "@/app/components/ui/EtatVide";
import CatalogueBoutique, { type ArticleVitrine, type RubriqueAffichee } from "./CatalogueBoutique";
import { EncadresAnimaux, EncadresRayons, FilAriane, ChampRecherche } from "./EncadresCatalogue";
import {
  animauxServis, choisirNiveau, encadresAnimaux, encadresRayons, filAriane, lienCatalogue,
} from "@/src/lib/niveauxCatalogue";
import { depuisParams, nombreFiltresActifs } from "@/src/lib/filtresCatalogueLogique";
import { libelleValeur } from "@/src/lib/etiquettesArticles";
import BarrePanier from "./BarrePanier";
import FusionPanier from "./FusionPanier";
import { catalogueVitrine } from "@/src/lib/vitrine";
import { mentionRemiseMembre } from "@/src/lib/venteEnLigneLogique";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { estMembreActif } from "@/src/lib/membre";
import { contextePrix, prixDe } from "@/src/lib/prix";
import { mentionDateLimite, pourcentageOffre, rubriquesBoutique } from "@/src/lib/prixLogique";

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
export default async function BoutiqueClientPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const texte = (cle: string) => {
    const v = params[cle];
    return typeof v === "string" ? v : null;
  };
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
  const [articles, nombre, ctx, membre] = await Promise.all([
    clientId ? catalogueEnLigne() : catalogueVitrine(),
    clientId ? nombreArticlesPanier(clientId) : Promise.resolve(0),
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
      // APP 62 : la pastille « −20 % » d'une offre, lue dans le même résultat.
      offre_pourcentage: pourcentageOffre(prix),
      photo_path: a.photo_path,
      type_article: a.type_article,
      delai_fabrication_jours: a.delai_fabrication_jours,
      // La date limite ne s'annonce que dans une rubrique anti-gaspillage :
      // ailleurs, elle ne regarde pas le client.
      mention_date_limite:
        prix.origine === "anti_gaspillage" ? mentionDateLimite(a.date_limite) : null,
      // Les étiquettes : ce sont les filtres. Toutes publiques — ce sont les
      // colonnes de la vue `articles_vitrine`, et rien de plus ne descend.
      expediable: a.expediable,
      // APP 27 : l'animal range l'article dans un onglet ; l'espèce et le type
      // de soin sont des filtres, comme les autres étiquettes.
      animaux: a.animaux,
      especes: a.especes,
      types_soin: a.types_soin,
      ages: a.ages,
      besoins: a.besoins,
      tailles_chien: a.tailles_chien,
      gouts: a.gouts,
      proteines: a.proteines,
      couleurs: a.couleurs,
      matieres: a.matieres,
      usages_jouet: a.usages_jouet,
      sans_cereales: a.sans_cereales,
      monoproteine: a.monoproteine,
      taille_article: a.taille_article,
      // APP 26 : ce qui s'achète même à stock zéro, et sous quel délai. Les
      // deux chemins — visiteur par la vue, client par `delaisSurCommande` —
      // donnent les mêmes trois champs, sans quoi la même page dirait
      // « Épuisé » à l'un et « Sur commande » à l'autre.
      sur_commande: (a as { sur_commande?: boolean | null }).sur_commande ?? false,
      delai_commande_min_jours:
        (a as { delai_commande_min_jours?: number | null }).delai_commande_min_jours ?? null,
      delai_commande_max_jours:
        (a as { delai_commande_max_jours?: number | null }).delai_commande_max_jours ?? null,
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

  // APP 43 : la mention nomme les rayons remisés, sans chiffrer un taux qui
  // varie de l'un à l'autre depuis APP 27.
  const mentionMembre = mentionRemiseMembre(await lireRayonsRemises());

  /*
   * APP 49 — QUEL NIVEAU MONTRER.
   *
   * Le calcul part de `liste`, celle-là même que la grille affichera : c'est ce
   * qui garantit qu'un encadré « 12 articles » en montre douze, et non onze
   * parce qu'un animal a été fermé entre-temps (APP 48).
   *
   * Les filtres d'étiquettes sont comptés par le module qui les possède : les
   * recompter ici aurait créé une seconde définition de « un filtre est actif ».
   */
  const nbFiltres = nombreFiltresActifs(depuisParams(new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) =>
      typeof v === "string" ? [[k, v] as [string, string]] : [],
    ),
  )));
  const choix = choisirNiveau(
    { animal: texte("animal"), categorie: texte("categorie"), q: texte("q"), tout: texte("tout"), nbFiltres },
    liste,
  );
  const servis = animauxServis(liste);
  const miettes = filAriane({
    animal: choix.animal, categorie: choix.categorie, q: choix.q,
    unSeulAnimal: servis.length === 1,
  });

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8", paddingBottom: 96 }}>
      <div className="max-w-5xl mx-auto">
        <EnTete
          titre="🛍️ Boutique"
          /*
           * APP 27 : « Croquettes » ne dit plus ce que la boutique vend — elle
           * sert six animaux. Le sous-titre reste NEUTRE plutôt que de les
           * nommer : les onglets le font déjà, et eux savent lesquels ont des
           * articles. Un sous-titre qui annoncerait « et petits animaux » le
           * ferait aussi le jour où il n'y en a aucun.
           *
           * « au départ de votre chien » RESTE, et c'est juste : c'est le mode
           * de remise — on retire sa commande en venant chercher son chien à la
           * pension. Une cliente qui a un chien en séjour et un lapin à la
           * maison retire bien la litière du lapin au départ du chien.
           */
          sousTitre="Alimentation, accessoires et pièces faites sur mesure. Retrait à la pension, au départ de votre chien, ou par la poste."
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
        ) : choix.niveau === 1 ? (
          <>
            <ChampRecherche q={choix.q} />
            <EncadresAnimaux encadres={encadresAnimaux(liste)} />
            {/* Le raccourci pour qui sait déjà ce qu'il cherche. Discret : il ne
                doit pas concurrencer les encadrés, qui sont le chemin normal. */}
            <p style={{ margin: "16px 0 0", textAlign: "center" }}>
              <Link href={lienCatalogue({ tout: true })} style={{ color: "#1F6E5B", fontWeight: 600 }}>
                Voir tous les articles
              </Link>
            </p>
          </>
        ) : choix.niveau === 2 && choix.animal ? (
          <>
            <FilAriane miettes={miettes} />
            <ChampRecherche q={choix.q} animal={choix.animal} />
            <EncadresRayons encadres={encadresRayons(liste, choix.animal)} />
            <p style={{ margin: "16px 0 0", textAlign: "center" }}>
              <Link
                href={lienCatalogue({ animal: choix.animal, tout: true })}
                style={{ color: "#1F6E5B", fontWeight: 600 }}
              >
                Tous les articles pour {libelleValeur("animaux", choix.animal)}
              </Link>
            </p>
          </>
        ) : (
          <>
            {/* Le fil REMPLACE les onglets : deux façons de dire où l'on est
                en diraient deux choses le jour où elles divergeraient. */}
            <FilAriane miettes={miettes} />
            <CatalogueBoutique articles={liste} rubriques={rubriques} connecte={!!clientId} />
          </>
        )}
      </div>

      <BarrePanier nombre={nombre} local={!clientId} />
    </main>
  );
}
