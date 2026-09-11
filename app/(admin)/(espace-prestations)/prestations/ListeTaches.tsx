"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { annulerFaite, annulerTache, marquerFaite } from "./actions";
import type { TacheDuJour } from "@/src/lib/prestationsDb";
import { MENTION_GARDE } from "@/src/lib/prestationsLogique";

/**
 * La liste de tâches, telle qu'une employée la tient d'une main.
 *
 * Une colonne, des cibles de 44 px, rien à faire défiler latéralement. Elle
 * s'utilise à 375 px : c'est un écran qu'on garde ouvert dans la poche entre
 * deux box, pas un tableau qu'on consulte assise.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.6)";
const CIBLE = 44;

export default function ListeTaches({
  taches,
  peutAnnuler,
}: {
  taches: TacheDuJour[];
  peutAnnuler: boolean;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState("");
  const [annulation, setAnnulation] = useState<string | null>(null);
  const [motif, setMotif] = useState("");

  const basculer = (t: TacheDuJour) => {
    setErreur("");
    demarrer(async () => {
      const r = t.statut === "faite" ? await annulerFaite(t.id) : await marquerFaite(t.id);
      if (r.error) setErreur(r.error);
      else router.refresh();
    });
  };

  const confirmerAnnulation = (tacheId: string) => {
    setErreur("");
    const fd = new FormData();
    fd.set("tache_id", tacheId);
    fd.set("motif", motif);
    demarrer(async () => {
      const r = await annulerTache(fd);
      if (r.error) setErreur(r.error);
      else {
        setAnnulation(null);
        setMotif("");
        router.refresh();
      }
    });
  };

  if (taches.length === 0) {
    return (
      <p style={{ color: SOUS, fontSize: 15, margin: "12px 0" }}>
        Rien à faire chez les locataires.
      </p>
    );
  }

  // Groupées par heure prévue, puis par box : c'est l'ordre dans lequel on
  // traverse la maison, pas l'ordre alphabétique d'une base de données.
  const groupes = new Map<string, TacheDuJour[]>();
  for (const t of [...taches].sort((a, b) => {
    const ha = a.heure_prevue ?? "~";
    const hb = b.heure_prevue ?? "~";
    if (ha !== hb) return ha < hb ? -1 : 1;
    return (a.box ?? "~").localeCompare(b.box ?? "~");
  })) {
    const cle = t.heure_prevue ? t.heure_prevue.slice(0, 5) : "Sans heure";
    const liste = groupes.get(cle);
    if (liste) liste.push(t);
    else groupes.set(cle, [t]);
  }

  return (
    <div style={{ minWidth: 0 }}>
      {erreur && (
        <p role="alert" style={{
          background: "#FBE2DE", color: "#A8453A", padding: "10px 12px",
          borderRadius: 12, fontSize: 14, fontWeight: 600, margin: "0 0 12px",
        }}>
          {erreur}
        </p>
      )}

      {[...groupes.entries()].map(([heure, lignes]) => (
        <section key={heure} style={{ marginBottom: 20, minWidth: 0 }}>
          <h2 style={{
            fontSize: 13, fontWeight: 700, letterSpacing: ".06em",
            textTransform: "uppercase", color: "#C9A84C", margin: "0 0 8px",
          }}>
            {heure}
          </h2>

          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {lignes.map((t) => {
              const faite = t.statut === "faite";
              const annulee = t.statut === "annulee";
              return (
                <li key={t.id} style={{
                  background: "#FFFFFF",
                  border: `1px solid ${t.garde ? "#C9A84C" : "rgba(27,43,94,.10)"}`,
                  borderLeft: t.garde ? "4px solid #C9A84C" : "1px solid rgba(27,43,94,.10)",
                  borderRadius: 14, padding: 12, minWidth: 0,
                  opacity: annulee ? 0.55 : 1,
                }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        margin: 0, fontWeight: 700, color: MARINE, fontSize: 15,
                        overflowWrap: "anywhere",
                        textDecoration: annulee ? "line-through" : "none",
                      }}>
                        {t.prestation}
                        {t.garde && (
                          <span style={{
                            marginLeft: 8, fontSize: 11, fontWeight: 700, padding: "2px 8px",
                            borderRadius: 999, background: "#F4EAC9", color: "#6E5410",
                            whiteSpace: "nowrap",
                          }}>
                            🏠 Garde 24 h
                          </span>
                        )}
                      </p>
                      <p style={{ margin: "4px 0 0", color: SOUS, fontSize: 14, overflowWrap: "anywhere" }}>
                        {t.chien ? `🐶 ${t.chien}` : "🐶 —"} · Box {t.box ?? "—"}
                      </p>
                      <p style={{ margin: "2px 0 0", color: SOUS, fontSize: 13, overflowWrap: "anywhere" }}>
                        {t.client}
                        {t.origine === "forfait" ? " · au forfait" : " · à l'acte"}
                      </p>
                      {t.garde && (
                        <p style={{ margin: "6px 0 0", color: "#6E5410", fontSize: 12 }}>
                          {MENTION_GARDE}
                        </p>
                      )}
                      {t.commentaire && (
                        <p style={{ margin: "6px 0 0", color: SOUS, fontSize: 13 }}>📝 {t.commentaire}</p>
                      )}
                      {annulee && t.motif_annulation && (
                        <p style={{ margin: "6px 0 0", color: "#A8453A", fontSize: 13 }}>
                          Annulée : {t.motif_annulation}
                        </p>
                      )}
                    </div>

                    {!annulee && (
                      <button
                        type="button"
                        onClick={() => basculer(t)}
                        disabled={enCours}
                        aria-pressed={faite}
                        style={{
                          minHeight: CIBLE, minWidth: 88, padding: "10px 14px", borderRadius: 12,
                          border: faite ? "1px solid #1F6E5B" : "1px solid rgba(27,43,94,.2)",
                          background: faite ? "#DFF0E8" : "#1B2B5E",
                          color: faite ? "#1F6E5B" : "#FFFFFF",
                          fontSize: 14, fontWeight: 700, cursor: "pointer", flexShrink: 0,
                        }}
                      >
                        {faite ? "✓ Fait" : "Fait"}
                      </button>
                    )}
                  </div>

                  {faite && t.fait_le && (
                    <p style={{ margin: "8px 0 0", color: SOUS, fontSize: 12 }}>
                      Coché le {new Date(t.fait_le).toLocaleString("fr-CH")}
                    </p>
                  )}

                  {peutAnnuler && !annulee && !faite && (
                    annulation === t.id ? (
                      <div style={{ marginTop: 10 }}>
                        <label htmlFor={`motif-${t.id}`} style={{
                          display: "block", fontSize: 13, fontWeight: 600, color: MARINE, marginBottom: 4,
                        }}>
                          Pourquoi n&apos;a-t-elle pas eu lieu ?
                        </label>
                        <input
                          id={`motif-${t.id}`}
                          value={motif}
                          onChange={(e) => setMotif(e.target.value)}
                          placeholder="Locataire présent, chien absent…"
                          style={{
                            width: "100%", minHeight: CIBLE, padding: "8px 10px",
                            border: "1px solid rgba(27,43,94,.2)", borderRadius: 12, fontSize: 14,
                          }}
                        />
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <button type="button" disabled={enCours}
                            onClick={() => confirmerAnnulation(t.id)}
                            style={{
                              minHeight: CIBLE, padding: "0 16px", borderRadius: 12, border: "none",
                              background: "#A8453A", color: "#FFF", fontWeight: 700, fontSize: 14,
                              cursor: "pointer",
                            }}>
                            Annuler la prestation
                          </button>
                          <button type="button" onClick={() => { setAnnulation(null); setMotif(""); }}
                            style={{
                              minHeight: CIBLE, padding: "0 16px", borderRadius: 12,
                              border: "1px solid rgba(27,43,94,.2)", background: "#FFF",
                              color: MARINE, fontWeight: 600, fontSize: 14, cursor: "pointer",
                            }}>
                            Revenir
                          </button>
                        </div>
                        <p style={{ margin: "6px 0 0", color: SOUS, fontSize: 12 }}>
                          Le motif sort la prestation de la facture, et peut y figurer en note.
                        </p>
                      </div>
                    ) : (
                      <button type="button" onClick={() => { setAnnulation(t.id); setMotif(""); }}
                        style={{
                          marginTop: 8, minHeight: 36, padding: "0 10px", borderRadius: 10,
                          border: "none", background: "transparent", color: "#A8453A",
                          fontSize: 13, fontWeight: 600, cursor: "pointer",
                        }}>
                        Elle n&apos;a pas eu lieu
                      </button>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
