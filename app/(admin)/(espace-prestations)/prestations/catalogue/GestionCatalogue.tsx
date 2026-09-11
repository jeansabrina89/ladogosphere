"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { creerPrestation, modifierPrestation } from "./actions";
import { UNITES_PRESTATION, estGarde, libelleUnite } from "@/src/lib/prestationsLogique";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.6)";
const CIBLE = 44;

export type Prestation = {
  id: string;
  nom: string;
  description: string | null;
  unite: string;
  prix: number;
  duree_minutes: number | null;
  taux_tva: number;
  motif_tva: string | null;
  actif: boolean;
  ordre: number;
};

const champ: React.CSSProperties = {
  width: "100%", minHeight: CIBLE, padding: "8px 10px",
  border: "1px solid rgba(27,43,94,.2)", borderRadius: 12, fontSize: 14,
};

const label: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600, color: MARINE, marginBottom: 4,
};

/** Les champs d'une prestation, partagés par la création et la modification. */
function Champs({ p }: { p?: Prestation }) {
  return (
    <>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div>
          <label style={label} htmlFor={`nom-${p?.id ?? "new"}`}>Nom</label>
          <input id={`nom-${p?.id ?? "new"}`} name="nom" required defaultValue={p?.nom ?? ""}
            placeholder="Passage du matin" style={champ} />
        </div>
        <div>
          <label style={label} htmlFor={`unite-${p?.id ?? "new"}`}>Unité</label>
          <select id={`unite-${p?.id ?? "new"}`} name="unite" defaultValue={p?.unite ?? "passage"} style={champ}>
            {UNITES_PRESTATION.map((u) => (
              <option key={u.valeur} value={u.valeur}>{u.libelle}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={label} htmlFor={`prix-${p?.id ?? "new"}`}>Prix (CHF)</label>
          <input id={`prix-${p?.id ?? "new"}`} name="prix" type="number" step="0.05" min="0"
            defaultValue={p ? String(p.prix) : "0"} style={champ} />
        </div>
        <div>
          <label style={label} htmlFor={`duree-${p?.id ?? "new"}`}>Durée (minutes)</label>
          <input id={`duree-${p?.id ?? "new"}`} name="duree_minutes" type="number" min="0"
            defaultValue={p?.duree_minutes ?? ""} placeholder="—" style={champ} />
        </div>
        <div>
          <label style={label} htmlFor={`taux-${p?.id ?? "new"}`}>TVA (%)</label>
          <input id={`taux-${p?.id ?? "new"}`} name="taux_tva" type="number" step="0.1" min="0"
            defaultValue={p ? String(p.taux_tva) : "8.1"} style={champ} />
        </div>
        <div>
          <label style={label} htmlFor={`ordre-${p?.id ?? "new"}`}>Ordre</label>
          <input id={`ordre-${p?.id ?? "new"}`} name="ordre" type="number"
            defaultValue={p?.ordre ?? 0} style={champ} />
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={label} htmlFor={`desc-${p?.id ?? "new"}`}>Description</label>
        <input id={`desc-${p?.id ?? "new"}`} name="description" defaultValue={p?.description ?? ""}
          placeholder="Ce que le geste comprend" style={champ} />
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={label} htmlFor={`motif-${p?.id ?? "new"}`}>
          Motif d&apos;exonération (obligatoire si TVA à 0 %)
        </label>
        <input id={`motif-${p?.id ?? "new"}`} name="motif_tva" defaultValue={p?.motif_tva ?? ""}
          placeholder="—" style={champ} />
      </div>
    </>
  );
}

export default function GestionCatalogue({ prestations }: { prestations: Prestation[] }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState("");
  const [ajout, setAjout] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);

  const soumettre = (action: (fd: FormData) => Promise<{ error?: string }>) =>
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setErreur("");
      const fd = new FormData(e.currentTarget);
      demarrer(async () => {
        const r = await action(fd);
        if (r.error) setErreur(r.error);
        else {
          setAjout(false);
          setOuvert(null);
          router.refresh();
        }
      });
    };

  return (
    <div style={{ minWidth: 0 }}>
      {erreur && (
        <p role="alert" style={{
          background: "#FBE2DE", color: "#A8453A", padding: "10px 12px",
          borderRadius: 12, fontSize: 14, fontWeight: 600, margin: "0 0 12px",
        }}>
          {erreur}
        </p>
      )}

      <button type="button" onClick={() => setAjout(!ajout)} style={{
        minHeight: CIBLE, padding: "0 16px", borderRadius: 12, border: "none",
        background: ajout ? "#EDE8DF" : "#4AAEA0", color: ajout ? MARINE : "#FFF",
        fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 12,
      }}>
        {ajout ? "✖ Fermer" : "➕ Nouvelle prestation"}
      </button>

      {ajout && (
        <form onSubmit={soumettre(creerPrestation)} style={{
          background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
          borderRadius: 16, padding: 16, marginBottom: 16,
        }}>
          <Champs />
          <button type="submit" disabled={enCours} style={{
            marginTop: 12, minHeight: CIBLE, padding: "0 18px", borderRadius: 12,
            border: "none", background: "#4AAEA0", color: "#FFF", fontWeight: 700,
            fontSize: 14, cursor: "pointer",
          }}>
            {enCours ? "Enregistrement…" : "💾 Créer"}
          </button>
          <p style={{ color: SOUS, fontSize: 12, margin: "8px 0 0" }}>
            Le prix part à zéro : c&apos;est à vous de le fixer. Rien n&apos;est deviné.
          </p>
        </form>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {prestations.map((p) => (
          <li key={p.id} style={{
            background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
            borderRadius: 16, padding: 14, minWidth: 0, opacity: p.actif ? 1 : 0.6,
          }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <span style={{ fontWeight: 700, color: MARINE, fontSize: 15, overflowWrap: "anywhere" }}>
                {p.nom}
              </span>
              <span style={{
                fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                background: estGarde(p.unite) ? "#F4EAC9" : "#F5F0E8",
                color: estGarde(p.unite) ? "#6E5410" : MARINE,
              }}>
                {libelleUnite(p.unite)}
              </span>
              <span style={{ color: MARINE, fontWeight: 700, fontSize: 15, marginLeft: "auto" }}>
                {p.prix.toFixed(2)} CHF
              </span>
              <button type="button" onClick={() => setOuvert(ouvert === p.id ? null : p.id)}
                style={{
                  minHeight: 36, padding: "0 12px", borderRadius: 10,
                  border: "1px solid rgba(27,43,94,.2)", background: "#FFF",
                  color: MARINE, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>
                {ouvert === p.id ? "Fermer" : "Modifier"}
              </button>
            </div>

            <p style={{ color: SOUS, fontSize: 13, margin: "6px 0 0", overflowWrap: "anywhere" }}>
              {p.description ?? "—"}
              {" · "}TVA {p.taux_tva} %{p.motif_tva ? ` (${p.motif_tva})` : ""}
              {p.duree_minutes ? ` · ${p.duree_minutes} min` : ""}
              {!p.actif && " · désactivée"}
            </p>
            {p.prix === 0 && p.actif && (
              <p style={{ color: "#A8453A", fontSize: 12, margin: "6px 0 0", fontWeight: 600 }}>
                Prix à saisir : cette prestation sortirait à zéro sur une facture.
              </p>
            )}

            {ouvert === p.id && (
              <form onSubmit={soumettre(modifierPrestation)} style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={p.id} />
                <Champs p={p} />
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                  <input type="checkbox" name="actif" defaultChecked={p.actif} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: MARINE }}>Au catalogue</span>
                </label>
                <button type="submit" disabled={enCours} style={{
                  marginTop: 12, minHeight: CIBLE, padding: "0 18px", borderRadius: 12,
                  border: "none", background: "#4AAEA0", color: "#FFF", fontWeight: 700,
                  fontSize: 14, cursor: "pointer",
                }}>
                  {enCours ? "Enregistrement…" : "💾 Enregistrer"}
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
