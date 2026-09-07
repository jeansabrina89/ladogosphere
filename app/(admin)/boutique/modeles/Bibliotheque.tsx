"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  enregistrerModele,
  basculerModele,
  supprimerModele,
  dupliquerModele,
} from "./actions";

const MARINE = "#1B2B5E";
const SOUS = "#5B6478";
const VERT = "#1F6E5B";
const BORDURE = "1px solid rgba(27,43,94,0.14)";

const champ: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12,
  border: BORDURE, fontSize: 16, color: MARINE, backgroundColor: "#FFFFFF",
  fontFamily: "inherit", boxSizing: "border-box",
};

const etiquette: React.CSSProperties = {
  display: "block", fontSize: 14, fontWeight: 600, color: MARINE, marginBottom: 6,
};

const bouton: React.CSSProperties = {
  minHeight: 44, padding: "10px 14px", borderRadius: 12, border: BORDURE,
  backgroundColor: "#FFFFFF", color: MARINE, fontSize: 15, fontWeight: 600,
  fontFamily: "inherit", cursor: "pointer",
};

const boutonPrincipal: React.CSSProperties = {
  ...bouton, backgroundColor: VERT, borderColor: VERT, color: "#FFFFFF",
};

/** La rangée d'actions passe à la ligne d'un bloc, elle ne se comprime pas. */
const rangeeActions: React.CSSProperties = {
  display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0, marginLeft: "auto",
};

/** Le destructeur, à l'écart des autres. */
const boutonSupprimer: React.CSSProperties = {
  ...bouton, marginLeft: 8, color: "#A8453A",
};

export type LigneModele = {
  id: string;
  nom: string;
  description: string | null;
  actif: boolean;
  nbGroupes: number;
  nbValeurs: number;
  nbArticles: number;
};

/**
 * La bibliothèque de modèles d'options.
 *
 * Un modèle est PARTAGÉ, pas copié : le nombre d'articles qui l'utilisent est
 * donc la première chose à lire sur chaque ligne — c'est la portée de ce qu'on
 * s'apprête à changer.
 */
export default function Bibliotheque({ modeles }: { modeles: LigneModele[] }) {
  const router = useRouter();
  const [nouveau, setNouveau] = useState(false);
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [avis, setAvis] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  function suite(res: { error?: string; message?: string }) {
    setErreur(res.error ?? null);
    setAvis(res.error ? null : res.message ?? null);
    if (!res.error) router.refresh();
    return !res.error;
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {erreur && (
        <p role="alert" style={{ color: "#A8453A", fontSize: 15, margin: 0, fontWeight: 600 }}>
          {erreur}
        </p>
      )}
      {avis && (
        <p role="status" style={{ color: VERT, fontSize: 15, margin: 0, fontWeight: 600 }}>
          {avis}
        </p>
      )}

      {modeles.length === 0 && !nouveau && (
        <p style={{ color: SOUS, fontSize: 15, margin: 0 }}>
          Aucun modèle pour l&apos;instant. Un modèle regroupe des questions posées à
          l&apos;identique sur plusieurs articles — la matière et les largeurs d&apos;une
          sangle, par exemple. Corrigé une fois, il l&apos;est partout.
        </p>
      )}

      {modeles.map((m) => (
        <div
          key={m.id}
          style={{
            border: BORDURE, borderRadius: 16, padding: 14,
            backgroundColor: m.actif ? "#FFFFFF" : "#F3F1EC",
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
              <Link
                href={`/boutique/modeles/${m.id}`}
                style={{
                  color: MARINE, fontSize: 17, fontWeight: 700, textDecoration: "none",
                  overflowWrap: "anywhere",
                }}
              >
                {m.nom}
                {!m.actif && (
                  <span style={{ color: SOUS, fontSize: 14, fontWeight: 400 }}> · désactivé</span>
                )}
              </Link>
              {m.description && (
                <p style={{ color: SOUS, fontSize: 14, margin: "4px 0 0", whiteSpace: "pre-line" }}>
                  {m.description}
                </p>
              )}
              <p style={{ color: SOUS, fontSize: 14, margin: "6px 0 0" }}>
                {m.nbGroupes} groupe{m.nbGroupes > 1 ? "s" : ""} ·{" "}
                {m.nbValeurs} option{m.nbValeurs > 1 ? "s" : ""} ·{" "}
                <strong style={{ color: m.nbArticles > 0 ? MARINE : SOUS }}>
                  {m.nbArticles === 0
                    ? "aucun article"
                    : `${m.nbArticles} article${m.nbArticles > 1 ? "s" : ""}`}
                </strong>
              </p>
            </div>

            <div style={rangeeActions}>
              <Link href={`/boutique/modeles/${m.id}`}
                aria-label={`Modifier le modèle ${m.nom}`}
                style={{ ...bouton, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                ✏️ Modifier
              </Link>
              <button
                type="button"
                style={bouton}
                disabled={enCours}
                onClick={async () => {
                  const proposition = `${m.nom} (copie)`;
                  const voulu = window.prompt("Nom du nouveau modèle :", proposition);
                  if (!voulu) return;
                  setEnCours(true);
                  suite(await dupliquerModele(m.id, voulu));
                  setEnCours(false);
                }}
              >
                ⧉ Dupliquer
              </button>
              <button
                type="button"
                style={bouton}
                disabled={enCours}
                onClick={async () => {
                  setEnCours(true);
                  suite(await basculerModele(m.id, !m.actif));
                  setEnCours(false);
                }}
              >
                {m.actif ? "Désactiver" : "Réactiver"}
              </button>
              {/* La corbeille reste visible même quand le modèle sert : le refus
                  dit alors combien d'articles s'en servent et lesquels. Cachée,
                  elle laissait croire à un écran incomplet plutôt qu'à une règle. */}
              <button
                type="button"
                style={boutonSupprimer}
                aria-label={`Supprimer le modèle ${m.nom}`}
                disabled={enCours}
                onClick={async () => {
                  if (
                    m.nbArticles === 0 &&
                    !window.confirm(`Supprimer le modèle « ${m.nom} » ? Aucun article ne l'utilise.`)
                  ) return;
                  setEnCours(true);
                  suite(await supprimerModele(m.id));
                  setEnCours(false);
                }}
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      ))}

      {nouveau ? (
        <div style={{ border: BORDURE, borderRadius: 16, backgroundColor: "#FFFFFF", padding: 14, display: "grid", gap: 12 }}>
          <h3 style={{ color: MARINE, fontSize: 16, fontWeight: 700, margin: 0 }}>Nouveau modèle</h3>
          <div>
            <label htmlFor="nom-modele" style={etiquette}>Nom</label>
            <input id="nom-modele" type="text" value={nom} onChange={(e) => setNom(e.target.value)}
              style={champ} placeholder="Sangle biothane" />
          </div>
          <div>
            <label htmlFor="desc-modele" style={etiquette}>À quoi il sert (facultatif)</label>
            <input id="desc-modele" type="text" value={description}
              onChange={(e) => setDescription(e.target.value)} style={champ}
              placeholder="Matière, largeur et coloris de la sangle." />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              style={boutonPrincipal}
              disabled={enCours}
              onClick={async () => {
                setEnCours(true);
                const res = await enregistrerModele({ nom, description });
                setEnCours(false);
                if (suite(res)) {
                  setNom("");
                  setDescription("");
                  setNouveau(false);
                  if (res.id) router.push(`/boutique/modeles/${res.id}`);
                }
              }}
            >
              {enCours ? "…" : "💾 Créer"}
            </button>
            <button type="button" style={bouton} onClick={() => setNouveau(false)}>Annuler</button>
          </div>
        </div>
      ) : (
        <div>
          <button type="button" style={boutonPrincipal} onClick={() => setNouveau(true)}>
            + Nouveau modèle
          </button>
        </div>
      )}
    </div>
  );
}
