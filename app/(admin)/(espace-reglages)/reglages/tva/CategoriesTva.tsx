"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { appliquerCategorie } from "./actions";
import { SECTEURS, TAUX_EXCLU, TAUX_NORMAL, TAUX_REDUIT, libelleTaux } from "@/src/lib/tvaLogique";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.58)";
const BORDURE = "1px solid rgba(27,43,94,0.14)";

export type LigneCategorie = {
  categorie: string;
  libelle: string;
  articles: number;
  /** Le taux effectivement porté par les articles, ou null s'ils divergent. */
  taux: number | null;
  secteur: string | null;
  /** Ce que la catégorie appelle par défaut. */
  tauxAttendu: number;
};

/**
 * Le taux et le secteur par catégorie d'articles.
 *
 * C'est un raccourci de démarrage : il repose chaque article de la catégorie
 * sur le même taux. Une fiche article garde ensuite son taux propre — un
 * article peut légitimement sortir du lot.
 *
 * Rien ici ne touche une pièce déjà émise : les lignes ont figé le leur.
 */
export default function CategoriesTva({ lignes }: { lignes: LigneCategorie[] }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function appliquer(categorie: string, taux: number, secteur: string) {
    setEnCours(categorie);
    setMessage(null);
    const fd = new FormData();
    fd.set("categorie", categorie);
    fd.set("taux_tva", String(taux));
    fd.set("secteur_tdfn", secteur);
    const res = await appliquerCategorie(fd);
    setEnCours(null);
    setMessage(res.error ?? res.message ?? null);
    if (!res.error) router.refresh();
  }

  const select: React.CSSProperties = {
    minHeight: 40, padding: "6px 8px", border: BORDURE, borderRadius: 10,
    fontSize: 14.5, color: MARINE, backgroundColor: "#FFFFFF", fontFamily: "inherit",
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {message && (
        <p role="status" style={{ color: SOUS, fontSize: 14.5, margin: 0 }}>{message}</p>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr style={{ textAlign: "left", color: SOUS, fontSize: 13 }}>
              <th style={{ padding: "6px 8px" }}>Catégorie</th>
              <th style={{ padding: "6px 8px" }}>Articles</th>
              <th style={{ padding: "6px 8px" }}>Taux</th>
              <th style={{ padding: "6px 8px" }}>Secteur</th>
              <th style={{ padding: "6px 8px" }}></th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <LigneCategorieForm
                key={l.categorie}
                ligne={l}
                select={select}
                enCours={enCours === l.categorie}
                onAppliquer={appliquer}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LigneCategorieForm({
  ligne, select, enCours, onAppliquer,
}: {
  ligne: LigneCategorie;
  select: React.CSSProperties;
  enCours: boolean;
  onAppliquer: (categorie: string, taux: number, secteur: string) => void;
}) {
  const [taux, setTaux] = useState(String(ligne.taux ?? ligne.tauxAttendu));
  const [secteur, setSecteur] = useState(ligne.secteur ?? "commerce");

  const divergent = ligne.taux === null;
  const change = Number(taux) !== ligne.taux || secteur !== ligne.secteur;

  return (
    <tr style={{ borderTop: BORDURE }}>
      <td style={{ padding: "8px", color: MARINE, fontSize: 14.5, fontWeight: 600 }}>
        {ligne.libelle}
        {divergent && (
          <span style={{ display: "block", color: "#6E5410", fontSize: 13, fontWeight: 500 }}>
            Taux différents d&apos;un article à l&apos;autre
          </span>
        )}
      </td>
      <td style={{ padding: "8px", color: SOUS, fontSize: 14 }}>{ligne.articles}</td>
      <td style={{ padding: "8px" }}>
        <select value={taux} onChange={(e) => setTaux(e.target.value)} style={select}
          aria-label={`Taux de ${ligne.libelle}`}>
          {[TAUX_NORMAL, TAUX_REDUIT, TAUX_EXCLU].map((t) => (
            <option key={t} value={t}>{libelleTaux(t)}</option>
          ))}
        </select>
      </td>
      <td style={{ padding: "8px" }}>
        <select value={secteur} onChange={(e) => setSecteur(e.target.value)} style={select}
          aria-label={`Secteur de ${ligne.libelle}`}>
          {SECTEURS.map((s) => (
            <option key={s.valeur} value={s.valeur}>{s.libelle}</option>
          ))}
        </select>
      </td>
      <td style={{ padding: "8px" }}>
        <button type="button" disabled={enCours || !change}
          onClick={() => onAppliquer(ligne.categorie, Number(taux), secteur)}
          style={{
            minHeight: 40, padding: "0 14px", borderRadius: 10, border: BORDURE,
            backgroundColor: change ? "#FFFFFF" : "#F2F0EC",
            color: change ? "#1F6E5B" : "rgba(27,43,94,0.35)",
            fontSize: 14, fontWeight: 600, fontFamily: "inherit",
            cursor: change && !enCours ? "pointer" : "not-allowed",
          }}>
          {enCours ? "…" : "Appliquer"}
        </button>
      </td>
    </tr>
  );
}
