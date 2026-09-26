"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { urlPhotoArticle, libelleCategorieArticle, ordreCategorie } from "@/src/lib/boutiqueLogique";
import {
  depuisParams,
  filtrer,
  filtresAffiches,
  nombreFiltresActifs,
  ongletsAnimaux,
  ongletRetenu,
  versParams,
  type ArticleFiltrable,
  type Filtres,
} from "@/src/lib/filtresCatalogueLogique";
import FiltresCatalogue from "./FiltresCatalogue";
import {
  disponibilite,
  disponibiliteVitrine,
  phraseDelaiCommande,
} from "@/src/lib/venteEnLigneLogique";
import { ajouterAuPanier } from "./actions";
import { ajouter as ajouterLocalement } from "./panierNavigateur";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const VERT = "#1F6E5B";
const GRENAT = "#8A1F1F";
const BORDURE = "1px solid rgba(27,43,94,0.12)";
const CIBLE = 44;

export type ArticleVitrine = {
  id: string;
  nom: string;
  description: string | null;
  categorie: string;
  marque: string | null;
  prix_vente: number;
  photo_path: string | null;
  type_article: string;
  delai_fabrication_jours: number | null;
  /**
   * Renseigné pour un client CONNECTÉ seulement : il a droit au « Plus que 2 »
   * qui l'aide à se décider. Un visiteur n'a que le booléen — le nombre ne
   * quitte pas la base pour lui.
   */
  stock_disponible?: number | null;
  /** La disponibilité en deux mots, pour un visiteur sans compte. */
  en_stock?: boolean;
  /* APP 26 : ce qui s'achète même à stock zéro, et sous quel délai. La vue
     a déjà tranché : `sur_commande` vaut coché ET délai connu. */
  sur_commande?: boolean | null;
  delai_commande_min_jours?: number | null;
  delai_commande_max_jours?: number | null;
  /**
   * Ce qu'il paie vraiment, calculé au serveur par la fonction unique. Le prix
   * BARRÉ est `prix_vente`, le prix de base réel de l'article — jamais un
   * « prix habituel » fabriqué pour grossir la remise.
   */
  prix_final: number;
  remise_libelle: string | null;
  /** « À écouler avant le 12 octobre », quand la rubrique le justifie. */
  mention_date_limite?: string | null;
  /* Les étiquettes (APP 24-FILTRES) : ce sont les filtres eux-mêmes. Toutes
     publiques — ce sont les colonnes de la vue `articles_vitrine`. */
  expediable?: boolean | null;
  /* APP 27 : pour QUI l'article est fait. C'est ce qui le range dans un
     onglet — sans cette colonne, il n'y a pas d'onglets. */
  animaux?: string[] | null;
  especes?: string[] | null;
  types_soin?: string[] | null;
  ages?: string[] | null;
  besoins?: string[] | null;
  tailles_chien?: string[] | null;
  gouts?: string[] | null;
  proteines?: string[] | null;
  couleurs?: string[] | null;
  matieres?: string[] | null;
  usages_jouet?: string[] | null;
  sans_cereales?: boolean | null;
  monoproteine?: boolean | null;
  taille_article?: string | null;
};

export type RubriqueAffichee = {
  id: string;
  nom: string;
  type: string;
  texte: string | null;
  articles: ArticleVitrine[];
};

const champ: React.CSSProperties = {
  width: "100%", minHeight: CIBLE + 4, padding: "12px 14px", border: BORDURE,
  borderRadius: 14, fontSize: 16, color: MARINE, backgroundColor: "#FFFFFF",
  fontFamily: "inherit", boxSizing: "border-box",
};

/**
 * Le catalogue en ligne.
 *
 * La disponibilité est dite en toutes lettres, jamais chiffrée au-delà de
 * trois : « Plus que 2 » aide le client à se décider, « 47 en stock »
 * renseigne un concurrent et ne sert à personne.
 *
 * Un article personnalisable ne s'ajoute pas d'un bouton : il ouvre le
 * configurateur, qui décide de son prix.
 */
export default function CatalogueBoutique({
  articles,
  rubriques = [],
  connecte,
}: {
  articles: ArticleVitrine[];
  /**
   * Les rubriques à montrer, déjà filtrées au serveur : actives, en période,
   * et qui portent au moins un article publié. Une rubrique vide n'arrive pas
   * jusqu'ici — un rayon vide ne se met pas en vitrine.
   */
  rubriques?: RubriqueAffichee[];
  connecte: boolean;
}) {
  const router = useRouter();
  const [recherche, setRecherche] = useState("");
  const [enCours, setEnCours] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  /**
   * Les filtres vivent dans l'ADRESSE : un lien filtré se partage, le retour
   * arrière refait le chemin en sens inverse, et un rechargement ne perd
   * rien. `pushState` met l'adresse à jour sans repasser par le serveur —
   * Next le reconnaît et `useSearchParams` suit.
   */
  const params = useSearchParams();
  const demandes = useMemo(() => depuisParams(params), [params]);

  function appliquer(suivants: Filtres) {
    const qs = versParams(suivants).toString();
    window.history.pushState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  // Le filtrage se fait sur la liste DÉJÀ chargée : elle tient en une page,
  // tout y est déjà affiché, et les comptes par valeur ont de toute façon
  // besoin de l'ensemble. Aucune donnée de plus ne descend au navigateur.
  const filtrables = articles as unknown as ArticleFiltrable[];

  /*
   * LES ONGLETS D'ANIMAL (APP 27).
   *
   * Un onglet n'existe que s'il a au moins un article, et il n'y en a AUCUN tant
   * qu'un seul animal est servi — la règle vit dans « ongletsAnimaux », pas ici.
   *
   * « ongletRetenu » traite le lien périmé : un signet vers « Rongeurs » dont le
   * dernier article vient d'être désactivé ramène à « Tous », sans erreur et sans
   * grille vide. On ne corrige pas l'adresse pour autant — la cliente n'a pas à
   * voir son lien réécrit sous ses yeux ; elle voit simplement la boutique.
   */
  const filtres = useMemo(
    () => ({ ...demandes, animal: ongletRetenu(filtrables, demandes.animal) }),
    [demandes, filtrables]
  );
  /*
   * La barre reçoit l'onglet RETENU, pas celui demandé.
   *
   * Un lien vers « Furets » sans article affiche toute la boutique — il faut donc
   * que « Tous » se marque actif, sinon la cliente voit tous les articles avec
   * aucun onglet allumé, et ne sait plus où elle est. Passer l'onglet demandé
   * n'allumait rien du tout : c'est un test d'écran qui l'a relevé.
   */
  const onglets = ongletsAnimaux(filtrables, filtres.animal);

  const retenus = filtrer(filtrables, filtres) as unknown as ArticleVitrine[];
  const affiches = filtresAffiches(filtrables, filtres);

  const q = recherche.trim().toLowerCase();
  const visibles = retenus
    .filter((a) => !q || `${a.nom} ${a.marque ?? ""} ${a.description ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => ordreCategorie(a.categorie) - ordreCategorie(b.categorie) || a.nom.localeCompare(b.nom));

  // Les rubriques sont une VITRINE : elles ne répondent pas aux filtres. Dès
  // qu'on filtre ou qu'on cherche, elles s'effacent — une rubrique qui
  // montrerait des articles écartés par le filtre ferait douter du filtre.
  const rubriquesVisibles = nombreFiltresActifs(filtres) === 0 && q === "" ? rubriques : [];

  async function ajouter(a: ArticleVitrine) {
    // Sans compte, le panier vit dans le navigateur : rien ne part en base,
    // et surtout aucun stock n'est réservé. La connexion viendra à la
    // validation, pas avant.
    if (!connecte) {
      ajouterLocalement({ article_id: a.id, quantite: 1 });
      setErreur(null);
      setAvis(`« ${a.nom} » ajouté à votre panier.`);
      return;
    }
    setEnCours(a.id);
    const res = await ajouterAuPanier(a.id, 1);
    setEnCours(null);
    setErreur(res.error ?? null);
    setAvis(res.error ? null : res.message ?? null);
    if (!res.error) router.refresh();
  }

  /** Une carte d'article. La même partout : grille et rubriques. */
  function Carte({ a }: { a: ArticleVitrine }) {
    const url = urlPhotoArticle(a.photo_path);
    // Connecté : le compte exact. Visiteur : deux mots, pas un chiffre.
    const dispo = connecte
      ? disponibilite(a.stock_disponible, a.type_article, a)
      : disponibiliteVitrine(a.en_stock, a.type_article, a);
    // Le délai ne s'affiche QUE s'il change quelque chose : un article en rayon
    // part aujourd'hui, et lui coller « livré sous 8 jours » ferait hésiter
    // pour rien.
    const delai = dispo.etat === "sur_commande" ? phraseDelaiCommande(a) : null;
    const surMesure = a.type_article === "personnalisable";
    const couleurDispo =
      dispo.etat === "epuise" ? SOUS
      : dispo.etat === "dernier" || dispo.etat === "sur_commande" ? "#8A5A1F"
      : VERT;
    // Le prix barré est le prix de base RÉEL, celui pratiqué hors action.
    const remise = !surMesure && a.prix_final < Number(a.prix_vente);

    return (
      <article
        style={{
          border: BORDURE, borderRadius: 16, backgroundColor: "#FFFFFF",
          padding: 14, display: "flex", flexDirection: "column", gap: 8,
        }}
      >
        <Link href={`/catalogue/${a.id}`} style={{ textDecoration: "none" }}>
          {url ? (
            /* Photo du bucket public de la boutique. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={url} alt={a.nom} style={{
              width: "100%", height: 160, objectFit: "cover",
              borderRadius: 12, border: BORDURE,
            }} />
          ) : (
            <div style={{
              width: "100%", height: 160, borderRadius: 12,
              backgroundColor: "#EDE8DF", display: "flex",
              alignItems: "center", justifyContent: "center", color: SOUS, fontSize: 14,
            }}>
              Pas encore de photo
            </div>
          )}
        </Link>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/catalogue/${a.id}`}
            style={{
              color: MARINE, fontSize: 17, fontWeight: 700,
              textDecoration: "none", overflowWrap: "anywhere",
            }}>
            {a.nom}
          </Link>
          <p style={{ color: SOUS, fontSize: 13, margin: "2px 0 0" }}>
            {libelleCategorieArticle(a.categorie)}
            {a.marque ? ` · ${a.marque}` : ""}
          </p>
        </div>

        <p style={{ color: MARINE, fontSize: 18, fontWeight: 700, margin: 0 }}>
          {remise && (
            <span style={{ color: SOUS, fontSize: 15, fontWeight: 500, textDecoration: "line-through", marginRight: 8 }}>
              {Number(a.prix_vente).toFixed(2)}
            </span>
          )}
          {surMesure ? "dès " : ""}{(surMesure ? Number(a.prix_vente) : a.prix_final).toFixed(2)} CHF
          <span style={{ color: SOUS, fontSize: 13, fontWeight: 400 }}> TTC</span>
        </p>

        {a.remise_libelle && (
          <p style={{ color: VERT, fontSize: 14, fontWeight: 700, margin: 0 }}>{a.remise_libelle}</p>
        )}
        {a.mention_date_limite && (
          <p style={{ color: "#8A5A1F", fontSize: 13.5, fontWeight: 600, margin: 0 }}>
            {a.mention_date_limite}
          </p>
        )}

        <p style={{ color: couleurDispo, fontSize: 14, fontWeight: 600, margin: 0 }}>
          {dispo.libelle}
        </p>

        {/* La condition posée par Sabrina : le délai se lit AVANT d'acheter,
            sur la carte, pas au moment de payer. */}
        {delai && (
          <p style={{ color: SOUS, fontSize: 13.5, margin: 0 }}>{delai}</p>
        )}

        {surMesure ? (
          <Link
            href={`/catalogue/${a.id}`}
            style={{
              minHeight: CIBLE, display: "flex", alignItems: "center",
              justifyContent: "center", borderRadius: 12, border: "none",
              backgroundColor: VERT, color: "#FFFFFF", fontSize: 16, fontWeight: 700,
              textDecoration: "none",
            }}
          >
            🎨 Composer
          </Link>
        ) : (
          <button
            type="button"
            disabled={dispo.etat === "epuise" || enCours === a.id}
            onClick={() => ajouter(a)}
            style={{
              minHeight: CIBLE, borderRadius: 12, border: "none",
              backgroundColor: dispo.etat === "epuise" ? "#C9CEDB" : VERT,
              color: "#FFFFFF", fontSize: 16, fontWeight: 700, fontFamily: "inherit",
              cursor: dispo.etat === "epuise" ? "not-allowed" : "pointer",
            }}
          >
            {enCours === a.id ? "…" : dispo.etat === "epuise" ? "Épuisé" : "🛒 Ajouter"}
          </button>
        )}
      </article>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {erreur && (
        <p role="alert" style={{ color: GRENAT, fontSize: 15, margin: 0, fontWeight: 600 }}>{erreur}</p>
      )}
      {avis && (
        <p role="status" style={{ color: VERT, fontSize: 15, margin: 0, fontWeight: 600 }}>{avis}</p>
      )}

      {/* Les rubriques d'abord : c'est ce qu'on met en vitrine. Elles ne
          filtrent rien — la grille complète reste dessous. */}
      {rubriquesVisibles.map((r) => (
        <section key={r.id} style={{ display: "grid", gap: 10 }}>
          <div>
            <h2 style={{ color: MARINE, fontSize: 20, fontWeight: 700, margin: 0 }}>{r.nom}</h2>
            {r.texte && (
              <p style={{ color: SOUS, fontSize: 14.5, margin: "2px 0 0" }}>{r.texte}</p>
            )}
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {r.articles.map((a) => <Carte key={`${r.id}-${a.id}`} a={a} />)}
          </div>
        </section>
      ))}

      <input
        type="search"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Chercher un article…"
        aria-label="Chercher un article"
        style={champ}
      />

      {/*
        * Les onglets d'animal. Sur téléphone ils DÉFILENT horizontalement :
        * six onglets plus « Tous » ne tiennent pas sur 375 px, et les replier
        * sur deux lignes ferait sauter la grille d'un demi-écran. Le conteneur
        * porte donc « overflow-x: auto » et les onglets « flex-shrink: 0 » —
        * sans le second, ils se compriment au lieu de défiler, et la page prend
        * une barre horizontale. Vérifié à 375 px.
        */}
      {onglets.length > 0 && (
        <nav
          aria-label="Choisir un animal"
          style={{
            display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4,
            // Le défilement reste DANS la barre : la page, elle, ne bouge pas.
            scrollbarWidth: "thin", WebkitOverflowScrolling: "touch",
          }}
        >
          {onglets.map((o) => (
            <button
              key={o.valeur ?? "tous"}
              type="button"
              aria-pressed={o.actif}
              onClick={() => appliquer({ ...filtres, animal: o.valeur })}
              style={{
                flexShrink: 0,
                minHeight: CIBLE,
                padding: "8px 16px",
                borderRadius: 999,
                border: o.actif ? "1px solid #C9A84C" : BORDURE,
                background: o.actif ? "#F4EAC9" : "#FFFFFF",
                color: o.actif ? "#6E5410" : MARINE,
                fontSize: 15,
                fontWeight: o.actif ? 700 : 500,
                fontFamily: "inherit",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {o.libelle}{" "}
              <span style={{ color: o.actif ? "#6E5410" : SOUS, fontWeight: 500 }}>
                ({o.nombre})
              </span>
            </button>
          ))}
        </nav>
      )}

      {/* Le panneau à gauche sur écran large, un bouton plein écran sur
          téléphone — c'est le composant qui s'en charge. */}
      <div className="grid gap-6 md:grid-cols-[260px_1fr] md:items-start">
        <FiltresCatalogue
          filtres={filtres}
          affiches={affiches}
          nombreResultats={visibles.length}
          surChangement={appliquer}
        />

        {visibles.length === 0 ? (
          <p style={{ color: SOUS, fontSize: 15, margin: 0 }}>
            Aucun article ne correspond à votre recherche.
          </p>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {visibles.map((a) => <Carte key={a.id} a={a} />)}
          </div>
        )}
      </div>
    </div>
  );
}
