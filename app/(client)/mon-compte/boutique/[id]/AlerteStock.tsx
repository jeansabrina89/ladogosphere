"use client";

import { useActionState, useState } from "react";
import { sInscrireAlerte, annulerMonAlerte, type EtatAlerte } from "./actionsAlerte";

/**
 * « Prévenez-moi quand cet article est de nouveau disponible. »
 *
 * Elle se tient SOUS le bouton d'achat désactivé, pas à sa place : c'est une
 * consolation, pas une étape. Ni fenêtre modale, ni formulaire à remplir —
 * une case, et pour qui n'est pas connecté, un champ d'adresse. Rien d'autre
 * n'est demandé : ni nom, ni téléphone.
 *
 * Quand l'inscription est déjà prise, l'écran le DIT plutôt que de reposer la
 * question : « Vous serez prévenu à … », et un lien pour annuler.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const VERT = "#1F6E5B";
const GRENAT = "#8A1F1F";
const BORDURE = "1px solid rgba(27,43,94,0.16)";
const CIBLE = 44;

const ETAT_VIDE: EtatAlerte = {};

export default function AlerteStock({
  articleId,
  emailConnu,
  dejaInscrit,
}: {
  articleId: string;
  /** L'adresse du compte connecté. Absente : la personne n'est pas connectée. */
  emailConnu: string | null;
  /** L'adresse déjà inscrite sur cet article, relue à chaque affichage. */
  dejaInscrit: string | null;
}) {
  const [etatInscription, inscrire, enCours] = useActionState<EtatAlerte, FormData>(
    sInscrireAlerte.bind(null, articleId),
    ETAT_VIDE
  );

  // L'adresse retenue : celle qu'on vient d'inscrire, ou celle que le serveur
  // a trouvée en rechargeant l'écran. Le même écran montre le même état.
  const inscrite = etatInscription.email ?? (etatInscription.email === null ? null : dejaInscrit);

  const [etatAnnulation, annuler, annulationEnCours] = useActionState<EtatAlerte, FormData>(
    annulerMonAlerte.bind(null, articleId),
    ETAT_VIDE
  );

  const [ouvert, setOuvert] = useState(false);
  const annulee = etatAnnulation.message != null && etatAnnulation.erreur == null;
  const active = inscrite && !annulee;

  const cadre: React.CSSProperties = {
    marginTop: 14, padding: "12px 14px", borderRadius: 14,
    backgroundColor: "#FBF9F5", border: BORDURE,
  };

  if (active) {
    return (
      <div style={cadre}>
        <p style={{ color: VERT, fontSize: 15, fontWeight: 600, margin: 0 }}>
          ✓ Vous serez prévenu à {inscrite}
        </p>
        <p style={{ color: SOUS, fontSize: 13, margin: "4px 0 0" }}>
          Un seul e-mail, au retour de l&apos;article. Rien n&apos;est mis de côté.
        </p>
        <form action={annuler} style={{ margin: "8px 0 0" }}>
          <input type="hidden" name="email" value={inscrite ?? ""} />
          <button
            type="submit"
            disabled={annulationEnCours}
            style={{
              minHeight: 32, padding: 0, border: "none", background: "none",
              color: SOUS, fontSize: 13.5, fontFamily: "inherit",
              textDecoration: "underline", cursor: "pointer",
            }}
          >
            {annulationEnCours ? "…" : "annuler"}
          </button>
        </form>
        {etatAnnulation.erreur && (
          <p role="alert" style={{ color: GRENAT, fontSize: 13.5, margin: "6px 0 0" }}>
            {etatAnnulation.erreur}
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={cadre}>
      <form action={inscrire} style={{ display: "grid", gap: 10 }}>
        {emailConnu ? (
          // Connectée : son adresse est connue, un clic suffit.
          <button
            type="submit"
            disabled={enCours}
            style={{
              minHeight: CIBLE, padding: "0 16px", borderRadius: 12,
              border: `1px solid ${VERT}`, backgroundColor: "#FFFFFF",
              color: VERT, fontSize: 15, fontWeight: 700,
              fontFamily: "inherit", cursor: "pointer", justifySelf: "start",
            }}
          >
            {enCours ? "…" : "🔔 Prévenez-moi quand cet article est de nouveau disponible"}
          </button>
        ) : ouvert ? (
          <>
            <label htmlFor={`alerte-email-${articleId}`} style={{
              fontSize: 14, fontWeight: 600, color: MARINE,
            }}>
              Votre adresse e-mail
            </label>
            <input
              id={`alerte-email-${articleId}`}
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="vous@exemple.ch"
              style={{
                width: "100%", maxWidth: 340, minHeight: CIBLE, padding: "10px 14px",
                border: BORDURE, borderRadius: 12, fontSize: 16, color: MARINE,
                backgroundColor: "#FFFFFF", fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
            <p style={{ color: SOUS, fontSize: 13, margin: 0 }}>
              Elle ne sert qu&apos;à ce message. Nous ne demandons rien d&apos;autre.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="submit"
                disabled={enCours}
                style={{
                  minHeight: CIBLE, padding: "0 16px", borderRadius: 12, border: "none",
                  backgroundColor: VERT, color: "#FFFFFF", fontSize: 15, fontWeight: 700,
                  fontFamily: "inherit", cursor: "pointer",
                }}
              >
                {enCours ? "…" : "Me prévenir"}
              </button>
              <button
                type="button"
                onClick={() => setOuvert(false)}
                style={{
                  minHeight: CIBLE, padding: "0 16px", borderRadius: 12, border: BORDURE,
                  backgroundColor: "#FFFFFF", color: MARINE, fontSize: 15,
                  fontFamily: "inherit", cursor: "pointer",
                }}
              >
                Annuler
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setOuvert(true)}
            style={{
              minHeight: CIBLE, padding: "0 16px", borderRadius: 12,
              border: `1px solid ${VERT}`, backgroundColor: "#FFFFFF",
              color: VERT, fontSize: 15, fontWeight: 700,
              fontFamily: "inherit", cursor: "pointer", justifySelf: "start",
              textAlign: "left",
            }}
          >
            🔔 Prévenez-moi quand cet article est de nouveau disponible
          </button>
        )}

        {etatInscription.erreur && (
          <p role="alert" style={{ color: GRENAT, fontSize: 14, margin: 0 }}>
            {etatInscription.erreur}
          </p>
        )}
      </form>
    </div>
  );
}
