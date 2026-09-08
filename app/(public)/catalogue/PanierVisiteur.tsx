"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { urlPhotoArticle } from "@/src/lib/boutiqueLogique";
import { brutAuServeur, changerQuantite, ecouter, lireBrut, retirer } from "./panierNavigateur";
import { lirePanierLocal } from "@/src/lib/panierLocalLogique";

/**
 * Le panier d'un visiteur sans compte.
 *
 * Il vit dans son navigateur. Rien n'est réservé, et on le DIT — c'est ce qui
 * évite la déception de trouver l'article parti trois jours plus tard.
 *
 * Le bouton de validation mène à la connexion, pas à une commande : c'est là,
 * et seulement là, que le compte devient nécessaire.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const VERT = "#1F6E5B";
const BORDURE = "1px solid rgba(27,43,94,0.12)";
const CIBLE = 44;

export type ArticlePanier = {
  id: string;
  nom: string;
  prix_vente: number;
  photo_path: string | null;
  type_article: string;
  en_stock: boolean;
};

const chf = (n: number) => `${n.toFixed(2)} CHF`;

export default function PanierVisiteur({ articles }: { articles: ArticlePanier[] }) {
  // Le navigateur est la source : on s'y abonne plutôt que de le recopier dans
  // un état. `null` tant que le serveur rend — il ne peut pas le savoir.
  const brut = useSyncExternalStore(ecouter, lireBrut, brutAuServeur);
  const panier = useMemo(() => lirePanierLocal(brut ?? ""), [brut]);
  const charge = brut !== null;

  const parId = new Map(articles.map((a) => [a.id, a]));

  // Ce qui n'est plus proposé est nommé, pas glissé en silence.
  const vivantes = panier.lignes
    .map((l, index) => ({ ligne: l, index, article: parId.get(l.article_id) ?? null }))
    .filter((x) => x.article !== null);
  const disparues = panier.lignes.filter((l) => !parId.has(l.article_id)).length;

  const total = vivantes.reduce(
    (s, x) => s + x.ligne.quantite * Number(x.article!.prix_vente), 0
  );

  if (!charge) {
    return <p style={{ color: SOUS, fontSize: 15, margin: 0 }}>Un instant…</p>;
  }

  if (vivantes.length === 0) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <p style={{ color: SOUS, fontSize: 15, margin: 0 }}>
          Votre panier est vide.
          {disparues > 0 && " Les articles qu'il contenait ne sont plus proposés."}
        </p>
        <Link href="/catalogue" style={{ color: VERT, fontWeight: 700 }}>
          ← Retour à la boutique
        </Link>
      </div>
    );
  }

  const rond: React.CSSProperties = {
    width: CIBLE, height: CIBLE, flexShrink: 0, borderRadius: 12, border: BORDURE,
    backgroundColor: "#FFFFFF", color: MARINE, fontSize: 20, fontWeight: 700,
    fontFamily: "inherit", cursor: "pointer", lineHeight: 1,
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {disparues > 0 && (
        <p role="status" style={{
          backgroundColor: "#F4EAC9", color: "#6E5410", border: "1px solid #C9A84C",
          borderRadius: 12, padding: "10px 12px", fontSize: 14.5, fontWeight: 600, margin: 0,
        }}>
          {disparues === 1
            ? "Un article n'est plus proposé : il a été retiré de votre panier."
            : `${disparues} articles ne sont plus proposés : ils ont été retirés de votre panier.`}
        </p>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
        {vivantes.map(({ ligne, index, article }) => {
          const a = article!;
          const url = urlPhotoArticle(a.photo_path);
          const surMesure = !!(ligne.configuration && ligne.configuration.length > 0);
          return (
            <li key={`${ligne.article_id}-${index}`} style={{
              display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
              border: BORDURE, borderRadius: 14, padding: 12, minWidth: 0,
            }}>
              {url ? (
                <Image src={url} alt="" width={64} height={64} unoptimized
                  style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, flex: "0 0 auto" }} />
              ) : (
                <span aria-hidden style={{
                  width: 64, height: 64, borderRadius: 10, backgroundColor: "#EDE8DF", flex: "0 0 auto",
                }} />
              )}

              <span style={{ flex: "1 1 160px", minWidth: 0 }}>
                <Link href={`/catalogue/${a.id}`} style={{
                  color: MARINE, fontWeight: 700, textDecoration: "none", overflowWrap: "anywhere",
                }}>
                  {a.nom}{surMesure ? " — sur mesure" : ""}
                </Link>
                <span style={{ display: "block", color: SOUS, fontSize: 14 }}>
                  {chf(Number(a.prix_vente))}
                  {!a.en_stock && a.type_article !== "personnalisable" && " · épuisé pour l'instant"}
                </span>
              </span>

              {surMesure ? (
                <span style={{ color: SOUS, fontSize: 14, flex: "0 0 auto" }}>1 pièce</span>
              ) : (
                <span style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
                  <button type="button" style={rond} aria-label={`Un ${a.nom} de moins`}
                    onClick={() => changerQuantite(index, ligne.quantite - 1)}>−</button>
                  <span aria-live="polite" style={{
                    minWidth: 32, textAlign: "center", color: MARINE, fontSize: 17, fontWeight: 700,
                  }}>
                    {ligne.quantite}
                  </span>
                  <button type="button" style={rond} aria-label={`Un ${a.nom} de plus`}
                    onClick={() => changerQuantite(index, ligne.quantite + 1)}>+</button>
                </span>
              )}

              <button type="button"
                onClick={() => retirer(index)}
                aria-label={`Retirer ${a.nom} du panier`}
                style={{
                  minHeight: CIBLE, padding: "0 14px", borderRadius: 12, border: BORDURE,
                  backgroundColor: "#FFFFFF", color: "#A8453A", fontSize: 14, fontWeight: 600,
                  fontFamily: "inherit", cursor: "pointer", flex: "0 0 auto",
                }}>
                Retirer
              </button>
            </li>
          );
        })}
      </ul>

      <p style={{ color: MARINE, fontSize: 20, fontWeight: 700, margin: 0, textAlign: "right" }}>
        Total indicatif : {chf(total)}
      </p>
      <p style={{ color: SOUS, fontSize: 13.5, margin: 0, textAlign: "right" }}>
        Les frais de remise et la remise membre se calculent à l&apos;étape suivante.
      </p>

      {/* Rien n'est mis de côté : le dire ici évite la déception plus tard. */}
      <p style={{
        backgroundColor: "#FBF9F5", border: BORDURE, borderRadius: 12,
        padding: "10px 12px", color: SOUS, fontSize: 14, margin: 0,
      }}>
        Votre panier est gardé dans ce navigateur. Rien n&apos;est réservé : les
        articles partent au premier qui commande.
      </p>

      <Link
        href="/login?suite=/catalogue/panier"
        style={{
          minHeight: CIBLE + 8, borderRadius: 14, backgroundColor: VERT, color: "#FFFFFF",
          fontSize: 17, fontWeight: 700, textDecoration: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        Valider ma commande
      </Link>
      <p style={{ color: SOUS, fontSize: 14, margin: 0, textAlign: "center" }}>
        La connexion est demandée maintenant. Votre panier vous y suit.
      </p>
    </div>
  );
}
