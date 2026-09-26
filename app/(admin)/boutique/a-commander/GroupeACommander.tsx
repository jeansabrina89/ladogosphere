"use client";

import { useActionState, useState } from "react";
import { marquerCommande, type EtatACommander } from "./actions";
import type { GroupeFournisseur } from "@/src/lib/aCommander";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.12)";
const VERT = "#1F6E5B";
const VIDE: EtatACommander = {};

/**
 * Un fournisseur, ses lignes à commander, et le bouton qui les date.
 *
 * Tout est coché d'entrée : le geste normal est « je commande tout ce qui
 * attend chez ce fournisseur ». Décocher est l'exception — une rupture chez
 * lui, par exemple — et non le cas courant.
 *
 * LA QUANTITÉ MONTRÉE EST CELLE DE LA LIGNE ENTIÈRE, jamais le manque. C'est la
 * condition du risque accepté le 26.09.2026 : la ligne sur commande ne réserve
 * rien, donc l'unité en rayon peut partir au comptoir avant la réception. Sans
 * conséquence tant que la commande couvre toute la ligne. Afficher « il en
 * manque 2 » ferait commander 2 sacs, et la cliente qui attend depuis trois
 * semaines en recevrait deux sur trois.
 */
/** Le groupe, avec les dates déjà formatées AU SERVEUR : une fonction ne
 *  traverse pas la frontière, et le fuseau du navigateur ne doit pas décaler
 *  une date de commande. */
export type GroupeAffiche = Omit<GroupeFournisseur, "lignes"> & {
  lignes: (GroupeFournisseur["lignes"][number] & { confirmeeLeTexte: string })[];
};

export default function GroupeACommander({ groupe }: { groupe: GroupeAffiche }) {
  const [etat, action, enCours] = useActionState<EtatACommander, FormData>(marquerCommande, VIDE);
  const [cochees, setCochees] = useState<Set<string>>(
    () => new Set(groupe.lignes.map((l) => l.ligneId))
  );

  const basculer = (id: string) =>
    setCochees((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  /** Le total par article : c'est ce qu'on écrit sur le bon de commande. */
  const parArticle = new Map<string, { nom: string; unite: string | null; total: number }>();
  for (const l of groupe.lignes) {
    if (!cochees.has(l.ligneId)) continue;
    const e = parArticle.get(l.articleId) ?? { nom: l.articleNom, unite: l.unite, total: 0 };
    e.total += l.quantite;
    parArticle.set(l.articleId, e);
  }

  return (
    <form action={action} style={{ border: BORDURE, borderRadius: 16, padding: 14, background: "#FFFFFF" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 17, color: MARINE }}>{groupe.fournisseurNom}</h2>
      {!groupe.fournisseurId && (
        <p style={{ margin: "0 0 10px", fontSize: 13.5, color: "#6E5410" }}>
          Ces articles n&apos;ont pas de fournisseur au carnet. À rattacher sur leur
          fiche, sinon on les oubliera.
        </p>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14.5 }}>
        <thead>
          <tr style={{ textAlign: "left", color: SOUS, fontSize: 13 }}>
            <th style={{ padding: "6px 4px" }}>À commander</th>
            <th style={{ padding: "6px 4px" }}>Article</th>
            <th style={{ padding: "6px 4px" }}>Quantité</th>
            <th style={{ padding: "6px 4px" }}>Commande</th>
            <th style={{ padding: "6px 4px" }}>Promis sous</th>
            <th style={{ padding: "6px 4px" }}>En rayon</th>
          </tr>
        </thead>
        <tbody>
          {groupe.lignes.map((l) => (
            <tr key={l.ligneId} style={{ borderTop: BORDURE }}>
              <td style={{ padding: "8px 4px" }}>
                <input
                  type="checkbox"
                  name="ligne"
                  value={l.ligneId}
                  checked={cochees.has(l.ligneId)}
                  onChange={() => basculer(l.ligneId)}
                  aria-label={`Commander ${l.articleNom} pour la commande ${l.numero ?? "sans numéro"}`}
                  style={{ width: 20, height: 20 }}
                />
              </td>
              <td style={{ padding: "8px 4px", color: MARINE, fontWeight: 600 }}>
                {l.articleNom}
                {l.reference && (
                  <span style={{ display: "block", color: SOUS, fontSize: 12.5, fontWeight: 500 }}>
                    {l.reference}
                  </span>
                )}
              </td>
              {/* La ligne ENTIÈRE. Voir l'en-tête de ce fichier. */}
              <td style={{ padding: "8px 4px", fontWeight: 700, color: MARINE, whiteSpace: "nowrap" }}>
                {l.quantite} {l.unite ?? ""}
              </td>
              <td style={{ padding: "8px 4px", color: SOUS }}>
                {l.numero ?? "—"}
                <span style={{ display: "block", fontSize: 12.5 }}>{l.confirmeeLeTexte}</span>
              </td>
              <td style={{ padding: "8px 4px", color: SOUS, whiteSpace: "nowrap" }}>
                {l.delaiMaxJours === null
                  ? "—"
                  : `${l.delaiMinJours !== null && l.delaiMinJours < l.delaiMaxJours ? `${l.delaiMinJours} à ` : ""}${l.delaiMaxJours} j`}
              </td>
              <td style={{ padding: "8px 4px", color: SOUS }}>{l.stockActuel}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {parArticle.size > 0 && (
        <p style={{ margin: "12px 0 0", fontSize: 14, color: MARINE }}>
          <strong>À commander en tout :</strong>{" "}
          {[...parArticle.values()]
            .map((e) => `${e.total} ${e.unite ?? ""} ${e.nom}`.replace(/\s+/g, " ").trim())
            .join(" · ")}
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        <button
          type="submit"
          disabled={enCours || cochees.size === 0}
          style={{
            minHeight: 44, padding: "0 16px", borderRadius: 12, border: "none",
            backgroundColor: cochees.size === 0 ? "#C9CEDB" : VERT, color: "#FFFFFF",
            fontSize: 15, fontWeight: 700, fontFamily: "inherit",
            cursor: cochees.size === 0 ? "not-allowed" : "pointer",
          }}
        >
          {enCours ? "…" : `✓ Commandé aujourd'hui (${cochees.size})`}
        </button>
        {etat.erreur && (
          <span role="alert" style={{ color: "#8A1F1F", fontSize: 13.5, fontWeight: 600 }}>
            {etat.erreur}
          </span>
        )}
        {etat.message && (
          <span role="status" style={{ color: VERT, fontSize: 13.5, fontWeight: 600 }}>
            {etat.message}
          </span>
        )}
      </div>
    </form>
  );
}
