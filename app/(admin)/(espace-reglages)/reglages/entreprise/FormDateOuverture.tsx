"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enregistrerDateOuverture } from "./actions";
import { dateOuvertureLongue } from "@/src/lib/ouvertureLogique";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.6)";
const VERT = "#1F6E5B";
const GRENAT = "#8A1F1F";

/**
 * APP 56 — la date d'ouverture, réglée à un seul endroit.
 *
 * Le champ est volontairement effaçable : le vider est le geste du jour de
 * l'ouverture, et il rend à l'application son comportement d'origine sans
 * qu'on touche au code. Un réglage qu'on ne peut pas retirer devient une panne
 * le jour où il est de trop.
 */
export default function FormDateOuverture({ valeur }: { valeur: string }) {
  const router = useRouter();
  const [saisie, setSaisie] = useState(valeur);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);

  const enClair = dateOuvertureLongue(saisie);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setEnCours(true);
        setErreur(null);
        setAvis(null);
        const fd = new FormData();
        fd.set("date_ouverture", saisie);
        const res = await enregistrerDateOuverture(fd);
        setEnCours(false);
        if (res.error) { setErreur(res.error); return; }
        setAvis(saisie === ""
          ? "Date effacée : plus aucune restriction de date."
          : `Ouverture fixée au ${dateOuvertureLongue(saisie)}.`);
        router.refresh();
      }}
      style={{
        border: "1px solid rgba(27,43,94,0.14)", borderRadius: 16,
        backgroundColor: "#FFFFFF", padding: 16, margin: "16px 0 0",
      }}
    >
      <p style={{ margin: "0 0 4px", color: MARINE, fontSize: 16, fontWeight: 700 }}>
        📅 Date d&apos;ouverture
      </p>
      <p style={{ margin: "0 0 12px", color: SOUS, fontSize: 13.5, lineHeight: 1.5 }}>
        Avant cette date, les clients ne peuvent ni réserver ni commander en ligne.
        Laissez vide une fois ouvert.
      </p>

      {erreur && (
        <p role="alert" style={{ color: GRENAT, fontSize: 14, fontWeight: 600, margin: "0 0 10px" }}>
          {erreur}
        </p>
      )}
      {avis && (
        <p role="status" style={{ color: VERT, fontSize: 14, fontWeight: 600, margin: "0 0 10px" }}>
          {avis}
        </p>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="date"
          id="date_ouverture"
          name="date_ouverture"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          style={{
            minHeight: 44, padding: "10px 12px", borderRadius: 12,
            border: "1px solid rgba(27,43,94,0.2)", fontSize: 15,
            fontFamily: "inherit", color: MARINE,
          }}
        />
        <button
          type="submit"
          disabled={enCours}
          style={{
            minHeight: 44, padding: "10px 16px", borderRadius: 12, border: "none",
            backgroundColor: VERT, color: "#FFFFFF", fontSize: 15, fontWeight: 600,
            fontFamily: "inherit", cursor: enCours ? "default" : "pointer", opacity: enCours ? 0.6 : 1,
          }}
        >
          {enCours ? "…" : "Enregistrer"}
        </button>
      </div>

      <p style={{ margin: "10px 0 0", color: SOUS, fontSize: 13 }}>
        {enClair
          ? `Les clients lisent : « La Dogosphère ouvre le ${enClair}. »`
          : "Aucune restriction : toutes les dates sont réservables."}
      </p>
    </form>
  );
}
