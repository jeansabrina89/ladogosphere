"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { facturerLocataire, envoyerFactureLocataire } from "./actions";
import {
  COMPTE_LOYER_REFACTURE,
  COMPTE_PRESTATIONS,
  type LigneFacture,
} from "@/src/lib/factureLocataireLogique";
import {
  COMPTES_LIGNE_LIBRE_LOCATAIRE,
  COMPTE_ALIMENTATION_REFACTUREE,
} from "@/src/lib/ligneLibreLogique";
import type { FactureLocataireEmise } from "@/src/lib/factureLocataire";

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

type LigneLibre = { cle: number; libelle: string; montant: string; compte: string };

let compteur = 0;
const ligneLibreVide = (): LigneLibre => ({
  cle: ++compteur, libelle: "", montant: "", compte: COMPTE_ALIMENTATION_REFACTUREE,
});

const lireMontant = (brut: string) => {
  const n = Number(brut.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const FORMAT_ENVOI = new Intl.DateTimeFormat("fr-CH", {
  timeZone: "Europe/Zurich",
  day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit",
});

const champ: React.CSSProperties = {
  minHeight: CIBLE, padding: "0 10px", borderRadius: 10,
  border: "1px solid rgba(27,43,94,.2)", fontSize: 14, color: MARINE, background: "#FFF",
  minWidth: 0,
};

export default function Facturation({
  propositions,
  emises,
  mois,
}: {
  propositions: Proposition[];
  emises: FactureLocataireEmise[];
  mois: string;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState("");
  const [libres, setLibres] = useState<Record<string, LigneLibre[]>>({});
  const [envoiEnCours, setEnvoiEnCours] = useState<string | null>(null);

  const lignesDe = (clientId: string) => libres[clientId] ?? [];
  const majLignes = (clientId: string, f: (ls: LigneLibre[]) => LigneLibre[]) =>
    setLibres((tout) => ({ ...tout, [clientId]: f(tout[clientId] ?? []) }));

  const emettre = (clientId: string, avecNotes: boolean) => {
    setErreur("");
    const fd = new FormData();
    fd.set("client_id", clientId);
    fd.set("mois", mois);
    if (avecNotes) fd.set("avec_notes", "on");
    fd.set("lignes_libres", JSON.stringify(
      lignesDe(clientId)
        .filter((l) => l.libelle.trim() !== "")
        .map((l) => ({ libelle: l.libelle.trim(), montant: l.montant, compte_produit: l.compte }))
    ));
    demarrer(async () => {
      const r = await facturerLocataire(fd);
      if (r.error) setErreur(r.error);
      else {
        setLibres((tout) => ({ ...tout, [clientId]: [] }));
        router.refresh();
      }
    });
  };

  const envoyer = (factureId: string) => {
    setErreur("");
    setEnvoiEnCours(factureId);
    demarrer(async () => {
      const r = await envoyerFactureLocataire(factureId);
      setEnvoiEnCours(null);
      if (r.error) setErreur(r.error);
      else router.refresh();
    });
  };

  if (propositions.length === 0 && emises.length === 0) {
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

      {propositions.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
          {propositions.map((p) => {
            const ajoutees = lignesDe(p.clientId);
            const totalAjoute = ajoutees
              .filter((l) => l.libelle.trim() !== "")
              .reduce((s, l) => s + lireMontant(l.montant), 0);
            const total = p.total + totalAjoute;

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
                    {total.toFixed(2)} CHF
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

                {!p.blocage && (
                  <div style={{ marginTop: 12 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: MARINE, margin: "0 0 6px" }}>
                      Lignes ajoutées
                    </p>
                    {ajoutees.length === 0 && (
                      <p style={{ color: SOUS, fontSize: 13, margin: "0 0 6px" }}>
                        Nourriture achetée pour le chien, consultation avancée… ajoutez-les
                        ici avant d&apos;émettre. Montants TTC.
                      </p>
                    )}
                    <div style={{ display: "grid", gap: 8 }}>
                      {ajoutees.map((l) => (
                        <div key={l.cle} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <input
                            type="text" value={l.libelle} placeholder="Libellé"
                            aria-label="Libellé"
                            onChange={(e) => majLignes(p.clientId, (ls) =>
                              ls.map((x) => x.cle === l.cle ? { ...x, libelle: e.target.value } : x))}
                            style={{ ...champ, flex: "2 1 200px" }}
                          />
                          <select
                            value={l.compte} aria-label="Type de ligne"
                            onChange={(e) => majLignes(p.clientId, (ls) =>
                              ls.map((x) => x.cle === l.cle ? { ...x, compte: e.target.value } : x))}
                            style={{ ...champ, flex: "1 1 180px" }}
                          >
                            {COMPTES_LIGNE_LIBRE_LOCATAIRE.map((c) => (
                              <option key={c.numero} value={c.numero}>{c.libelle}</option>
                            ))}
                          </select>
                          <input
                            type="text" inputMode="decimal" value={l.montant} placeholder="Montant TTC"
                            aria-label="Montant TTC"
                            onChange={(e) => majLignes(p.clientId, (ls) =>
                              ls.map((x) => x.cle === l.cle ? { ...x, montant: e.target.value } : x))}
                            style={{ ...champ, flex: "0 1 120px", textAlign: "right" }}
                          />
                          <button
                            type="button" title="Retirer" aria-label="Retirer la ligne"
                            onClick={() => majLignes(p.clientId, (ls) => ls.filter((x) => x.cle !== l.cle))}
                            style={{
                              minHeight: CIBLE, minWidth: CIBLE, borderRadius: 10, border: "none",
                              background: "transparent", color: "#A8453A", fontSize: 16, cursor: "pointer",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => majLignes(p.clientId, (ls) => [...ls, ligneLibreVide()])}
                      style={{
                        marginTop: 8, minHeight: CIBLE, padding: "0 14px", borderRadius: 10, border: "none",
                        background: "#EDE8DF", color: MARINE, fontWeight: 600, fontSize: 14, cursor: "pointer",
                      }}
                    >
                      + Ajouter une ligne
                    </button>
                  </div>
                )}

                {p.blocage ? (
                  <p style={{ color: "#A8453A", fontSize: 13, fontWeight: 600, marginTop: 10 }}>
                    {p.blocage}
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
                      {enCours && !envoiEnCours ? "Émission…" : "🧾 Émettre la facture"}
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
      )}

      {emises.length > 0 && (
        <section style={{ marginTop: propositions.length > 0 ? 24 : 0 }}>
          <h2 style={{
            fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 18, fontWeight: 700,
            color: MARINE, margin: "0 0 4px",
          }}>
            Factures émises
          </h2>
          <p style={{ color: SOUS, fontSize: 13, margin: "0 0 10px" }}>
            Elles ne partent jamais d&apos;elles-mêmes : relisez-les, puis envoyez-les.
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {emises.map((f) => (
              <li key={f.id} style={{
                background: "#FFF", border: "1px solid rgba(27,43,94,.10)", borderRadius: 14,
                padding: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", minWidth: 0,
              }}>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, color: MARINE, overflowWrap: "anywhere" }}>
                    {f.client}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 13, color: SOUS }}>
                    <a href={`/factures/${f.id}`} style={{ color: MARINE }}>{f.numero ?? "Facture"}</a>
                    {" · "}{f.total.toFixed(2)} CHF
                    {" · "}
                    {f.emailEnvoyeLe
                      ? <span style={{ color: "#1F6E5B", fontWeight: 600 }}>
                          Envoyée le {FORMAT_ENVOI.format(new Date(f.emailEnvoyeLe))}
                        </span>
                      : <span>Pas encore envoyée</span>}
                  </p>
                </div>
                {f.clientAUneAdresse ? (
                  <button
                    type="button" disabled={enCours}
                    onClick={() => envoyer(f.id)}
                    style={{
                      minHeight: CIBLE, padding: "0 16px", borderRadius: 12,
                      border: "1px solid rgba(27,43,94,.2)", background: "#FFF",
                      color: MARINE, fontWeight: 600, fontSize: 14, cursor: "pointer",
                    }}
                  >
                    {envoiEnCours === f.id ? "Envoi…" : "✉️ Envoyer par e-mail"}
                  </button>
                ) : (
                  <span style={{ fontSize: 13, color: "#A8453A", fontWeight: 600 }}>
                    Pas d&apos;adresse e-mail sur la fiche
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
