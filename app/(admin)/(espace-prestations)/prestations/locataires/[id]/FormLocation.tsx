"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enregistrerLocataire } from "../../actions";
import type { ClientLocataire } from "./FicheLocataire";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.6)";
const CIBLE = 44;

const champ: React.CSSProperties = {
  width: "100%", minHeight: CIBLE, padding: "8px 10px",
  border: "1px solid rgba(27,43,94,.2)", borderRadius: 12, fontSize: 14,
};
const label: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600, color: MARINE, marginBottom: 4,
};

/**
 * « La location » : la case Locataire de box, le box loué, le loyer refacturé
 * et les dates. Le même formulaire sert à un locataire existant et à un client
 * qu'on s'apprête à cocher : la case suit ce qui est enregistré, jamais cochée
 * d'office.
 */
export default function FormLocation({
  client,
  locataire,
  onEnregistre,
}: {
  client: ClientLocataire;
  /** La case telle qu'elle est enregistrée. */
  locataire: boolean;
  onEnregistre?: () => void;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState("");

  function soumettre(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErreur("");
    demarrer(async () => {
      const r = await enregistrerLocataire(fd);
      if (r.error) setErreur(r.error);
      else { onEnregistre?.(); router.refresh(); }
    });
  }

  return (
    <form onSubmit={soumettre} style={{
      background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
      borderRadius: 16, padding: 16, marginBottom: 16,
    }}>
      {erreur && (
        <p role="alert" style={{
          background: "#FBE2DE", color: "#A8453A", padding: "10px 12px",
          borderRadius: 12, fontSize: 14, fontWeight: 600, margin: "0 0 12px",
        }}>{erreur}</p>
      )}
      <input type="hidden" name="client_id" value={client.id} />
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <input type="checkbox" name="locataire_box" defaultChecked={locataire} />
        <span style={{ fontSize: 14, fontWeight: 600, color: MARINE }}>Locataire de box</span>
      </label>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div>
          <label style={label} htmlFor="el-box">Box loué</label>
          <input id="el-box" name="box_loue" defaultValue={client.box_loue ?? ""} style={champ} />
        </div>
        <div>
          <label style={label} htmlFor="el-loyer">Loyer refacturé (CHF / mois)</label>
          <input id="el-loyer" name="loyer_refacture" type="number" step="0.05" min="0"
            defaultValue={client.loyer_refacture ?? ""} placeholder="— à saisir —" style={champ} />
        </div>
        <div>
          <label style={label} htmlFor="el-depuis">Locataire depuis</label>
          <input id="el-depuis" name="locataire_depuis" type="date"
            defaultValue={client.locataire_depuis ?? ""} style={champ} />
        </div>
        <div>
          <label style={label} htmlFor="el-jusqu">Jusqu&apos;au</label>
          <input id="el-jusqu" name="locataire_jusqu_au" type="date"
            defaultValue={client.locataire_jusqu_au ?? ""} style={champ} />
        </div>
      </div>
      <p style={{ color: SOUS, fontSize: 12, margin: "8px 0 0" }}>
        Le loyer refacturé se SAISIT, il ne se calcule pas depuis la dépense : les deux peuvent
        différer. Le prorata d&apos;un mois incomplet suit les jours réels sur les jours du mois.
      </p>
      <button type="submit" disabled={enCours} style={{
        minHeight: CIBLE, padding: "0 16px", borderRadius: 12, border: "none",
        background: "#4AAEA0", color: "#FFF", fontWeight: 700, fontSize: 14, cursor: "pointer",
        marginTop: 12,
      }}>
        {enCours ? "Enregistrement…" : "💾 Enregistrer"}
      </button>
    </form>
  );
}
