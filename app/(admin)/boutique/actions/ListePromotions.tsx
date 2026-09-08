"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { changerEtatRubrique, copierRubrique } from "./actionsPromotions";
import {
  enPeriode,
  formatPourcentage,
  libelleTypePromotion,
  type Promotion,
} from "@/src/lib/prixLogique";
import { formatDateFR } from "@/src/lib/dates";

/**
 * Les rubriques, en cours d'abord.
 *
 * Une rubrique passée n'est jamais supprimée : elle se désactive et reste
 * consultable. Sa ligne dit ce qu'elle était, sa période et combien d'articles
 * elle portait — c'est ce qui permet d'expliquer un ticket l'année suivante.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const VERT = "#1F6E5B";
const GRENAT = "#8A1F1F";
const BORDURE = "1px solid rgba(27,43,94,0.12)";

const bouton: React.CSSProperties = {
  minHeight: 40, padding: "0 14px", borderRadius: 12, border: BORDURE,
  backgroundColor: "#FFFFFF", color: MARINE, fontSize: 14, fontWeight: 600,
  fontFamily: "inherit", cursor: "pointer",
};

export type RubriqueAffichee = Promotion & { nbArticles: number };

export default function ListePromotions({
  rubriques,
  aujourdhui,
}: {
  rubriques: RubriqueAffichee[];
  aujourdhui: string;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function basculer(r: RubriqueAffichee) {
    setEnCours(r.id);
    const res = await changerEtatRubrique(r.id, !r.actif);
    setEnCours(null);
    setErreur(res.error ?? null);
    setAvis(res.message ?? null);
    if (!res.error) router.refresh();
  }

  async function dupliquer(r: RubriqueAffichee) {
    setEnCours(r.id);
    const res = await copierRubrique(r.id);
    setEnCours(null);
    if (res.error) return setErreur(res.error);
    setErreur(null);
    if (res.id) router.push(`/boutique/actions/${res.id}`);
  }

  if (rubriques.length === 0) {
    return (
      <p style={{ color: SOUS, fontSize: 15, margin: 0 }}>
        Aucune rubrique. Créez-en une pour mettre des articles en avant ou lancer
        une action.
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {erreur && (
        <p role="alert" style={{ color: GRENAT, fontSize: 15, fontWeight: 600, margin: 0 }}>{erreur}</p>
      )}
      {avis && (
        <p role="status" style={{ color: VERT, fontSize: 15, fontWeight: 600, margin: 0 }}>{avis}</p>
      )}

      {rubriques.map((r) => {
        const enCoursDePeriode = r.actif && enPeriode(r, aujourdhui);
        return (
          <div key={r.id} style={{
            border: BORDURE, borderRadius: 16, backgroundColor: "#FFFFFF", padding: 14,
            display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center",
          }}>
            <span style={{ flex: "1 1 240px", minWidth: 0 }}>
              <span style={{ display: "block", color: MARINE, fontSize: 17, fontWeight: 700 }}>
                {r.nom}
                {r.pourcentage !== null && r.pourcentage !== undefined && (
                  <span style={{ color: "#8A5A1F" }}>
                    {" "}−{formatPourcentage(Number(r.pourcentage))} %
                  </span>
                )}
              </span>
              <span style={{ display: "block", color: SOUS, fontSize: 13.5 }}>
                {libelleTypePromotion(String(r.type))}
                {" · "}
                {r.cible === "membres" ? "membres seulement" : "tout le monde"}
                {" · du "}{formatDateFR(r.date_debut)} au {formatDateFR(r.date_fin)}
                {" · "}{r.nbArticles} article{r.nbArticles > 1 ? "s" : ""}
              </span>
              <span style={{
                display: "inline-block", marginTop: 4, padding: "1px 8px", borderRadius: 999,
                fontSize: 11.5, fontWeight: 700,
                color: enCoursDePeriode ? "#1F6E5B" : SOUS,
                backgroundColor: enCoursDePeriode ? "#DFF0E8" : "#EDE8DF",
              }}>
                {!r.actif ? "Désactivée" : enCoursDePeriode ? "En cours" : "Hors période"}
              </span>
            </span>

            <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link href={`/boutique/actions/${r.id}`} style={{ ...bouton, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                ✏️ Modifier
              </Link>
              <button type="button" style={bouton} disabled={enCours === r.id}
                onClick={() => dupliquer(r)}>
                ⧉ Dupliquer
              </button>
              <button type="button" disabled={enCours === r.id}
                style={{ ...bouton, color: r.actif ? GRENAT : VERT }}
                onClick={() => basculer(r)}>
                {r.actif ? "Désactiver" : "Réactiver"}
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
