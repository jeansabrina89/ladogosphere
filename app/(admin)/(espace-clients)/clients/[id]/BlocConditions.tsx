"use client";

import { useActionState, useState } from "react";
import { enregistrerConditionsPapier } from "./actions";
import {
  repereConditions,
  resumeAcceptationPersonnel,
  VERSIONS_CONDITIONS_DEFAUT,
  type Acceptation,
  type VersionsConditions,
} from "@/src/lib/acceptationsConditionsLogique";
import {
  LIEN_CONDITIONS_PENSION,
  LIEN_CONDITIONS_VENTE,
  LIEN_EXTERNE,
  STYLE_LIEN_LEGAL,
} from "@/src/lib/liensLegaux";

/**
 * « Conditions » sur la fiche client (APP 42).
 *
 * Deux lignes — la pension, la vente — et un bouton pour saisir une signature
 * sur papier. Ce que Sabrina y cherche est toujours la même chose : est-ce
 * signé, dans quelle version, et par quel chemin.
 *
 * Seule la PENSION se saisit sur papier : les conditions de vente
 * n'accompagnent qu'une commande en ligne, qui a sa case.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.58)";
const GRENAT = "#8A1F1F";
const VERT = "#1F6E5B";

type Retour = { error?: string; message?: string };
const ETAT_VIDE: Retour = {};

export default function BlocConditions({
  clientId,
  acceptations,
  aujourdhui,
  peutSaisir,
  versions = VERSIONS_CONDITIONS_DEFAUT,
}: {
  clientId: string;
  acceptations: Acceptation[];
  /** La date du jour, décidée par le serveur : le navigateur peut mentir. */
  aujourdhui: string;
  /** `perm_clients_modifier` : faire signer un papier fait partie de l'accueil. */
  peutSaisir: boolean;
  /**
   * Les versions en vigueur, réglées dans Réglages → Entreprise (APP 59).
   * Le repli sur les valeurs de départ vaut pour un écran monté sans la prop.
   */
  versions?: VersionsConditions;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, envoyer, enCours] = useActionState<Retour, FormData>(
    async (_precedent, formData) => enregistrerConditionsPapier(formData),
    ETAT_VIDE,
  );

  const repere = repereConditions(acceptations, "pension", versions);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <h2 style={{ color: MARINE, fontSize: 17, fontWeight: 700, margin: 0 }}>
        📄 Conditions
      </h2>

      {repere && (
        <p style={{
          backgroundColor: "#F4EAC9", border: "1px solid #C9A84C", borderRadius: 10,
          padding: "8px 12px", margin: 0, color: "#6E5410", fontSize: 14, fontWeight: 600,
        }}>
          ⚠️ {repere}
        </p>
      )}

      <dl style={{ display: "grid", gap: 8, margin: 0 }}>
        {([
          ["pension", "Conditions de la pension", LIEN_CONDITIONS_PENSION],
          ["vente", "Conditions de vente", LIEN_CONDITIONS_VENTE],
        ] as const).map(([document, titre, lien]) => (
          <div key={document}>
            <dt style={{ color: MARINE, fontSize: 14.5, fontWeight: 600 }}>
              <a href={lien} {...LIEN_EXTERNE} style={STYLE_LIEN_LEGAL}>{titre}</a>
            </dt>
            <dd style={{ color: SOUS, fontSize: 14, margin: "2px 0 0" }}>
              {resumeAcceptationPersonnel(acceptations, document)}
            </dd>
          </div>
        ))}
      </dl>

      {peutSaisir && (
        ouvert ? (
          <form action={envoyer} style={{ display: "grid", gap: 8, maxWidth: 340 }}>
            <input type="hidden" name="client_id" value={clientId} />
            <label style={{ color: MARINE, fontSize: 14, fontWeight: 600 }}>
              Date de la signature
              <input
                type="date"
                name="signee_le"
                defaultValue={aujourdhui}
                max={aujourdhui}
                required
                style={{
                  display: "block", width: "100%", marginTop: 4, minHeight: 40,
                  padding: "8px 10px", borderRadius: 10,
                  border: "1px solid rgba(27,43,94,0.2)", fontSize: 15, fontFamily: "inherit",
                }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" disabled={enCours} style={{
                minHeight: 40, padding: "0 14px", borderRadius: 10, border: "none",
                backgroundColor: enCours ? "#B9CFC9" : VERT, color: "#FFFFFF",
                fontSize: 14.5, fontWeight: 700, fontFamily: "inherit",
                cursor: enCours ? "not-allowed" : "pointer",
              }}>
                {enCours ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button type="button" onClick={() => setOuvert(false)} style={{
                minHeight: 40, padding: "0 14px", borderRadius: 10,
                border: "1px solid rgba(27,43,94,0.2)", backgroundColor: "#FFFFFF",
                color: MARINE, fontSize: 14.5, fontFamily: "inherit", cursor: "pointer",
              }}>
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <div>
            <button type="button" onClick={() => setOuvert(true)} style={{
              minHeight: 40, padding: "0 14px", borderRadius: 10,
              border: `1px solid ${VERT}`, backgroundColor: "#FFFFFF",
              color: VERT, fontSize: 14.5, fontWeight: 700,
              fontFamily: "inherit", cursor: "pointer", textAlign: "left",
            }}>
              ✍️ Conditions de la pension signées sur papier
            </button>
          </div>
        )
      )}

      {etat.error && (
        <p role="alert" style={{ color: GRENAT, fontSize: 14, margin: 0 }}>{etat.error}</p>
      )}
      {etat.message && !etat.error && (
        <p role="status" style={{ color: VERT, fontSize: 14, margin: 0 }}>{etat.message}</p>
      )}
    </div>
  );
}
