"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ajusterMaSemaine, commanderPrestation } from "./actions";
import { JOURS_SEMAINE, estGarde } from "@/src/lib/prestationsLogique";

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

export default function CommandeLocataire({
  abonnementId,
  semaineProchaine,
  prestations,
  commandeOuverte,
}: {
  clientId: string;
  abonnementId: string | null;
  semaineProchaine: string;
  prestations: { id: string; nom: string; description: string | null; unite: string; prix: number }[];
  commandeOuverte: boolean;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState("");
  const [succes, setSucces] = useState("");

  const soumettre = (action: (fd: FormData) => Promise<{ error?: string }>, message: string) =>
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      const fd = new FormData(form);
      setErreur("");
      setSucces("");
      demarrer(async () => {
        const r = await action(fd);
        if (r.error) setErreur(r.error);
        else {
          setSucces(message);
          form.reset();
          router.refresh();
        }
      });
    };

  // Une garde ne se commande pas en ligne : elle engage 24 h de responsabilité.
  const commandables = prestations.filter((p) => !estGarde(p.unite));

  return (
    <div style={{ minWidth: 0 }}>
      {erreur && (
        <p role="alert" style={{
          background: "#FBE2DE", color: "#A8453A", padding: "10px 12px",
          borderRadius: 12, fontSize: 14, fontWeight: 600, margin: "0 0 12px",
        }}>{erreur}</p>
      )}
      {succes && (
        <p role="status" style={{
          background: "#DFF0E8", color: "#1F6E5B", padding: "10px 12px",
          borderRadius: 12, fontSize: 14, fontWeight: 600, margin: "0 0 12px",
        }}>{succes}</p>
      )}

      <section style={{
        background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
        borderRadius: 16, padding: 16, marginBottom: 16,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: MARINE, margin: "0 0 8px" }}>
          Demander une prestation
        </h2>
        {!commandeOuverte ? (
          <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>
            Les demandes passent par la pension. Appelez-nous, nous l&apos;ajouterons pour vous.
          </p>
        ) : commandables.length === 0 ? (
          <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>
            Aucune prestation disponible pour l&apos;instant.
          </p>
        ) : (
          <form onSubmit={soumettre(commanderPrestation, "Demande enregistrée.")}>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <div>
                <label style={label} htmlFor="cl-prestation">Prestation</label>
                <select id="cl-prestation" name="prestation_id" required style={champ}>
                  <option value="">— choisir —</option>
                  {commandables.map((p) => (
                    <option key={p.id} value={p.id}>{p.nom} — {p.prix.toFixed(2)} CHF</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label} htmlFor="cl-date">Jour</label>
                <input id="cl-date" name="date" type="date" required style={champ} />
              </div>
              <div>
                <label style={label} htmlFor="cl-heure">Heure souhaitée</label>
                <input id="cl-heure" name="heure_prevue" type="time" style={champ} />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={label} htmlFor="cl-com">Précision</label>
              <input id="cl-com" name="commentaire" placeholder="Un mot pour l'équipe" style={champ} />
            </div>
            <button type="submit" disabled={enCours} style={{
              marginTop: 12, minHeight: CIBLE, padding: "0 18px", borderRadius: 12,
              border: "none", background: "#4AAEA0", color: "#FFF", fontWeight: 700,
              fontSize: 14, cursor: "pointer",
            }}>
              {enCours ? "Envoi…" : "Demander"}
            </button>
            <p style={{ color: SOUS, fontSize: 12, margin: "8px 0 0" }}>
              Une garde pendant votre absence se convient au téléphone : elle engage la pension
              pour la journée entière.
            </p>
          </form>
        )}
      </section>

      {abonnementId && (
        <section style={{
          background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
          borderRadius: 16, padding: 16,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: MARINE, margin: "0 0 4px" }}>
            Ajuster mes jours — semaine {semaineProchaine}
          </h2>
          <p style={{ color: SOUS, fontSize: 12, margin: "0 0 12px" }}>
            Choisissez les jours qui vous arrangent pour la semaine à venir. Votre formule ne change
            pas : c&apos;est la même chose, à d&apos;autres jours.
          </p>
          {prestations.length === 0 ? (
            <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>—</p>
          ) : (
            prestations.map((p) => (
              <form key={p.id} onSubmit={soumettre(ajusterMaSemaine, "Semaine ajustée.")}
                style={{ borderTop: "1px solid rgba(27,43,94,.08)", paddingTop: 10, marginTop: 10 }}>
                <input type="hidden" name="abonnement_id" value={abonnementId} />
                <input type="hidden" name="semaine" value={semaineProchaine} />
                <input type="hidden" name="prestation_id" value={p.id} />
                <p style={{ fontWeight: 600, color: MARINE, fontSize: 14, margin: "0 0 6px" }}>{p.nom}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {JOURS_SEMAINE.map((j) => (
                    <label key={j} style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      minHeight: CIBLE, padding: "0 12px", borderRadius: 10,
                      border: "1px solid rgba(27,43,94,.2)", fontSize: 13, cursor: "pointer",
                    }}>
                      <input type="checkbox" name="jours" value={j} />
                      {j.slice(0, 3)}
                    </label>
                  ))}
                </div>
                <button type="submit" disabled={enCours} style={{
                  marginTop: 8, minHeight: CIBLE, padding: "0 16px", borderRadius: 12,
                  border: "1px solid rgba(27,43,94,.2)", background: "#FFF",
                  color: MARINE, fontWeight: 600, fontSize: 14, cursor: "pointer",
                }}>
                  Appliquer
                </button>
              </form>
            ))
          )}
        </section>
      )}
    </div>
  );
}
