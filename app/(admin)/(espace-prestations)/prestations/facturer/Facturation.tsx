"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { facturerLocataire } from "./actions";
import {
  COMPTE_LOYER_REFACTURE,
  COMPTE_PRESTATIONS,
  type LigneFacture,
} from "@/src/lib/factureLocataireLogique";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.6)";
const CIBLE = 44;

export type Proposition = {
  clientId: string;
  client: string;
  lignes: LigneFacture[];
  total: number;
  notes: string[];
  blocage: string | null;
};

export default function Facturation({
  propositions,
  mois,
}: {
  propositions: Proposition[];
  mois: string;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState("");
  const [faites, setFaites] = useState<Record<string, string>>({});

  const emettre = (clientId: string, avecNotes: boolean) => {
    setErreur("");
    const fd = new FormData();
    fd.set("client_id", clientId);
    fd.set("mois", mois);
    if (avecNotes) fd.set("avec_notes", "on");
    demarrer(async () => {
      const r = await facturerLocataire(fd);
      if (r.error) setErreur(r.error);
      else {
        setFaites((f) => ({ ...f, [clientId]: r.factureId ?? "" }));
        router.refresh();
      }
    });
  };

  if (propositions.length === 0) {
    return <p style={{ color: SOUS, fontSize: 15 }}>Rien à facturer pour ce mois.</p>;
  }

  return (
    <div style={{ minWidth: 0 }}>
      {erreur && (
        <p role="alert" style={{
          background: "#FBE2DE", color: "#A8453A", padding: "10px 12px",
          borderRadius: 12, fontSize: 14, fontWeight: 600, margin: "0 0 12px",
        }}>{erreur}</p>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
        {propositions.map((p) => {
          const emise = faites[p.clientId];
          return (
            <li key={p.clientId} style={{
              background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
              borderRadius: 16, padding: 16, minWidth: 0,
            }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                <span style={{ fontWeight: 700, color: MARINE, fontSize: 16, overflowWrap: "anywhere" }}>
                  {p.client}
                </span>
                <span style={{ marginLeft: "auto", fontWeight: 700, color: MARINE, fontSize: 18 }}>
                  {p.total.toFixed(2)} CHF
                </span>
              </div>

              <div style={{ overflowX: "auto", marginTop: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 420 }}>
                  <thead>
                    <tr style={{ color: SOUS, textAlign: "left" }}>
                      <th style={{ padding: "4px 6px", fontWeight: 600 }}>Ligne</th>
                      <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "right" }}>Qté</th>
                      <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "right" }}>P.U.</th>
                      <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "right" }}>Montant</th>
                      <th style={{ padding: "4px 6px", fontWeight: 600 }}>Produit</th>
                      <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "right" }}>TVA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.lignes.map((l, i) => (
                      <tr key={`${l.libelle}-${i}`} style={{ borderTop: "1px solid rgba(27,43,94,.08)" }}>
                        <td style={{ padding: "6px", color: MARINE, overflowWrap: "anywhere" }}>{l.libelle}</td>
                        <td style={{ padding: "6px", textAlign: "right", color: SOUS }}>{l.quantite}</td>
                        <td style={{ padding: "6px", textAlign: "right", color: SOUS }}>{l.prix_unitaire.toFixed(2)}</td>
                        <td style={{ padding: "6px", textAlign: "right", fontWeight: 600, color: MARINE }}>
                          {l.montant.toFixed(2)}
                        </td>
                        <td style={{ padding: "6px" }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                            whiteSpace: "nowrap",
                            background: l.compte_produit === COMPTE_LOYER_REFACTURE ? "#F4EAC9" : "#E4E7F0",
                            color: l.compte_produit === COMPTE_LOYER_REFACTURE ? "#6E5410" : MARINE,
                          }}>
                            {l.compte_produit}
                          </span>
                        </td>
                        <td style={{ padding: "6px", textAlign: "right", color: SOUS }}>{l.taux_tva} %</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p style={{ color: SOUS, fontSize: 12, margin: "8px 0 0" }}>
                {COMPTE_PRESTATIONS} : services rendus. {COMPTE_LOYER_REFACTURE} : loyer de box
                refacturé, qui ne fait que transiter. Le taux de TVA du loyer refacturé est à
                confirmer auprès de l&apos;AFC.
              </p>

              {p.notes.length > 0 && (
                <div style={{
                  marginTop: 10, background: "#F5F0E8", borderRadius: 12, padding: "10px 12px",
                }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: MARINE, margin: "0 0 4px" }}>
                    Prestations non faites, écartées du décompte :
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 18, color: SOUS, fontSize: 13 }}>
                    {p.notes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}

              {p.blocage ? (
                <p style={{ color: "#A8453A", fontSize: 13, fontWeight: 600, marginTop: 10 }}>
                  {p.blocage}
                </p>
              ) : emise ? (
                <p style={{ color: "#1F6E5B", fontSize: 14, fontWeight: 700, marginTop: 12 }}>
                  ✓ Facture émise.{" "}
                  <a href={`/factures/${emise}`} style={{ color: MARINE }}>La voir</a>
                </p>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
                  <button type="button" disabled={enCours}
                    onClick={() => emettre(p.clientId, false)}
                    style={{
                      minHeight: CIBLE, padding: "0 18px", borderRadius: 12, border: "none",
                      background: "#4AAEA0", color: "#FFF", fontWeight: 700, fontSize: 14,
                      cursor: "pointer",
                    }}>
                    {enCours ? "Émission…" : "🧾 Émettre la facture"}
                  </button>
                  {p.notes.length > 0 && (
                    <button type="button" disabled={enCours}
                      onClick={() => emettre(p.clientId, true)}
                      style={{
                        minHeight: CIBLE, padding: "0 18px", borderRadius: 12,
                        border: "1px solid rgba(27,43,94,.2)", background: "#FFF",
                        color: MARINE, fontWeight: 600, fontSize: 14, cursor: "pointer",
                      }}>
                      Émettre avec les motifs en note
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
