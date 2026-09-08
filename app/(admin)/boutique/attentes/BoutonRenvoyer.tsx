"use client";

import { useActionState } from "react";
import { renvoyer, type EtatAttentes } from "./actions";

const VIDE: EtatAttentes = {};

/**
 * Le rattrapage : quand l'e-mail n'est manifestement pas arrivé.
 *
 * Sur une demande retirée, il n'y a plus d'adresse à qui écrire. Le bouton
 * reste alors VISIBLE mais grisé, avec la raison écrite dessous : le cacher
 * laisserait croire à un bogue, le laisser actif mentirait.
 */
export default function BoutonRenvoyer({
  alerteId,
  raisonIndisponible,
}: {
  alerteId: string;
  raisonIndisponible?: string;
}) {
  const [etat, action, enCours] = useActionState<EtatAttentes, FormData>(renvoyer, VIDE);
  const impossible = !!raisonIndisponible;

  return (
    <form action={action} style={{ display: "grid", gap: 4, justifyItems: "start" }}>
      <input type="hidden" name="alerte_id" value={alerteId} />
      <button
        type="submit"
        disabled={enCours || impossible}
        title={raisonIndisponible}
        style={{
          minHeight: 44, padding: "0 14px", borderRadius: 12,
          border: "1px solid rgba(27,43,94,0.16)",
          backgroundColor: impossible ? "#F3F1EC" : "#FFFFFF",
          color: impossible ? "rgba(27,43,94,0.45)" : "#1B2B5E",
          fontSize: 14, fontWeight: 600, fontFamily: "inherit",
          cursor: impossible ? "not-allowed" : "pointer", whiteSpace: "nowrap",
        }}
      >
        {enCours ? "…" : "↻ Renvoyer"}
      </button>
      {impossible && (
        <span style={{ color: "rgba(27,43,94,0.55)", fontSize: 12.5 }}>
          {raisonIndisponible}
        </span>
      )}
      {etat.erreur && (
        <span role="alert" style={{ color: "#8A1F1F", fontSize: 12.5 }}>{etat.erreur}</span>
      )}
      {etat.message && (
        <span role="status" style={{ color: "#1F6E5B", fontSize: 12.5 }}>{etat.message}</span>
      )}
    </form>
  );
}
