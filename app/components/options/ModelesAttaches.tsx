"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  attacherModele,
  detacherModele,
  deplacerModele,
  transformerEnModele,
} from "@/app/(admin)/boutique/modeles/actions";
import type { Fusion } from "@/src/lib/personnalisationLogique";

const MARINE = "#1B2B5E";
const SOUS = "#5B6478";
const VERT = "#1F6E5B";
const BORDURE = "1px solid rgba(27,43,94,0.14)";

const champ: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12,
  border: BORDURE, fontSize: 16, color: MARINE, backgroundColor: "#FFFFFF",
  fontFamily: "inherit", boxSizing: "border-box",
};

const bouton: React.CSSProperties = {
  minHeight: 44, padding: "10px 14px", borderRadius: 12, border: BORDURE,
  backgroundColor: "#FFFFFF", color: MARINE, fontSize: 15, fontWeight: 600,
  fontFamily: "inherit", cursor: "pointer",
};

const carreOrdre: React.CSSProperties = {
  minWidth: 44, minHeight: 44, borderRadius: 12, border: BORDURE,
  backgroundColor: "#FFFFFF", color: MARINE, fontSize: 18,
  fontFamily: "inherit", cursor: "pointer", lineHeight: 1,
};

export type ModeleAttache = {
  id: string;
  nom: string;
  description: string | null;
  ordre: number;
  nbGroupes: number;
};

/**
 * Les modèles attachés à un article.
 *
 * Ils passent AVANT les groupes propres de l'article, dans l'ordre où ils sont
 * listés ici : c'est l'ordre des questions au comptoir. Deux modèles qui
 * apportent une question de même nom n'en posent qu'une — la place retenue est
 * celle de la première, et c'est dit ici plutôt que découvert au comptoir.
 */
export default function ModelesAttaches({
  articleId,
  attaches,
  disponibles,
  fusions,
  nbGroupesPropres,
}: {
  articleId: string;
  attaches: ModeleAttache[];
  disponibles: { id: string; nom: string; nbGroupes: number }[];
  fusions: Fusion[];
  nbGroupesPropres: number;
}) {
  const router = useRouter();
  const [choix, setChoix] = useState("");
  const [avis, setAvis] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  function suite(res: { error?: string; message?: string }) {
    setErreur(res.error ?? null);
    setAvis(res.error ? null : res.message ?? null);
    if (!res.error) router.refresh();
    return !res.error;
  }

  const attachables = disponibles.filter((d) => !attaches.some((a) => a.id === d.id));

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <h3 style={{ color: MARINE, fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>
          Modèles attachés
        </h3>
        <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>
          Un modèle est partagé : ce qui y change, change ici aussi. Ses questions sont
          posées avant celles propres à cet article, dans l&apos;ordre ci-dessous.
        </p>
      </div>

      {erreur && (
        <p role="alert" style={{ color: "#A8453A", fontSize: 15, margin: 0, fontWeight: 600 }}>{erreur}</p>
      )}
      {avis && (
        <p role="status" style={{ color: VERT, fontSize: 15, margin: 0, fontWeight: 600 }}>{avis}</p>
      )}

      {attaches.length === 0 ? (
        <p style={{ color: SOUS, fontSize: 15, margin: 0 }}>
          Aucun modèle attaché : cet article ne pose que ses propres questions.
        </p>
      ) : (
        attaches.map((m, i) => (
          <div
            key={m.id}
            style={{
              border: BORDURE, borderRadius: 14, backgroundColor: "#FFFFFF", padding: 12,
              display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
            }}
          >
            <button type="button" aria-label={`Monter ${m.nom}`} disabled={i === 0 || enCours}
              style={{ ...carreOrdre, opacity: i === 0 ? 0.4 : 1 }}
              onClick={async () => { setEnCours(true); suite(await deplacerModele(articleId, m.id, "haut")); setEnCours(false); }}>↑</button>
            <button type="button" aria-label={`Descendre ${m.nom}`} disabled={i === attaches.length - 1 || enCours}
              style={{ ...carreOrdre, opacity: i === attaches.length - 1 ? 0.4 : 1 }}
              onClick={async () => { setEnCours(true); suite(await deplacerModele(articleId, m.id, "bas")); setEnCours(false); }}>↓</button>

            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <Link href={`/boutique/modeles/${m.id}`}
                style={{ color: MARINE, fontSize: 16, fontWeight: 700, textDecoration: "none" }}>
                {m.nom}
              </Link>
              <p style={{ color: SOUS, fontSize: 13, margin: "2px 0 0" }}>
                {m.nbGroupes} groupe{m.nbGroupes > 1 ? "s" : ""}
                {m.description ? ` · ${m.description}` : ""}
              </p>
            </div>

            <button type="button" style={bouton} disabled={enCours}
              onClick={async () => {
                if (!window.confirm(`Détacher « ${m.nom} » ? Ses questions ne seront plus posées sur cet article. Les commandes déjà passées ne changent pas.`)) return;
                setEnCours(true);
                suite(await detacherModele(articleId, m.id));
                setEnCours(false);
              }}>
              Détacher
            </button>
          </div>
        ))
      )}

      {fusions.length > 0 && (
        <div style={{ border: BORDURE, borderRadius: 14, backgroundColor: "#FBF9F5", padding: 12 }}>
          <p style={{ color: MARINE, fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>
            Questions réunies
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, color: SOUS, fontSize: 14 }}>
            {fusions.map((f) => (
              <li key={f.nom} style={{ marginBottom: 2 }}>
                « {f.nom} » vient de {f.sources.join(" et de ")} : une seule question est
                posée, avec toutes les options réunies.
              </li>
            ))}
          </ul>
        </div>
      )}

      {attachables.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select value={choix} onChange={(e) => setChoix(e.target.value)}
            style={{ ...champ, flex: "1 1 220px", width: "auto" }} aria-label="Modèle à attacher">
            <option value="">— Choisir un modèle —</option>
            {attachables.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nom} ({d.nbGroupes} groupe{d.nbGroupes > 1 ? "s" : ""})
              </option>
            ))}
          </select>
          <button type="button" style={{ ...bouton, opacity: choix ? 1 : 0.5 }}
            disabled={!choix || enCours}
            onClick={async () => {
              setEnCours(true);
              if (suite(await attacherModele(articleId, choix))) setChoix("");
              setEnCours(false);
            }}>
            Attacher
          </button>
        </div>
      )}

      {attachables.length === 0 && attaches.length === 0 && (
        <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>
          Aucun modèle disponible.{" "}
          <Link href="/boutique/modeles" style={{ color: MARINE }}>Créez-en un</Link> pour
          poser les mêmes questions sur plusieurs articles.
        </p>
      )}

      {nbGroupesPropres > 0 && (
        <div style={{ borderTop: BORDURE, paddingTop: 12 }}>
          <p style={{ color: SOUS, fontSize: 14, margin: "0 0 8px" }}>
            Les {nbGroupesPropres} groupe{nbGroupesPropres > 1 ? "s" : ""} propre
            {nbGroupesPropres > 1 ? "s" : ""} à cet article vous servi{nbGroupesPropres > 1 ? "ront" : "ra"}
            {" "}peut-être ailleurs : transformez-les en modèle pour les attacher à d&apos;autres articles.
          </p>
          <button type="button" style={bouton} disabled={enCours}
            onClick={async () => {
              const nom = window.prompt(
                "Nom du modèle à créer avec les groupes propres de cet article :",
                ""
              );
              if (!nom) return;
              setEnCours(true);
              suite(await transformerEnModele(articleId, nom));
              setEnCours(false);
            }}>
            🧩 Transformer ces groupes en modèle
          </button>
        </div>
      )}
    </div>
  );
}
