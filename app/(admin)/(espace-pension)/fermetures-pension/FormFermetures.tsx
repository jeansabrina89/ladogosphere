"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fermerPension, rouvrirPension } from "./actions";
import {
  refusFermeture,
  reservationsAContacter,
  type Fermeture,
} from "@/src/lib/fermeturesPensionLogique";
import { formatJJMMAAAA } from "@/src/lib/cotisationPeriode";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.6)";
const VERT = "#1F6E5B";
const GRENAT = "#8A1F1F";
const BORDURE = "1px solid rgba(27,43,94,0.14)";

export type ReservationTouchee = {
  id: string;
  date_debut: string;
  date_fin: string;
  client: string;
  chiens: string;
};

type Ligne = Fermeture & { id: string };

/**
 * APP 59 — fermer la pension, et voir qui il faut appeler.
 *
 * L'aperçu « À contacter » se calcule AVANT d'enregistrer, avec la même
 * fonction que le serveur : on voit qui la période touche pendant qu'on la
 * saisit, pas après. Fermer d'abord et découvrir ensuite qu'on a trois familles
 * à prévenir est le genre de surprise qui fait renoncer à se servir de l'écran.
 */
export default function FormFermetures({
  aVenir,
  passees,
  reservations,
  touchees,
}: {
  aVenir: Ligne[];
  passees: Ligne[];
  reservations: ReservationTouchee[];
  /** Pour chaque période à venir, les réservations qu'elle touche. */
  touchees: Record<string, string[]>;
}) {
  const router = useRouter();
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [motif, setMotif] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);

  // L'aperçu, tant que la saisie est cohérente.
  const saisieOk = refusFermeture(debut, fin) === null;
  const aContacter = saisieOk
    ? reservationsAContacter(reservations, { date_debut: debut, date_fin: fin })
    : [];

  async function agir(action: Promise<{ error?: string; message?: string }>) {
    setEnCours(true);
    setErreur(null);
    setAvis(null);
    const res = await action;
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    setAvis(res.message ?? null);
    setDebut("");
    setFin("");
    setMotif("");
    router.refresh();
  }

  const champ: React.CSSProperties = {
    minHeight: 44, padding: "10px 12px", borderRadius: 12,
    border: "1px solid rgba(27,43,94,0.2)", fontSize: 15,
    fontFamily: "inherit", color: MARINE, width: "100%",
  };

  const ligneListe = (f: Ligne, avecBouton: boolean) => (
    <div key={f.id} style={{
      border: BORDURE, borderRadius: 14, backgroundColor: "#FFFFFF", padding: 12,
      display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
    }}>
      <span style={{ flex: "1 1 220px", minWidth: 0 }}>
        <span style={{ display: "block", color: MARINE, fontSize: 15, fontWeight: 600 }}>
          Du {formatJJMMAAAA(f.date_debut)} au {formatJJMMAAAA(f.date_fin)}
        </span>
        <span style={{ display: "block", color: SOUS, fontSize: 13 }}>
          {f.motif?.trim() || "sans motif"}
        </span>
        {(touchees[f.id] ?? []).length > 0 && (
          <span style={{ display: "block", color: GRENAT, fontSize: 13, fontWeight: 600, marginTop: 2 }}>
            À contacter : {(touchees[f.id] ?? [])
              .map((id) => reservations.find((r) => r.id === id))
              .filter((r): r is ReservationTouchee => !!r)
              .map((r) => `${r.client}${r.chiens ? ` (${r.chiens})` : ""} — du ${formatJJMMAAAA(r.date_debut)} au ${formatJJMMAAAA(r.date_fin)}`)
              .join(" · ")}
          </span>
        )}
      </span>
      {avecBouton && (
        <button
          type="button"
          disabled={enCours}
          onClick={() => {
            if (!window.confirm("Retirer cette période de fermeture ?")) return;
            void agir(rouvrirPension(f.id));
          }}
          style={{
            minHeight: 44, padding: "10px 14px", borderRadius: 12, border: BORDURE,
            backgroundColor: "#FFFFFF", color: MARINE, fontSize: 15, fontWeight: 600,
            fontFamily: "inherit", cursor: enCours ? "default" : "pointer",
          }}
        >
          Retirer
        </button>
      )}
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {erreur && (
        <p role="alert" style={{
          backgroundColor: "#FDECEC", color: GRENAT, border: "1px solid #F0C2C2",
          borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 600, margin: 0,
        }}>{erreur}</p>
      )}
      {avis && (
        <p role="status" style={{ color: VERT, fontSize: 15, fontWeight: 600, margin: 0 }}>{avis}</p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const refus = refusFermeture(debut, fin);
          if (refus) { setErreur(refus); return; }
          const fd = new FormData();
          fd.set("date_debut", debut);
          fd.set("date_fin", fin);
          fd.set("motif", motif);
          void agir(fermerPension(fd));
        }}
        style={{ border: BORDURE, borderRadius: 16, backgroundColor: "#FFFFFF", padding: 16 }}
      >
        <p style={{ margin: "0 0 12px", color: MARINE, fontSize: 16, fontWeight: 700 }}>
          Fermer une période
        </p>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: SOUS }}>
            Du
            <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} style={champ} required />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: SOUS }}>
            Au
            <input type="date" value={fin} min={debut} onChange={(e) => setFin(e.target.value)} style={champ} required />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: SOUS }}>
            Motif (vu du client)
            <input type="text" value={motif} onChange={(e) => setMotif(e.target.value)}
                   placeholder="Vacances annuelles" style={champ} />
          </label>
        </div>

        {/*
          L'aperçu avant d'enregistrer : on voit qui la période touche pendant
          qu'on la saisit. La même fonction que le serveur, pour que les deux ne
          puissent pas dire des choses différentes.
        */}
        {saisieOk && aContacter.length > 0 && (
          <p role="status" style={{
            marginTop: 12, backgroundColor: "#FDF6E3", border: "1px solid #C9A84C",
            borderRadius: 12, padding: "10px 12px", color: "#6E5410", fontSize: 14,
          }}>
            À contacter : {aContacter.length} réservation{aContacter.length > 1 ? "s" : ""} déjà posée
            {aContacter.length > 1 ? "s" : ""} — {aContacter
              .map((r) => `${r.client}${r.chiens ? ` (${r.chiens})` : ""}`)
              .join(" · ")}. Elles ne sont pas annulées.
          </p>
        )}

        <button type="submit" disabled={enCours}
          style={{
            marginTop: 14, minHeight: 44, padding: "10px 16px", borderRadius: 12, border: "none",
            backgroundColor: VERT, color: "#FFFFFF", fontSize: 15, fontWeight: 600,
            fontFamily: "inherit", cursor: enCours ? "default" : "pointer", opacity: enCours ? 0.6 : 1,
          }}>
          {enCours ? "…" : "Fermer la pension"}
        </button>
      </form>

      <section style={{ display: "grid", gap: 10 }}>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", color: MARINE, fontSize: 18, margin: 0 }}>
          À venir
        </h2>
        {aVenir.length === 0
          ? <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>Aucune fermeture prévue.</p>
          : aVenir.map((f) => ligneListe(f, true))}
      </section>

      {passees.length > 0 && (
        <section style={{ display: "grid", gap: 10 }}>
          <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", color: MARINE, fontSize: 18, margin: 0 }}>
            Passées
          </h2>
          {/* Passées : on les garde pour mémoire, on ne les retire plus. */}
          {passees.map((f) => ligneListe(f, false))}
        </section>
      )}
    </div>
  );
}
