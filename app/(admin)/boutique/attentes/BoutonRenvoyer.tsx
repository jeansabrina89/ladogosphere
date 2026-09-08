"use client";

import { useActionState } from "react";
import { renvoyer, type EtatAttentes } from "./actions";

const VIDE: EtatAttentes = {};

/** Le rattrapage : quand l'e-mail n'est manifestement pas arrivé. */
export default function BoutonRenvoyer({ alerteId }: { alerteId: string }) {
  const [etat, action, enCours] = useActionState<EtatAttentes, FormData>(renvoyer, VIDE);

  return (
    <form action={action} style={{ display: "grid", gap: 4, justifyItems: "start" }}>
      <input type="hidden" name="alerte_id" value={alerteId} />
      <button
        type="submit"
        disabled={enCours}
        style={{
          minHeight: 44, padding: "0 14px", borderRadius: 12,
          border: "1px solid rgba(27,43,94,0.16)", backgroundColor: "#FFFFFF",
          color: "#1B2B5E", fontSize: 14, fontWeight: 600,
          fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        {enCours ? "…" : "↻ Renvoyer"}
      </button>
      {etat.erreur && (
        <span role="alert" style={{ color: "#8A1F1F", fontSize: 12.5 }}>{etat.erreur}</span>
      )}
      {etat.message && (
        <span role="status" style={{ color: "#1F6E5B", fontSize: 12.5 }}>{etat.message}</span>
      )}
    </form>
  );
}
