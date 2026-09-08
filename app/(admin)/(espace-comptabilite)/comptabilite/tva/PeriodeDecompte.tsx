"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { declarerPeriode, enregistrerPaiement } from "./actions";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.58)";
const VERT = "#1F6E5B";
const GRENAT = "#8A1F1F";
const BORDURE = "1px solid rgba(27,43,94,0.14)";
const CIBLE = 44;

const chf = (n: number) => `${n.toFixed(2)} CHF`;

export type LigneAffichee = {
  libelle: string;
  ca: number;
  taux: number;
  du: number;
};

export type PeriodeAffichee = {
  code: string;
  libelle: string;
  debut: string;
  fin: string;
  /** Ce qui empêche de calculer, s'il y a lieu. */
  refus: string | null;
  lignes: LigneAffichee[];
  caTotal: number;
  totalDu: number;
  /** Déjà déclarée : la période est close, on ne la recalcule plus. */
  declare: { code: string; totalDu: number; declareLe: string; statut: string; payeLe: string | null } | null;
  /** Une période qui n'est pas terminée ne se déclare pas encore. */
  terminee: boolean;
};

/**
 * Une période de décompte.
 *
 * Trois états, et un seul geste possible dans chacun : à venir, à déclarer,
 * déclarée. Une période déclarée n'affiche plus aucun bouton de calcul — elle
 * ne se rejoue pas, et on le dit plutôt que de griser un bouton sans raison.
 */
export default function PeriodeDecompte({ periode }: { periode: PeriodeAffichee }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [datePaiement, setDatePaiement] = useState(new Date().toISOString().slice(0, 10));

  async function declarer() {
    if (!confirm(
      `Déclarer le décompte ${periode.libelle} pour ${chf(periode.totalDu)} ?\n\n` +
      "L'écriture part au grand-livre et la période se ferme définitivement : " +
      "une correction se fera par la période suivante."
    )) return;
    setEnCours(true);
    setErreur(null);
    const fd = new FormData();
    fd.set("code", periode.code);
    const res = await declarerPeriode(fd);
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    router.refresh();
  }

  async function payer() {
    setEnCours(true);
    setErreur(null);
    const fd = new FormData();
    fd.set("code", periode.code);
    fd.set("date", datePaiement);
    const res = await enregistrerPaiement(fd);
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    router.refresh();
  }

  const declare = periode.declare;

  return (
    <div style={{ border: BORDURE, borderRadius: 16, backgroundColor: "#FFFFFF", padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <h3 style={{ color: MARINE, fontSize: 17, fontWeight: 700, margin: 0 }}>
          {periode.libelle}
        </h3>
        <span style={{ color: SOUS, fontSize: 13.5 }}>
          du {periode.debut} au {periode.fin}
        </span>
      </div>

      {erreur && (
        <p role="alert" style={{
          backgroundColor: "#FDECEC", color: GRENAT, border: "1px solid #F0C2C2",
          borderRadius: 12, padding: "10px 12px", fontSize: 14.5, fontWeight: 600, margin: 0,
        }}>
          {erreur}
        </p>
      )}

      {declare ? (
        <>
          <p role="status" style={{
            backgroundColor: "#E4F1EC", color: VERT, border: "1px solid #B9DDD1",
            borderRadius: 12, padding: "10px 12px", fontSize: 14.5, fontWeight: 600, margin: 0,
          }}>
            ✅ Déclaré le {new Date(declare.declareLe).toLocaleDateString("fr-CH")} —{" "}
            {chf(declare.totalDu)}
            {declare.statut === "paye" && declare.payeLe ? ` · payé le ${declare.payeLe}` : ""}
          </p>
          <p style={{ color: SOUS, fontSize: 13.5, margin: 0 }}>
            Cette période est close : elle ne se recalcule pas. Une correction se
            porte sur la période suivante, comme le demande l&apos;AFC.
          </p>

          {declare.statut !== "paye" && declare.totalDu > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <span>
                <label htmlFor={`paie-${periode.code}`} style={{ display: "block", fontSize: 13.5, color: SOUS, marginBottom: 4 }}>
                  Payé à l&apos;AFC le
                </label>
                <input id={`paie-${periode.code}`} type="date" value={datePaiement}
                  onChange={(e) => setDatePaiement(e.target.value)}
                  style={{
                    minHeight: CIBLE, padding: "8px 10px", border: BORDURE, borderRadius: 12,
                    fontSize: 15, color: MARINE, fontFamily: "inherit",
                  }} />
              </span>
              <button type="button" onClick={payer} disabled={enCours} style={{
                minHeight: CIBLE, padding: "0 18px", borderRadius: 12, border: BORDURE,
                backgroundColor: "#FFFFFF", color: VERT, fontSize: 15, fontWeight: 600,
                fontFamily: "inherit", cursor: enCours ? "not-allowed" : "pointer",
              }}>
                {enCours ? "…" : "Enregistrer le paiement"}
              </button>
            </div>
          )}
        </>
      ) : periode.refus ? (
        <p role="status" style={{
          backgroundColor: "#F4EAC9", color: "#6E5410", border: "1px solid #C9A84C",
          borderRadius: 12, padding: "10px 12px", fontSize: 14.5, fontWeight: 600, margin: 0,
        }}>
          ⚠️ {periode.refus}
        </p>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
              <thead>
                <tr style={{ textAlign: "left", color: SOUS, fontSize: 13 }}>
                  <th style={{ padding: "6px 8px" }}>Secteur</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>CA TTC</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Taux</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Dû</th>
                </tr>
              </thead>
              <tbody>
                {periode.lignes.map((l, i) => (
                  <tr key={i} style={{ borderTop: BORDURE }}>
                    <td style={{ padding: "8px", color: MARINE, fontSize: 14.5 }}>{l.libelle}</td>
                    <td style={{ padding: "8px", textAlign: "right", color: MARINE, fontSize: 14.5 }}>{chf(l.ca)}</td>
                    <td style={{ padding: "8px", textAlign: "right", color: SOUS, fontSize: 14.5 }}>
                      {String(l.taux).replace(".", ",")} %
                    </td>
                    <td style={{ padding: "8px", textAlign: "right", color: MARINE, fontSize: 14.5, fontWeight: 700 }}>
                      {chf(l.du)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${MARINE}` }}>
                  <td style={{ padding: "8px", color: MARINE, fontWeight: 700 }}>Total</td>
                  <td style={{ padding: "8px", textAlign: "right", color: MARINE, fontWeight: 700 }}>{chf(periode.caTotal)}</td>
                  <td />
                  <td style={{ padding: "8px", textAlign: "right", color: MARINE, fontSize: 18, fontWeight: 700 }}>
                    {chf(periode.totalDu)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {periode.terminee ? (
            <button type="button" onClick={declarer} disabled={enCours} style={{
              minHeight: CIBLE + 4, borderRadius: 14, border: "none",
              backgroundColor: enCours ? "#B9CFC9" : VERT, color: "#FFFFFF",
              fontSize: 16, fontWeight: 700, fontFamily: "inherit",
              cursor: enCours ? "not-allowed" : "pointer", justifySelf: "start", padding: "0 22px",
            }}>
              {enCours ? "Déclaration…" : "Déclarer et passer l'écriture"}
            </button>
          ) : (
            <p style={{ color: SOUS, fontSize: 13.5, margin: 0 }}>
              Période en cours : le montant ci-dessus bougera encore. Elle se
              déclarera après le {periode.fin}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
