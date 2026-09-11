"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { annulerChangement, corrigerEntite, preparerChangement } from "./actions";
import {
  FORMAT_IDE,
  FORMES,
  POURQUOI_DEBUT_EXERCICE,
  libelleForme,
  veille,
  type EntiteJuridique,
} from "@/src/lib/entiteJuridiqueLogique";

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
const bouton = (fond: string, texte = "#FFF"): React.CSSProperties => ({
  minHeight: CIBLE, padding: "0 18px", borderRadius: 12, border: "none",
  background: fond, color: texte, fontWeight: 700, fontSize: 14, cursor: "pointer",
});

/** Les champs d'une identité, partagés par la correction et le changement. */
function Champs({ e, prefixe }: { e?: EntiteJuridique; prefixe: string }) {
  const id = (n: string) => `${prefixe}-${n}`;
  return (
    <>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div>
          <label style={label} htmlFor={id("forme")}>Forme juridique</label>
          <select id={id("forme")} name="forme" defaultValue={e?.forme ?? "sarl"} style={champ}>
            {FORMES.map((f) => (
              <option key={f.valeur} value={f.valeur}>{f.libelle}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={label} htmlFor={id("raison")}>Raison sociale</label>
          <input id={id("raison")} name="raison_sociale" required
            defaultValue={e?.raisonSociale ?? ""} style={champ} />
        </div>
        <div>
          <label style={label} htmlFor={id("ide")}>IDE ({FORMAT_IDE})</label>
          <input id={id("ide")} name="ide" defaultValue={e?.ide ?? ""}
            placeholder="CHE-123.456.789" style={champ} />
        </div>
        <div>
          <label style={label} htmlFor={id("tva")}>Numéro de TVA</label>
          <input id={id("tva")} name="numero_tva" defaultValue={e?.numeroTva ?? ""}
            placeholder="— si assujettie —" style={champ} />
        </div>
        <div>
          <label style={label} htmlFor={id("rue")}>Rue</label>
          <input id={id("rue")} name="adresse_rue" defaultValue={e?.adresse.rue ?? ""} style={champ} />
        </div>
        <div>
          <label style={label} htmlFor={id("num")}>N°</label>
          <input id={id("num")} name="adresse_numero" defaultValue={e?.adresse.numero ?? ""} style={champ} />
        </div>
        <div>
          <label style={label} htmlFor={id("npa")}>NPA</label>
          <input id={id("npa")} name="adresse_npa" defaultValue={e?.adresse.npa ?? ""} style={champ} />
        </div>
        <div>
          <label style={label} htmlFor={id("ville")}>Localité</label>
          <input id={id("ville")} name="adresse_ville" defaultValue={e?.adresse.ville ?? ""} style={champ} />
        </div>
        <div>
          <label style={label} htmlFor={id("pays")}>Pays</label>
          <input id={id("pays")} name="adresse_pays" defaultValue={e?.adresse.pays ?? "CH"} style={champ} />
        </div>
        <div>
          <label style={label} htmlFor={id("iban")}>IBAN</label>
          <input id={id("iban")} name="iban" defaultValue={e?.iban ?? ""} style={champ} />
        </div>
        <div>
          <label style={label} htmlFor={id("qriban")}>QR-IBAN</label>
          <input id={id("qriban")} name="qr_iban" defaultValue={e?.qrIban ?? ""}
            placeholder="— si la banque en fournit un —" style={champ} />
        </div>
        <div>
          <label style={label} htmlFor={id("email")}>E-mail</label>
          <input id={id("email")} name="email" type="email" defaultValue={e?.email ?? ""} style={champ} />
        </div>
        <div>
          <label style={label} htmlFor={id("tel")}>Téléphone</label>
          <input id={id("tel")} name="telephone" defaultValue={e?.telephone ?? ""} style={champ} />
        </div>
      </div>
    </>
  );
}

export default function FormEntreprise({
  courante,
  historique,
  futures,
  prochainPremierJanvier,
  manquants,
}: {
  courante: EntiteJuridique | null;
  historique: EntiteJuridique[];
  futures: EntiteJuridique[];
  prochainPremierJanvier: string;
  manquants: string[];
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState("");
  const [succes, setSucces] = useState("");
  const [ouvert, setOuvert] = useState<"corriger" | "changer" | null>(null);
  const [apercu, setApercu] = useState({
    raison: courante?.raisonSociale ?? "",
    forme: courante?.forme ?? "sarl",
  });

  const soumettre = (action: (fd: FormData) => Promise<Resultat>, message: string) =>
    (ev: React.FormEvent<HTMLFormElement>) => {
      ev.preventDefault();
      const fd = new FormData(ev.currentTarget);
      setErreur("");
      setSucces("");
      demarrer(async () => {
        const r = await action(fd);
        if (r.error) setErreur(r.error);
        else { setSucces(message); setOuvert(null); router.refresh(); }
      });
    };

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

      {/* L'identité en vigueur. */}
      <section style={{
        background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
        borderRadius: 16, padding: 16, marginBottom: 16,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: MARINE, margin: "0 0 8px" }}>
          En vigueur aujourd&apos;hui
        </h2>
        {courante ? (
          <>
            <p style={{ margin: 0, fontWeight: 700, color: MARINE, fontSize: 18, overflowWrap: "anywhere" }}>
              {courante.raisonSociale}
            </p>
            <p style={{ color: SOUS, fontSize: 13, margin: "4px 0 0" }}>
              {libelleForme(courante.forme)} · depuis le {courante.dateDebut}
              {courante.dateFin && ` · jusqu'au ${veille(courante.dateFin)}`}
            </p>
            <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, color: SOUS, fontSize: 13 }}>
              <li>IDE : {courante.ide ?? "— à saisir —"}</li>
              <li>Numéro de TVA : {courante.numeroTva ?? "—"}</li>
              <li>IBAN : {courante.iban ?? "— à saisir —"}</li>
              <li>QR-IBAN : {courante.qrIban ?? "—"}</li>
              <li>
                Adresse :{" "}
                {[courante.adresse.rue, courante.adresse.numero, courante.adresse.npa, courante.adresse.ville]
                  .filter(Boolean).join(" ") || "— à saisir —"}
              </li>
              <li>E-mail : {courante.email ?? "— à saisir —"}</li>
            </ul>
            {manquants.length > 0 && (
              <p style={{
                background: "#F4EAC9", border: "1px solid #C9A84C", color: "#6E5410",
                borderRadius: 12, padding: "8px 10px", fontSize: 13, margin: "12px 0 0",
              }}>
                Il manque encore {manquants.join(", ")}. Rien n&apos;est deviné : ces valeurs
                resteront vides sur les documents tant qu&apos;elles ne seront pas saisies.
              </p>
            )}
          </>
        ) : (
          <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>Aucune identité enregistrée.</p>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <button type="button" onClick={() => setOuvert(ouvert === "corriger" ? null : "corriger")}
            style={bouton("#EDE8DF", MARINE)}>
            ✏️ Corriger l&apos;identité
          </button>
          <button type="button" onClick={() => setOuvert(ouvert === "changer" ? null : "changer")}
            style={bouton("#C9A84C")}>
            📅 Préparer un changement d&apos;entité
          </button>
        </div>
      </section>

      {ouvert === "corriger" && courante && (
        <form onSubmit={soumettre(corrigerEntite, "Identité corrigée.")} style={{
          background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
          borderRadius: 16, padding: 16, marginBottom: 16,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: MARINE, margin: "0 0 4px" }}>
            Corriger l&apos;identité en vigueur
          </h2>
          <p style={{ color: SOUS, fontSize: 12, margin: "0 0 12px" }}>
            Ceci ne change aucune date. Les pièces déjà émises gardent leur PDF, qui ne se
            régénère jamais.
          </p>
          <Champs e={courante} prefixe="c" />
          <button type="submit" disabled={enCours} style={{ ...bouton("#4AAEA0"), marginTop: 12 }}>
            {enCours ? "Enregistrement…" : "💾 Enregistrer"}
          </button>
        </form>
      )}

      {ouvert === "changer" && (
        <form onSubmit={soumettre(preparerChangement, "Changement préparé.")} style={{
          background: "#FFF", border: "1px solid #C9A84C",
          borderRadius: 16, padding: 16, marginBottom: 16,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: MARINE, margin: "0 0 4px" }}>
            Préparer un changement d&apos;entité
          </h2>
          <p style={{
            background: "#F4EAC9", color: "#6E5410", borderRadius: 12,
            padding: "10px 12px", fontSize: 13, margin: "0 0 12px",
          }}>
            {POURQUOI_DEBUT_EXERCICE}
          </p>

          <div style={{ maxWidth: 260, marginBottom: 12 }}>
            <label style={label} htmlFor="ch-date">Date d&apos;effet</label>
            <input id="ch-date" name="date_debut" type="date"
              defaultValue={prochainPremierJanvier} style={champ} />
            <p style={{ color: SOUS, fontSize: 12, margin: "4px 0 0" }}>
              L&apos;entité actuelle se fermera la veille. Rien ne bascule avant cette date.
            </p>
          </div>

          <div onChange={(ev) => {
            const cible = ev.target as HTMLInputElement;
            if (cible.name === "raison_sociale") setApercu((a) => ({ ...a, raison: cible.value }));
            if (cible.name === "forme") setApercu((a) => ({ ...a, forme: cible.value as never }));
          }}>
            <Champs prefixe="ch" />
          </div>

          {/* L'aperçu : ce que deviendra une facture le lendemain. */}
          <div style={{
            marginTop: 14, background: "#F5F0E8", borderRadius: 12, padding: 14,
          }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: MARINE, margin: "0 0 6px" }}>
              Aperçu d&apos;une facture émise le lendemain du changement
            </p>
            <p style={{ margin: 0, fontWeight: 700, color: MARINE, fontSize: 15 }}>
              {apercu.raison || "— raison sociale —"}
            </p>
            <p style={{ color: SOUS, fontSize: 12, margin: "2px 0 0" }}>
              {libelleForme(apercu.forme)} · l&apos;ancienne identité ne figure plus que sur les
              pièces émises avant la date d&apos;effet.
            </p>
          </div>

          <button type="submit" disabled={enCours} style={{ ...bouton("#C9A84C"), marginTop: 12 }}>
            {enCours ? "Enregistrement…" : "📅 Préparer le changement"}
          </button>
        </form>
      )}

      {/* Les changements déjà préparés, pas encore en vigueur. */}
      {futures.length > 0 && (
        <section style={{
          background: "#FFF", border: "1px solid #C9A84C",
          borderRadius: 16, padding: 16, marginBottom: 16,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: MARINE, margin: "0 0 8px" }}>
            Changement préparé
          </h2>
          {futures.map((f) => (
            <div key={f.id} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ color: MARINE, fontWeight: 700, overflowWrap: "anywhere" }}>
                {f.raisonSociale}
              </span>
              <span style={{ color: SOUS, fontSize: 13 }}>
                {libelleForme(f.forme)} · à partir du {f.dateDebut}
              </span>
              <button type="button" disabled={enCours}
                onClick={() => {
                  setErreur("");
                  demarrer(async () => {
                    const r = await annulerChangement(f.id!);
                    if (r.error) setErreur(r.error);
                    else { setSucces("Changement annulé."); router.refresh(); }
                  });
                }}
                style={{ ...bouton("#EDE8DF", "#A8453A"), marginLeft: "auto" }}>
                Annuler ce changement
              </button>
            </div>
          ))}
        </section>
      )}

      {/* L'historique. */}
      <section style={{
        background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
        borderRadius: 16, padding: 16,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: MARINE, margin: "0 0 8px" }}>
          Historique
        </h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 480 }}>
            <thead>
              <tr style={{ color: SOUS, textAlign: "left" }}>
                <th style={{ padding: "4px 6px", fontWeight: 600 }}>Du</th>
                <th style={{ padding: "4px 6px", fontWeight: 600 }}>Au</th>
                <th style={{ padding: "4px 6px", fontWeight: 600 }}>Forme</th>
                <th style={{ padding: "4px 6px", fontWeight: 600 }}>Raison sociale</th>
                <th style={{ padding: "4px 6px", fontWeight: 600 }}>IDE</th>
              </tr>
            </thead>
            <tbody>
              {historique.map((h) => (
                <tr key={h.id ?? h.dateDebut} style={{ borderTop: "1px solid rgba(27,43,94,.08)" }}>
                  <td style={{ padding: "6px", color: MARINE }}>{h.dateDebut}</td>
                  <td style={{ padding: "6px", color: SOUS }}>
                    {h.dateFin ? veille(h.dateFin) : "—"}
                  </td>
                  <td style={{ padding: "6px", color: SOUS }}>{libelleForme(h.forme)}</td>
                  <td style={{ padding: "6px", color: MARINE, overflowWrap: "anywhere" }}>
                    {h.raisonSociale}
                  </td>
                  <td style={{ padding: "6px", color: SOUS }}>{h.ide ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type Resultat = { error?: string; ok?: boolean };
