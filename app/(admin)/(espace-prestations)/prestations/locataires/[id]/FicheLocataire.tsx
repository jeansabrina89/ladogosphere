"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ajouterPrestation,
  attribuerFormule,
  enregistrerLocataire,
  personnaliserSemaine,
} from "../../actions";
import { JOURS_SEMAINE, MENTION_GARDE, estGarde } from "@/src/lib/prestationsLogique";

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
  minHeight: CIBLE, padding: "0 16px", borderRadius: 12, border: "none",
  background: fond, color: texte, fontWeight: 700, fontSize: 14, cursor: "pointer",
});

export type ClientLocataire = {
  id: string;
  prenom: string | null;
  nom: string | null;
  box_loue: string | null;
  loyer_refacture: number | null;
  locataire_depuis: string | null;
  locataire_jusqu_au: string | null;
};

export type LignePerso = { prestation_id: string; nom: string; jours: string[] | null };

export default function FicheLocataire({
  client,
  abonnementId,
  lignesFormule,
  semaineProchaine,
  formules,
  prestations,
  chiens,
  peutModifier,
}: {
  client: ClientLocataire;
  abonnementId: string | null;
  lignesFormule: LignePerso[];
  semaineProchaine: string;
  formules: { id: string; nom: string; prix_mensuel: number }[];
  prestations: { id: string; nom: string; unite: string; prix: number }[];
  chiens: { id: string; nom: string }[];
  peutModifier: boolean;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState("");
  const [ouvert, setOuvert] = useState<"fiche" | "prestation" | "formule" | null>(null);
  const [unitePrestation, setUnitePrestation] = useState<string>("");

  const soumettre = (action: (fd: FormData) => Promise<{ error?: string }>) =>
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      setErreur("");
      demarrer(async () => {
        const r = await action(fd);
        if (r.error) setErreur(r.error);
        else { setOuvert(null); router.refresh(); }
      });
    };

  const gardeChoisie = estGarde(unitePrestation);

  if (!peutModifier) {
    return (
      <p style={{ color: SOUS, fontSize: 13 }}>
        Créer ou modifier une prestation demande la permission des encaissements.
      </p>
    );
  }

  return (
    <div style={{ minWidth: 0 }}>
      {erreur && (
        <p role="alert" style={{
          background: "#FBE2DE", color: "#A8453A", padding: "10px 12px",
          borderRadius: 12, fontSize: 14, fontWeight: 600, margin: "0 0 12px",
        }}>{erreur}</p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" onClick={() => setOuvert(ouvert === "prestation" ? null : "prestation")}
          style={bouton("#4AAEA0")}>
          ➕ Ajouter une prestation
        </button>
        <button type="button" onClick={() => setOuvert(ouvert === "formule" ? null : "formule")}
          style={bouton("#1B2B5E")}>
          📋 Attribuer une formule
        </button>
        <button type="button" onClick={() => setOuvert(ouvert === "fiche" ? null : "fiche")}
          style={bouton("#EDE8DF", MARINE)}>
          ✏️ La location
        </button>
      </div>

      {/* Une demande reçue par téléphone, ou une garde sur une plage. */}
      {ouvert === "prestation" && (
        <form onSubmit={soumettre(ajouterPrestation)} style={{
          background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
          borderRadius: 16, padding: 16, marginBottom: 16,
        }}>
          <input type="hidden" name="client_id" value={client.id} />
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <div>
              <label style={label} htmlFor="ap-prestation">Prestation</label>
              <select id="ap-prestation" name="prestation_id" required style={champ}
                onChange={(e) => {
                  const p = prestations.find((x) => x.id === e.target.value);
                  setUnitePrestation(p?.unite ?? "");
                }}>
                <option value="">— choisir —</option>
                {prestations.map((p) => (
                  <option key={p.id} value={p.id}>{p.nom} ({p.prix.toFixed(2)} CHF)</option>
                ))}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="ap-chien">Chien</label>
              <select id="ap-chien" name="chien_id" style={champ}>
                <option value="">—</option>
                {chiens.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="ap-debut">
                {gardeChoisie ? "Premier jour de garde" : "Date"}
              </label>
              <input id="ap-debut" name="date_debut" type="date" required style={champ} />
            </div>
            {gardeChoisie ? (
              <div>
                <label style={label} htmlFor="ap-fin">Dernier jour de garde</label>
                <input id="ap-fin" name="date_fin" type="date" required style={champ} />
              </div>
            ) : (
              <div>
                <label style={label} htmlFor="ap-heure">Heure prévue</label>
                <input id="ap-heure" name="heure_prevue" type="time" style={champ} />
              </div>
            )}
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={label} htmlFor="ap-com">Commentaire</label>
            <input id="ap-com" name="commentaire" placeholder="Reçu par téléphone…" style={champ} />
          </div>
          {gardeChoisie && (
            <p style={{
              background: "#F4EAC9", border: "1px solid #C9A84C", color: "#6E5410",
              borderRadius: 12, padding: "8px 10px", fontSize: 13, margin: "10px 0 0",
            }}>
              🏠 {MENTION_GARDE} Une tâche par jour sera créée sur la période, chacune cochable.
              Aucun box de la pension n&apos;est réservé et aucun tarif de pension ne s&apos;applique.
            </p>
          )}
          <button type="submit" disabled={enCours} style={{ ...bouton("#4AAEA0"), marginTop: 12 }}>
            {enCours ? "Enregistrement…" : "💾 Ajouter"}
          </button>
        </form>
      )}

      {ouvert === "formule" && (
        <form onSubmit={soumettre(attribuerFormule)} style={{
          background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
          borderRadius: 16, padding: 16, marginBottom: 16,
        }}>
          <input type="hidden" name="client_id" value={client.id} />
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <div>
              <label style={label} htmlFor="af-formule">Formule</label>
              <select id="af-formule" name="formule_id" required style={champ}>
                <option value="">— choisir —</option>
                {formules.map((f) => (
                  <option key={f.id} value={f.id}>{f.nom} — {f.prix_mensuel.toFixed(2)} CHF / mois</option>
                ))}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="af-debut">À partir du</label>
              <input id="af-debut" name="date_debut" type="date" style={champ} />
            </div>
          </div>
          <p style={{ color: SOUS, fontSize: 12, margin: "8px 0 0" }}>
            Le prix est figé au jour de la souscription. Une formule modifiée plus tard ne le change pas.
          </p>
          <button type="submit" disabled={enCours} style={{ ...bouton("#1B2B5E"), marginTop: 12 }}>
            {enCours ? "Enregistrement…" : "💾 Attribuer"}
          </button>
        </form>
      )}

      {ouvert === "fiche" && (
        <form onSubmit={soumettre(enregistrerLocataire)} style={{
          background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
          borderRadius: 16, padding: 16, marginBottom: 16,
        }}>
          <input type="hidden" name="client_id" value={client.id} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <input type="checkbox" name="locataire_box" defaultChecked />
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
          <button type="submit" disabled={enCours} style={{ ...bouton("#4AAEA0"), marginTop: 12 }}>
            {enCours ? "Enregistrement…" : "💾 Enregistrer"}
          </button>
        </form>
      )}

      {/* Les jours de la semaine à venir : jongler sans changer d'abonnement. */}
      {abonnementId && lignesFormule.length > 0 && (
        <section style={{
          background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
          borderRadius: 16, padding: 16, marginBottom: 16,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: MARINE, margin: "0 0 4px" }}>
            Ajuster la semaine {semaineProchaine}
          </h2>
          <p style={{ color: SOUS, fontSize: 12, margin: "0 0 12px" }}>
            Ces jours remplacent ceux de la formule pour cette semaine-là seulement. La quantité
            hebdomadaire ne change pas : elle se répartit sur les jours retenus.
          </p>
          {lignesFormule.map((l) => (
            <form key={l.prestation_id} onSubmit={soumettre(personnaliserSemaine)}
              style={{ borderTop: "1px solid rgba(27,43,94,.08)", paddingTop: 10, marginTop: 10 }}>
              <input type="hidden" name="abonnement_id" value={abonnementId} />
              <input type="hidden" name="semaine" value={semaineProchaine} />
              <input type="hidden" name="prestation_id" value={l.prestation_id} />
              <p style={{ fontWeight: 600, color: MARINE, fontSize: 14, margin: "0 0 6px" }}>{l.nom}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {JOURS_SEMAINE.map((j) => (
                  <label key={j} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    minHeight: CIBLE, padding: "0 12px", borderRadius: 10,
                    border: "1px solid rgba(27,43,94,.2)", fontSize: 13, cursor: "pointer",
                  }}>
                    <input type="checkbox" name="jours" value={j}
                      defaultChecked={l.jours ? l.jours.includes(j) : true} />
                    {j.slice(0, 3)}
                  </label>
                ))}
              </div>
              <button type="submit" disabled={enCours} style={{ ...bouton("#EDE8DF", MARINE), marginTop: 8 }}>
                Appliquer à cette semaine
              </button>
            </form>
          ))}
        </section>
      )}
    </div>
  );
}
