"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { urlPhotoArticle, libelleCategorieArticle, ordreCategorie } from "@/src/lib/boutiqueLogique";
import { disponibilite } from "@/src/lib/venteEnLigneLogique";
import { ajouterAuPanier } from "./actions";

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
  stock_disponible: number;
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
  connecte,
}: {
  articles: ArticleVitrine[];
  connecte: boolean;
}) {
  const router = useRouter();
  const [recherche, setRecherche] = useState("");
  const [categorie, setCategorie] = useState("");
  const [enCours, setEnCours] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const categories = [...new Set(articles.map((a) => a.categorie))]
    .sort((a, b) => ordreCategorie(a) - ordreCategorie(b));

  const q = recherche.trim().toLowerCase();
  const visibles = articles
    .filter((a) => !categorie || a.categorie === categorie)
    .filter((a) => !q || `${a.nom} ${a.marque ?? ""} ${a.description ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => ordreCategorie(a.categorie) - ordreCategorie(b.categorie) || a.nom.localeCompare(b.nom));

  async function ajouter(a: ArticleVitrine) {
    if (!connecte) {
      router.push("/login?suite=/mon-compte/boutique");
      return;
    }
    setEnCours(a.id);
    const res = await ajouterAuPanier(a.id, 1);
    setEnCours(null);
    setErreur(res.error ?? null);
    setAvis(res.error ? null : res.message ?? null);
    if (!res.error) router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {erreur && (
        <p role="alert" style={{ color: GRENAT, fontSize: 15, margin: 0, fontWeight: 600 }}>{erreur}</p>
      )}
      {avis && (
        <p role="status" style={{ color: VERT, fontSize: 15, margin: 0, fontWeight: 600 }}>{avis}</p>
      )}

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Chercher un article…"
          aria-label="Chercher un article"
          style={champ}
        />
        <select
          value={categorie}
          onChange={(e) => setCategorie(e.target.value)}
          aria-label="Filtrer par catégorie"
          style={champ}
        >
          <option value="">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{libelleCategorieArticle(c)}</option>
          ))}
        </select>
      </div>

      {visibles.length === 0 ? (
        <p style={{ color: SOUS, fontSize: 15, margin: 0 }}>
          Aucun article ne correspond à votre recherche.
        </p>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {visibles.map((a) => {
            const url = urlPhotoArticle(a.photo_path);
            const dispo = disponibilite(a.stock_disponible, a.type_article);
            const surMesure = a.type_article === "personnalisable";
            const couleurDispo =
              dispo.etat === "epuise" ? SOUS : dispo.etat === "dernier" ? "#8A5A1F" : VERT;

            return (
              <article
                key={a.id}
                style={{
                  border: BORDURE, borderRadius: 16, backgroundColor: "#FFFFFF",
                  padding: 14, display: "flex", flexDirection: "column", gap: 8,
                }}
              >
                <Link href={`/mon-compte/boutique/${a.id}`} style={{ textDecoration: "none" }}>
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
                  <Link href={`/mon-compte/boutique/${a.id}`}
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
                  {surMesure ? "dès " : ""}{Number(a.prix_vente).toFixed(2)} CHF
                  <span style={{ color: SOUS, fontSize: 13, fontWeight: 400 }}> TTC</span>
                </p>

                <p style={{ color: couleurDispo, fontSize: 14, fontWeight: 600, margin: 0 }}>
                  {dispo.libelle}
                </p>

                {surMesure ? (
                  <Link
                    href={`/mon-compte/boutique/${a.id}`}
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
          })}
        </div>
      )}
    </div>
  );
}
