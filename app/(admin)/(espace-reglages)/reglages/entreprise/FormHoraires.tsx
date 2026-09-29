"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enregistrerHoraires } from "./actions";
import {
  LIBELLES_HORAIRES,
  formatHoraire,
  refusHoraire,
  type Horaires,
} from "@/src/lib/horaires";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.6)";
const VERT = "#1F6E5B";
const GRENAT = "#8A1F1F";

/**
 * APP 59 — les horaires d'accueil, réglés à un seul endroit.
 *
 * Les heures vivaient en dur à sept endroits : deux encadrés d'e-mail, trois
 * avertissements du personnel, les créneaux proposés au client et les bornes
 * de la journée du personnel. La première oubliée aurait dit autre chose que
 * les six autres.
 *
 * Chaque champ montre SA LECTURE en clair sous lui : c'est la même fonction
 * qui écrit les encadrés d'e-mail, donc ce qu'on lit ici est mot pour mot ce
 * que la cliente recevra.
 */
export default function FormHoraires({ valeur }: { valeur: Horaires }) {
  const router = useRouter();
  const [h, setH] = useState<Horaires>(valeur);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [champFautif, setChampFautif] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);

  const modifie = JSON.stringify(h) !== JSON.stringify(valeur);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setErreur(null);
        setChampFautif(null);
        setAvis(null);

        // Le refus est d'abord cherché ici : inutile d'aller au serveur pour
        // une heure mal écrite, et la phrase est la même des deux côtés.
        for (const { cle, libelle } of LIBELLES_HORAIRES) {
          const refus = refusHoraire(h[cle]);
          if (refus) {
            setChampFautif(cle);
            setErreur(`${libelle} : ${refus}`);
            return;
          }
        }

        setEnCours(true);
        const fd = new FormData();
        for (const { cle } of LIBELLES_HORAIRES) fd.set(cle, h[cle]);
        const res = await enregistrerHoraires(fd);
        setEnCours(false);
        if (res.error) {
          setErreur(res.error);
          setChampFautif(res.champ ?? null);
          return;
        }
        setAvis("Horaires enregistrés. Les e-mails et les écrans les reprennent tout de suite.");
        router.refresh();
      }}
      style={{
        border: "1px solid rgba(27,43,94,0.14)", borderRadius: 16,
        backgroundColor: "#FFFFFF", padding: 16, margin: "16px 0 0",
      }}
    >
      <p style={{ margin: "0 0 4px", color: MARINE, fontSize: 16, fontWeight: 700 }}>
        ⏰ Horaires d&apos;accueil
      </p>
      <p style={{ margin: "0 0 12px", color: SOUS, fontSize: 13.5, lineHeight: 1.5 }}>
        Une plage s&apos;écrit <code>07:35-10:00</code>. Deux plages dans la même journée se
        séparent par <code> ; </code>. Une heure seule s&apos;écrit <code>10:00</code>.
        Ces horaires partent dans les e-mails, guident les créneaux proposés aux clients
        et déclenchent l&apos;avertissement du personnel.
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

      <div style={{ display: "grid", gap: 12 }}>
        {LIBELLES_HORAIRES.map(({ cle, libelle }) => (
          <div key={cle}>
            <label htmlFor={`horaire-${cle}`}
                   style={{ display: "block", fontSize: 13, fontWeight: 600, color: SOUS, margin: "0 0 4px" }}>
              {libelle}
            </label>
            <input
              id={`horaire-${cle}`}
              type="text"
              value={h[cle]}
              onChange={(e) => setH({ ...h, [cle]: e.target.value })}
              style={{
                width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 12,
                border: champFautif === cle ? "2px solid #8A1F1F" : "1px solid rgba(27,43,94,0.2)",
                fontSize: 15, fontFamily: "inherit", color: MARINE,
              }}
            />
            <p style={{ margin: "4px 0 0", color: SOUS, fontSize: 13 }}>
              {formatHoraire(h[cle]) || "— à corriger"}
            </p>
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
