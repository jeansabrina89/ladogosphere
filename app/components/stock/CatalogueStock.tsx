import Link from "next/link";
import type { Article } from "@/src/lib/boutique";
import {
  libelleCategorieArticle,
  formatQuantite,
  valeurStock,
  sousLeSeuil,
  urlPhotoArticle,
} from "@/src/lib/boutiqueLogique";
import { configPerimetre, type PerimetreStock } from "@/src/lib/perimetreStock";
import {
  compterParStatut,
  infoStatutVitrine,
  libelleCompteBrouillons,
  mentionPublicationProgrammee,
} from "@/src/lib/statutVitrineLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import EtatVide from "@/app/components/ui/EtatVide";
import FiltresArticles from "./FiltresArticles";

/**
 * Le catalogue d'un périmètre de stock : les articles du magasin, ou les
 * fournitures de l'atelier.
 *
 * Un seul écran, PARAMÉTRÉ. Les deux listes n'ont jamais été deux écrans
 * différents : c'est le même tableau, le même filtre, la même vignette — seul
 * change ce qu'on y met, et la page appelante l'a déjà filtré côté serveur.
 *
 * Le composant ne lit rien : on lui donne ce qu'il montre. C'est la page qui
 * porte la garde d'accès, et qui décide du niveau.
 */

const chf = (n: number) => `${n.toFixed(2)} CHF`;

const marine = "#1B2B5E";
const sousTexte = "rgba(27,43,94,0.55)";
const bordure = "1px solid rgba(27,43,94,0.12)";

function Tuile({ titre, valeur, couleur, href }: {
  titre: string; valeur: string; couleur: string; href?: string;
}) {
  const contenu = (
    <Carte>
      <p style={{ color: sousTexte, fontSize: 13, margin: 0 }}>{titre}</p>
      <p style={{ color: couleur, fontSize: 24, fontWeight: 700, margin: "4px 0 0" }}>{valeur}</p>
    </Carte>
  );
  return href ? <Link href={href} style={{ textDecoration: "none" }}>{contenu}</Link> : contenu;
}

/** Vignette : la photo si elle existe, sinon la première lettre du nom. */
function Vignette({ article }: { article: Article }) {
  const url = urlPhotoArticle(article.photo_path);
  const taille = 44;
  if (!url) {
    return (
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: taille, height: taille, borderRadius: 10,
          backgroundColor: "#EDE8DF", color: sousTexte, fontWeight: 700, fontSize: 16,
        }}
      >
        {article.nom.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    // Photo servie par le bucket public de la boutique — pas d'optimisation à faire.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={taille}
      height={taille}
      style={{ width: taille, height: taille, objectFit: "cover", borderRadius: 10, border: bordure }}
    />
  );
}

/**
 * La pastille de statut. « Publié » ne se marque pas : c'est le cas ordinaire,
 * et une liste où chaque ligne porte un badge ne se lit plus.
 */
function Pastille({ statut, actif }: { statut?: string | null; actif?: boolean | null }) {
  if (actif === false) return null;
  const info = infoStatutVitrine(statut);
  if (info.valeur === "publie") return null;
  return (
    <span style={{
      display: "inline-block", marginLeft: 8, padding: "1px 8px", borderRadius: 999,
      fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap",
      color: info.couleur, backgroundColor: info.fond,
    }}>
      {info.pastille}
    </span>
  );
}

export default function CatalogueStock({
  perimetre,
  articles,
  tous,
  fournisseurs,
  gestion,
  actions,
}: {
  perimetre: PerimetreStock;
  /** Ce qui reste après les filtres de l'écran. */
  articles: Article[];
  /** Tout le périmètre, pour les tuiles de tête. */
  tous: Article[];
  fournisseurs: { id: string; nom: string }[];
  /** Le prix d'achat et la valeur du stock ne s'affichent qu'en gestion. */
  gestion: boolean;
  /** Les boutons de l'en-tête, décidés par la page. */
  actions?: React.ReactNode;
}) {
  const config = configPerimetre(perimetre);

  const nomFournisseur = new Map(fournisseurs.map((f) => [f.id, f.nom]));

  const actifs = tous.filter((a) => a.actif);
  const nbSousSeuil = actifs.filter(sousLeSeuil).length;
  const valeur = gestion ? valeurStock(actifs) : 0;
  // Un brouillon prêt qu'on a oublié de publier ne se voit nulle part : la
  // tuile le rappelle, et un clic ouvre la liste filtrée.
  const parStatut = compterParStatut(actifs);
  const brouillons = libelleCompteBrouillons(parStatut.brouillon);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-6xl mx-auto" style={{ minWidth: 0 }}>
        <EnTete
          titre={config.titreListe}
          sousTitre={config.affiches(articles.length)}
          action={actions}
        />

        <div
          className="grid gap-4 mb-6"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", minWidth: 0 }}
        >
          <Tuile titre={config.tuileActifs} valeur={String(actifs.length)} couleur={marine} />
          <Tuile
            titre="Sous le seuil"
            valeur={String(nbSousSeuil)}
            couleur={nbSousSeuil > 0 ? "#A8453A" : "#1F6E5B"}
            href={`${config.liste}?seuil=1`}
          />
          {brouillons && (
            <Tuile
              titre="En préparation"
              valeur={brouillons}
              couleur="#6E5410"
              href={`${config.liste}?statut=brouillon`}
            />
          )}
          {/* La valeur du stock se calcule au prix d'achat : elle n'est même
              pas calculée sans la gestion. */}
          {gestion && (
            <Tuile titre="Valeur du stock au prix d'achat" valeur={chf(valeur)} couleur={marine} />
          )}
        </div>

        <FiltresArticles
          fournisseurs={fournisseurs}
          libelleRetires={config.libelleRetires}
        />

        {articles.length === 0 ? (
          <Carte>
            <EtatVide icone={config.icone} titre={config.videTitre} message={config.videMessage} />
          </Carte>
        ) : (
          <Carte>
            {/* Le tableau défile dans son conteneur : la page, elle, ne part jamais de travers. */}
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: 720, fontSize: 15 }}>
                <thead>
                  <tr style={{ color: sousTexte, textAlign: "left" }}>
                    <th className="py-2 font-medium" style={{ width: 56 }}>&nbsp;</th>
                    <th className="py-2 font-medium">Référence</th>
                    <th className="py-2 font-medium">{config.colonneNom}</th>
                    <th className="py-2 font-medium">Catégorie</th>
                    <th className="py-2 font-medium text-right">Prix TTC</th>
                    <th className="py-2 font-medium text-right">Taux</th>
                    <th className="py-2 font-medium text-right">Stock</th>
                    <th className="py-2 font-medium text-right">Seuil</th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((a) => {
                    const alerte = sousLeSeuil(a);
                    return (
                      <tr key={a.id} style={{ borderTop: bordure }}>
                        <td className="py-2"><Vignette article={a} /></td>
                        <td className="py-2" style={{ color: sousTexte, whiteSpace: "nowrap" }}>
                          {a.reference}
                        </td>
                        <td className="py-2">
                          <Link
                            href={`/boutique/articles/${a.id}`}
                            style={{ color: marine, fontWeight: 700 }}
                          >
                            {a.nom}
                          </Link>
                          {/* La pastille dit ce que l'article MONTRE ; la
                              mention « retiré » dit s'il existe encore. Deux
                              questions différentes, deux marques différentes. */}
                          <Pastille statut={a.statut_vitrine} actif={a.actif} />
                          <span style={{ display: "block", fontSize: 12, color: sousTexte }}>
                            {a.marque ?? ""}
                            {a.marque && a.fournisseur_id ? " · " : ""}
                            {a.fournisseur_id ? (nomFournisseur.get(a.fournisseur_id) ?? "") : ""}
                            {!a.actif && config.mentionRetire}
                          </span>
                          {mentionPublicationProgrammee(a) && (
                            <span style={{ display: "block", fontSize: 12, color: "#6E5410" }}>
                              {mentionPublicationProgrammee(a)}
                            </span>
                          )}
                        </td>
                        <td className="py-2" style={{ color: sousTexte }}>
                          {libelleCategorieArticle(a.categorie)}
                        </td>
                        <td className="py-2 text-right" style={{ color: marine, fontWeight: 600, whiteSpace: "nowrap" }}>
                          {chf(Number(a.prix_vente))}
                        </td>
                        <td className="py-2 text-right" style={{ color: sousTexte, whiteSpace: "nowrap" }}>
                          {Number(a.taux_tva).toString().replace(".", ",")} %
                        </td>
                        <td
                          className="py-2 text-right"
                          style={{ color: alerte ? "#A8453A" : marine, fontWeight: 700, whiteSpace: "nowrap" }}
                        >
                          {alerte && "⚠️ "}
                          {formatQuantite(a.stock_actuel)} {a.unite}
                        </td>
                        <td className="py-2 text-right" style={{ color: sousTexte }}>
                          {Number(a.stock_alerte ?? 0) > 0 ? formatQuantite(a.stock_alerte) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Carte>
        )}
      </div>
    </main>
  );
}
