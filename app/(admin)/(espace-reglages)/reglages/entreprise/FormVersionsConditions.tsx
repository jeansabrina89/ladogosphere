"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enregistrerVersionsConditions } from "./actions";
import {
  formatVersion,
  refusVersionConditions,
  type VersionsConditions,
} from "@/src/lib/acceptationsConditionsLogique";
import { LIEN_CONDITIONS_PENSION, LIEN_CONDITIONS_VENTE } from "@/src/lib/liensLegaux";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.6)";
const VERT = "#1F6E5B";
const GRENAT = "#8A1F1F";

const DOCUMENTS = [
  { cle: "pension" as const, titre: "Conditions de la pension", lien: LIEN_CONDITIONS_PENSION },
  { cle: "vente" as const, titre: "Conditions de vente", lien: LIEN_CONDITIONS_VENTE },
];

/**
 * APP 59 — la version de chaque document de conditions.
 *
 * Elle était une constante du code : il fallait un lot pour reporter une date
 * que Sabrina change sur le site quand elle veut. Entre les deux, les clientes
 * acceptaient sous l'ANCIEN numéro, et rien ne le disait.
 */
export default function FormVersionsConditions({ valeur }: { valeur: VersionsConditions }) {
  const router = useRouter();
  const [v, setV] = useState<VersionsConditions>(valeur);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);

  const modifie = JSON.stringify(v) !== JSON.stringify(valeur);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setErreur(null);
        setAvis(null);
        for (const { cle, titre } of DOCUMENTS) {
          const refus = refusVersionConditions(v[cle]);
          if (refus) { setErreur(`${titre} : ${refus}`); return; }
        }
        setEnCours(true);
        const fd = new FormData();
        fd.set("conditions_pension_version", v.pension);
        fd.set("conditions_vente_version", v.vente);
        const res = await enregistrerVersionsConditions(fd);
        setEnCours(false);
        if (res.error) { setErreur(res.error); return; }
        setAvis("Versions enregistrées.");
        router.refresh();
      }}
      style={{
        border: "1px solid rgba(27,43,94,0.14)", borderRadius: 16,
        backgroundColor: "#FFFFFF", padding: 16, margin: "16px 0 0",
      }}
    >
      <p style={{ margin: "0 0 4px", color: MARINE, fontSize: 16, fontWeight: 700 }}>
        📜 Conditions
      </p>
      <p style={{ margin: "0 0 12px", color: SOUS, fontSize: 13.5, lineHeight: 1.5 }}>
        Quand vous modifiez ces conditions sur le site, reportez ici la date
        « Dernière mise à jour » de la page. Les clients qui ont accepté une version plus
        ancienne verront un repère, sans être bloqués.
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

      <div style={{ display: "grid", gap: 14 }}>
        {DOCUMENTS.map(({ cle, titre, lien }) => (
          <div key={cle}>
            <p style={{ margin: "0 0 2px", color: MARINE, fontSize: 14, fontWeight: 600 }}>{titre}</p>
            <p style={{ margin: "0 0 6px", color: SOUS, fontSize: 13 }}>
              En vigueur : <strong>{formatVersion(valeur[cle])}</strong>
              {" · "}
              <a href={lien} target="_blank" rel="noopener noreferrer"
                 style={{ color: "#1F6E5B", textDecoration: "underline" }}>
                voir la page du site
              </a>
            </p>
            <input
              type="date"
              id={`version-${cle}`}
              aria-label={titre}
              value={v[cle]}
              onChange={(e) => setV({ ...v, [cle]: e.target.value })}
              style={{
                minHeight: 44, padding: "10px 12px", borderRadius: 12,
                border: "1px solid rgba(27,43,94,0.2)", fontSize: 15,
                fontFamily: "inherit", color: MARINE,
              }}
            />
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={enCours || !modifie}
        style={{
          marginTop: 14, minHeight: 44, padding: "10px 16px", borderRadius: 12, border: "none",
          backgroundColor: VERT, color: "#FFFFFF", fontSize: 15, fontWeight: 600,
          fontFamily: "inherit", cursor: enCours || !modifie ? "default" : "pointer",
          opacity: enCours || !modifie ? 0.6 : 1,
        }}
      >
        {enCours ? "…" : "Enregistrer"}
      </button>
    </form>
  );
}
