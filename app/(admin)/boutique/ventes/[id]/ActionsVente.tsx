"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { passerRetour, envoyerTicket } from "../../caisse/actions";
import { construireRetour, chf, type LigneVendue } from "@/src/lib/caisseLogique";

/**
 * Ce qu'on fait d'une vente une fois passée : l'imprimer, l'envoyer, ou la
 * corriger par un retour. Jamais la modifier — elle est figée.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.14)";
const CIBLE = 52;

const bouton: React.CSSProperties = {
  minHeight: CIBLE, padding: "0 18px", borderRadius: 14, border: BORDURE,
  backgroundColor: "#FFFFFF", color: MARINE, fontSize: 16, fontWeight: 600,
  fontFamily: "inherit", cursor: "pointer", display: "inline-flex",
  alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none",
};

export default function ActionsVente({
  venteId,
  lignes,
  reste,
  avecClient,
  retourPossible,
  messageRetourImpossible,
}: {
  venteId: string;
  lignes: LigneVendue[];
  /** Ce qu'il reste à rendre, par ligne. */
  reste: Record<string, number>;
  avecClient: boolean;
  retourPossible: boolean;
  messageRetourImpossible?: string | null;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [quantites, setQuantites] = useState<Record<string, number>>({});
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [cle] = useState(() => nouvelleCle());

  const retour = construireRetour(
    lignes,
    quantites,
    // Ce qui a déjà été rendu est déjà déduit dans `reste` : on part de lui.
    lignes.flatMap((l) => {
      const dejaRendu = Number(l.quantite) - (reste[l.id] ?? 0);
      return dejaRendu > 0
        ? [{ article_id: l.article_id, libelle: l.libelle, quantite: -dejaRendu }]
        : [];
    })
  );

  async function envoyer() {
    setErreur(null);
    setAvis(null);
    setEnCours(true);
    const res = await envoyerTicket(venteId);
    setEnCours(false);
    if (res.error) return setErreur(res.error);
    setAvis(res.message ?? "Ticket envoyé.");
  }

  async function valider() {
    setErreur(null);
    if (!motif.trim()) return setErreur("Indiquez le motif du retour.");
    if (retour.lignes.length === 0) return setErreur("Choisissez au moins une ligne à rendre.");

    setEnCours(true);
    const res = await passerRetour({ vente_id: venteId, cle_idempotence: cle, quantites, motif });
    setEnCours(false);

    if (res.error) return setErreur(res.error);
    setOuvert(false);
    router.push(`/boutique/ventes/${res.id}`);
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <a href={`/api/ventes/${venteId}/ticket`} target="_blank" rel="noreferrer"
           style={{ ...bouton, backgroundColor: MARINE, color: "#FFFFFF", border: "none" }}>
          🖨️ Imprimer le ticket
        </a>
        {avecClient && (
          <button type="button" onClick={envoyer} disabled={enCours} style={bouton}>
            ✉️ Envoyer par e-mail
          </button>
        )}
        {retourPossible && !ouvert && (
          <button type="button" onClick={() => { setOuvert(true); setErreur(null); }} style={bouton}>
            ↩ Retour
          </button>
        )}
      </div>

      {!retourPossible && messageRetourImpossible && (
        <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>{messageRetourImpossible}</p>
      )}

      {avis && (
        <p role="status" style={{
          backgroundColor: "#E4F1EC", color: "#1F6E5B", border: "1px solid #B9DDD1",
          borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 600, margin: 0,
        }}>
          ✅ {avis}
        </p>
      )}

      {ouvert && (
        <div style={{ border: BORDURE, borderRadius: 16, padding: 14, backgroundColor: "#FFFDF6" }}>
          <h3 style={{ color: MARINE, fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>
            Retour ou erreur de caisse
          </h3>
          <p style={{ color: SOUS, fontSize: 14, margin: "0 0 14px" }}>
            Le stock remonte, une écriture inverse est passée, et un ticket de retour numéroté
            est produit. La vente n&apos;est jamais supprimée.
          </p>

          <div style={{ display: "grid", gap: 12 }}>
            {lignes.map((l) => {
              const max = reste[l.id] ?? 0;
              const valeur = quantites[l.id] ?? 0;
              return (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {/* Le libellé cède la place ; le compteur, lui, passe à la
                      ligne d'un bloc plutôt que de se disloquer. */}
                  <span style={{ flex: "1 1 160px", minWidth: 0, overflowWrap: "anywhere" }}>
                    <span style={{ display: "block", color: MARINE, fontSize: 15, fontWeight: 600 }}>{l.libelle}</span>
                    <span style={{ display: "block", color: SOUS, fontSize: 13 }}>
                      {max > 0 ? `${max} à rendre au maximum` : "déjà entièrement rendu"}
                    </span>
                  </span>

                  <span style={{
                    display: "flex", alignItems: "center", gap: 10,
                    flexShrink: 0, marginLeft: "auto",
                  }}>
                    <button type="button" disabled={valeur <= 0} aria-label={`Rendre un ${l.libelle} de moins`}
                      onClick={() => setQuantites({ ...quantites, [l.id]: Math.max(valeur - 1, 0) })}
                      style={rond}>−</button>
                    <span style={{ minWidth: 28, textAlign: "center", color: MARINE, fontSize: 18, fontWeight: 700 }}>
                      {valeur}
                    </span>
                    <button type="button" disabled={valeur >= max} aria-label={`Rendre un ${l.libelle} de plus`}
                      onClick={() => setQuantites({ ...quantites, [l.id]: Math.min(valeur + 1, max) })}
                      style={rond}>+</button>
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 14 }}>
            <label htmlFor="motif" style={{ display: "block", fontSize: 14, fontWeight: 600, color: MARINE, marginBottom: 6 }}>
              Motif du retour
            </label>
            <input
              id="motif" type="text" value={motif} onChange={(e) => setMotif(e.target.value)}
              placeholder="Article défectueux, erreur de caisse…"
              style={{
                width: "100%", minHeight: CIBLE, padding: "12px 14px", border: BORDURE,
                borderRadius: 14, fontSize: 16, color: MARINE, backgroundColor: "#FFFFFF",
                fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </div>

          <p style={{ color: MARINE, fontSize: 20, fontWeight: 700, margin: "14px 0 0" }}>
            À rembourser : {chf(Math.abs(retour.total))}
          </p>

          {erreur && (
            <p role="alert" style={{
              backgroundColor: "#FDECEC", color: "#8A1F1F", border: "1px solid #F0C2C2",
              borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 600, margin: "12px 0 0",
            }}>
              ⚠️ {erreur}
            </p>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button type="button" onClick={valider} disabled={enCours}
              style={{ ...bouton, backgroundColor: "#2E8B7E", color: "#FFFFFF", border: "none", flex: 1 }}>
              {enCours ? "Enregistrement…" : "Valider le retour"}
            </button>
            <button type="button" onClick={() => { setOuvert(false); setQuantites({}); setErreur(null); }}
              style={bouton}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {erreur && !ouvert && (
        <p role="alert" style={{
          backgroundColor: "#FDECEC", color: "#8A1F1F", border: "1px solid #F0C2C2",
          borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 600, margin: 0,
        }}>
          ⚠️ {erreur}
        </p>
      )}
    </div>
  );
}

const rond: React.CSSProperties = {
  width: CIBLE, height: CIBLE, flexShrink: 0, borderRadius: 14, border: BORDURE,
  backgroundColor: "#FFFFFF", color: MARINE, fontSize: 24, fontWeight: 700,
  fontFamily: "inherit", cursor: "pointer", lineHeight: 1,
};

function nouvelleCle(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
