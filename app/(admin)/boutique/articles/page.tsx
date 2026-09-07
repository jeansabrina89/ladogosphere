import Link from "next/link";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { listerArticles, type Article } from "@/src/lib/boutique";
import {
  libelleCategorieArticle,
  formatQuantite,
  valeurStock,
  sousLeSeuil,
  urlPhotoArticle,
} from "@/src/lib/boutiqueLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import FiltresArticles from "./FiltresArticles";

export const dynamic = "force-dynamic";

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

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; categorie?: string; fournisseur?: string; seuil?: string; inactifs?: string;
  }>;
}) {
  await exigerAccesAdmin("perm_boutique");

  const params = await searchParams;
  const recherche = (params.q ?? "").trim().toLowerCase();
  const categorie = (params.categorie ?? "").trim();
  const fournisseur = (params.fournisseur ?? "").trim();
  const seulementSousSeuil = params.seuil === "1";
  const avecInactifs = params.inactifs === "1";

  const [tous, { data: fournisseurs }] = await Promise.all([
    listerArticles(),
    supabaseAdmin.from("fournisseurs").select("id, nom").eq("actif", true).order("nom"),
  ]);

  const nomFournisseur = new Map(
    (fournisseurs ?? []).map((f) => [f.id as string, f.nom as string])
  );

  const correspond = (a: Article) => {
    if (!avecInactifs && !a.actif) return false;
    if (categorie && a.categorie !== categorie) return false;
    if (fournisseur && a.fournisseur_id !== fournisseur) return false;
    if (seulementSousSeuil && !sousLeSeuil(a)) return false;
    if (!recherche) return true;
    const cible = `${a.nom} ${a.reference} ${a.marque ?? ""} ${a.code_barres ?? ""}`.toLowerCase();
    return cible.includes(recherche);
  };
  const articles = tous.filter(correspond);

  const actifs = tous.filter((a) => a.actif);
  const nbSousSeuil = actifs.filter(sousLeSeuil).length;
  const valeur = valeurStock(actifs);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-6xl mx-auto">
        <EnTete
          titre="🛒 Boutique"
          sousTitre={`${articles.length} article${articles.length > 1 ? "s" : ""} affiché${articles.length > 1 ? "s" : ""}`}
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href="/boutique/articles/nouveau" variante="principal">+ Article</Bouton>
              <Bouton href="/boutique/inventaire" variante="secondaire">📦 Inventaire</Bouton>
            </div>
          }
        />

        <div
          className="grid gap-4 mb-6"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
        >
          <Tuile titre="Articles actifs" valeur={String(actifs.length)} couleur={marine} />
          <Tuile
            titre="Sous le seuil"
            valeur={String(nbSousSeuil)}
            couleur={nbSousSeuil > 0 ? "#A8453A" : "#1F6E5B"}
            href="/boutique/articles?seuil=1"
          />
          <Tuile titre="Valeur du stock au prix d'achat" valeur={chf(valeur)} couleur={marine} />
        </div>

        <FiltresArticles fournisseurs={(fournisseurs ?? []) as { id: string; nom: string }[]} />

        {articles.length === 0 ? (
          <Carte>
            <EtatVide
              icone="🛒"
              titre="Aucun article"
              message="Aucun article ne correspond à cette recherche."
            />
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
                    <th className="py-2 font-medium">Article</th>
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
                          <span style={{ display: "block", fontSize: 12, color: sousTexte }}>
                            {a.marque ?? ""}
                            {a.marque && a.fournisseur_id ? " · " : ""}
                            {a.fournisseur_id ? (nomFournisseur.get(a.fournisseur_id) ?? "") : ""}
                            {!a.actif && " · retiré de la vente"}
                          </span>
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
