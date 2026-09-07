"use client";

import { useActionState } from "react";
import {
  validerDepense,
  payerDepense,
  annulerDepense,
  supprimerBrouillon,
  type EtatDepense,
} from "../actions";
import { MESSAGE_JUSTIFICATIF_REQUIS } from "@/src/lib/depensesLogique";

const INITIAL: EtatDepense = { erreur: null };

const MARINE = "#1B2B5E";
const BORDURE = "1px solid rgba(27,43,94,0.16)";

const bouton = (fond: string, texte: string, actif: boolean): React.CSSProperties => ({
  minHeight: 52,
  padding: "0 20px",
  borderRadius: 14,
  border: fond === "#FFFFFF" ? BORDURE : "none",
  backgroundColor: actif ? fond : "#D8D3CA",
  color: actif ? texte : "rgba(27,43,94,0.45)",
  fontSize: 15,
  fontWeight: 700,
  fontFamily: "inherit",
  cursor: actif ? "pointer" : "not-allowed",
  width: "100%",
});

const champ: React.CSSProperties = {
  minHeight: 52,
  padding: "12px 14px",
  border: BORDURE,
  borderRadius: 14,
  fontSize: 16,
  color: MARINE,
  backgroundColor: "#FFFFFF",
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
};

function Erreur({ texte }: { texte: string | null }) {
  if (!texte) return null;
  return (
    <p
      aria-live="polite"
      style={{
        backgroundColor: "#FDECEC", color: "#8A1F1F", border: "1px solid #F0C2C2",
        borderRadius: 12, padding: "10px 12px", fontSize: 14, fontWeight: 600, margin: "10px 0 0",
      }}
    >
      ⚠️ {texte}
    </p>
  );
}

/** Validation d'un brouillon — refusée tant qu'aucune pièce n'est jointe. */
export function BoutonValider({ id, nbPieces }: { id: string; nbPieces: number }) {
  const [etat, action, enCours] = useActionState(validerDepense, INITIAL);
  const possible = nbPieces > 0;

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={!possible || enCours} style={bouton("#2E8B7E", "#FFFFFF", possible && !enCours)}>
        {enCours ? "Validation…" : "Valider la dépense"}
      </button>
      {!possible && (
        <p style={{ fontSize: 12, color: "rgba(27,43,94,0.55)", textAlign: "center", marginTop: 6 }}>
          {MESSAGE_JUSTIFICATIF_REQUIS}
        </p>
      )}
      <Erreur texte={etat.erreur} />
    </form>
  );
}

/** Règlement d'une dépense restée « à payer ». */
export function FormReglement({ id, dateDuJour }: { id: string; dateDuJour: string }) {
  const [etat, action, enCours] = useActionState(payerDepense, INITIAL);

  return (
    <form action={action} style={{ display: "grid", gap: 10 }}>
      <input type="hidden" name="id" value={id} />
      <label style={{ fontSize: 13, fontWeight: 600, color: MARINE }}>
        Réglée le
        <input type="date" name="date_paiement" defaultValue={dateDuJour} style={{ ...champ, marginTop: 6 }} required />
      </label>
      <label style={{ fontSize: 13, fontWeight: 600, color: MARINE }}>
        Par
        <select name="mode" defaultValue="banque" style={{ ...champ, marginTop: 6 }}>
          <option value="banque">Banque</option>
          <option value="carte">Carte</option>
          <option value="twint">TWINT</option>
          <option value="caisse">Espèces (caisse)</option>
        </select>
      </label>
      <button type="submit" disabled={enCours} style={bouton("#2E8B7E", "#FFFFFF", !enCours)}>
        {enCours ? "Enregistrement…" : "Marquer réglée"}
      </button>
      <Erreur texte={etat.erreur} />
    </form>
  );
}

/** Annulation par contre-écriture : le motif est obligatoire. */
export function FormAnnulation({ id }: { id: string }) {
  const [etat, action, enCours] = useActionState(annulerDepense, INITIAL);

  return (
    <form action={action} style={{ display: "grid", gap: 10 }}>
      <input type="hidden" name="id" value={id} />
      <label style={{ fontSize: 13, fontWeight: 600, color: MARINE }}>
        Motif de l&apos;annulation
        <input
          type="text" name="motif" required
          placeholder="Doublon, montant erroné…"
          style={{ ...champ, marginTop: 6 }}
        />
      </label>
      <button type="submit" disabled={enCours} style={bouton("#FFFFFF", "#A8453A", !enCours)}>
        {enCours ? "Annulation…" : "Annuler par contre-écriture"}
      </button>
      <p style={{ fontSize: 12, color: "rgba(27,43,94,0.55)", margin: 0 }}>
        La dépense reste au grand-livre : une écriture inverse la neutralise.
      </p>
      <Erreur texte={etat.erreur} />
    </form>
  );
}

/** Suppression d'un brouillon — jamais d'une dépense validée. */
export function BoutonSupprimerBrouillon({ id }: { id: string }) {
  const [etat, action, enCours] = useActionState(supprimerBrouillon, INITIAL);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={enCours} style={bouton("#FFFFFF", "#A8453A", !enCours)}>
        {enCours ? "Suppression…" : "Supprimer le brouillon"}
      </button>
      <Erreur texte={etat.erreur} />
    </form>
  );
}
