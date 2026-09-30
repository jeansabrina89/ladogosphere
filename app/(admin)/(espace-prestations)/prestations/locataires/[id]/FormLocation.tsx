"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enregistrerLocataire } from "../../actions";
import {
  AIDE_NUMERO_BOX,
  LIEN_REFACTURER,
  estBoxRefacture,
  type SorteBox,
} from "@/src/lib/boxPriveLogique";
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
  sorte,
  onEnregistre,
}: {
  client: ClientLocataire;
  /** La case telle qu'elle est enregistrée. */
  locataire: boolean;
  /**
   * APP 61 — « privé » ou « refacturé ».
   *
   * Un CLIENT BOX PRIVÉ ne voit pas le champ loyer : Sabrina ne lui refacture
   * rien, et un champ qu'on ne devrait pas remplir finit par l'être. Un BOX
   * REFACTURÉ le voit, et il est obligatoire.
   *
   * Le cas rare — refacturer le loyer d'un box privé — passe par un lien
   * discret, sur décision explicite.
   */
  sorte?: SorteBox;
  onEnregistre?: () => void;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState("");

  // La sorte demandée par l'écran, ou celle que la fiche porte déjà.
  const sorteInitiale: SorteBox = sorte ?? (estBoxRefacture(client) ? "refacture" : "prive");
  const [refacture, setRefacture] = useState(sorteInitiale === "refacture");

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
      {/*
        La SORTE part avec le formulaire : c'est elle qui décide si un loyer
        s'écrit. L'action la relit, et se replie sur « privé » si elle manque —
        la sorte qui n'écrit rien.
      */}
      <input type="hidden" name="sorte" value={refacture ? "refacture" : "prive"} />
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <input type="checkbox" name="locataire_box" defaultChecked={locataire} />
        <span style={{ fontSize: 14, fontWeight: 600, color: MARINE }}>Client box privé</span>
      </label>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div>
          <label style={label} htmlFor="el-box">Box loué</label>
          <input id="el-box" name="box_loue" defaultValue={client.box_loue ?? ""} style={champ} />
          <p style={{ color: SOUS, fontSize: 12, margin: "4px 0 0" }}>{AIDE_NUMERO_BOX}</p>
        </div>
        {/*
          Le champ n'est RENDU que pour un box refacturé. Absent du formulaire,
          il n'est pas envoyé — et l'action, elle, n'écrit aucun loyer quand la
          sorte est « privé », même si la requête en porte un.
        */}
        {refacture && (
          <div>
            <label style={label} htmlFor="el-loyer">Loyer mensuel refacturé (CHF)</label>
            <input id="el-loyer" name="loyer_refacture" type="number" step="0.05" min="0.05"
              required
              defaultValue={client.loyer_refacture ?? ""} placeholder="— à saisir —" style={champ} />
          </div>
        )}
        <div>
          <label style={label} htmlFor="el-depuis">Depuis le</label>
          <input id="el-depuis" name="locataire_depuis" type="date"
            defaultValue={client.locataire_depuis ?? ""} style={champ} />
        </div>
        <div>
          <label style={label} htmlFor="el-jusqu">Jusqu&apos;au</label>
          <input id="el-jusqu" name="locataire_jusqu_au" type="date"
            defaultValue={client.locataire_jusqu_au ?? ""} style={champ} />
        </div>
      </div>
      {refacture ? (
        <p style={{ color: SOUS, fontSize: 12, margin: "8px 0 0" }}>
          Le loyer refacturé se SAISIT, il ne se calcule pas depuis la dépense : les deux peuvent
          différer. Le prorata d&apos;un mois incomplet suit les jours réels sur les jours du mois.
        </p>
      ) : (
        <button type="button" onClick={() => setRefacture(true)} style={{
          background: "none", border: "none", padding: 0, marginTop: 8,
          color: "#1F6E5B", fontSize: 12.5, fontWeight: 600,
          textDecoration: "underline", cursor: "pointer", fontFamily: "inherit",
        }}>
          {LIEN_REFACTURER}
        </button>
      )}
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
