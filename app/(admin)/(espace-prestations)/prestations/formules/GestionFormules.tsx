"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ajouterLigneFormule,
  appliquerAuxAbonnements,
  creerFormule,
  dupliquerFormule,
  modifierFormule,
  retirerLigneFormule,
} from "./actions";
import { JOURS_SEMAINE } from "@/src/lib/prestationsLogique";
import { totalIndicatifFormule } from "@/src/lib/factureLocataireLogique";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.6)";
const CIBLE = 44;

export type PrestationBreve = { id: string; nom: string; prix: number; actif: boolean };

export type LigneFormule = {
  id: string;
  prestation_id: string;
  quantite_par_semaine: number;
  jours: string[] | null;
  prestation: string;
  prix: number;
};

export type Formule = {
  id: string;
  nom: string;
  description: string | null;
  prix_mensuel: number;
  actif: boolean;
  ordre: number;
  lignes: LigneFormule[];
  /** Combien d'abonnements en cours s'appuient sur elle. */
  abonnementsActifs: number;
};

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

export default function GestionFormules({
  formules,
  prestations,
}: {
  formules: Formule[];
  prestations: PrestationBreve[];
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");
  const [ajout, setAjout] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);

  const lancer = (travail: () => Promise<{ error?: string; ok?: boolean; touches?: number }>) => {
    setErreur("");
    setInfo("");
    demarrer(async () => {
      const r = await travail();
      if (r.error) setErreur(r.error);
      else {
        if (typeof r.touches === "number") {
          setInfo(
            r.touches === 0
              ? "Aucun abonnement en cours n'utilise cette formule."
              : `${r.touches} abonnement(s) repris sur le nouveau prix.`
          );
        }
        router.refresh();
      }
    });
  };

  const soumettre = (action: (fd: FormData) => Promise<{ error?: string }>, fermer?: () => void) =>
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      const fd = new FormData(form);
      setErreur("");
      demarrer(async () => {
        const r = await action(fd);
        if (r.error) setErreur(r.error);
        else {
          form.reset();
          fermer?.();
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
        }}>{erreur}</p>
      )}
      {info && (
        <p role="status" style={{
          background: "#DFF0E8", color: "#1F6E5B", padding: "10px 12px",
          borderRadius: 12, fontSize: 14, fontWeight: 600, margin: "0 0 12px",
        }}>{info}</p>
      )}

      <p style={{
        background: "#F4EAC9", border: "1px solid #C9A84C", color: "#6E5410",
        borderRadius: 14, padding: "10px 12px", fontSize: 13, margin: "0 0 14px",
      }}>
        Modifier une formule ne change <strong>aucun abonnement en cours</strong> : leur prix a été
        figé à la souscription. Pour les reprendre, utilisez « Appliquer aux abonnements en cours »
        sur la formule concernée.
      </p>

      <button type="button" onClick={() => setAjout(!ajout)} style={{
        ...bouton(ajout ? "#EDE8DF" : "#4AAEA0", ajout ? MARINE : "#FFF"), marginBottom: 12,
      }}>
        {ajout ? "✖ Fermer" : "➕ Nouvelle formule"}
      </button>

      {ajout && (
        <form onSubmit={soumettre(creerFormule, () => setAjout(false))} style={{
          background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
          borderRadius: 16, padding: 16, marginBottom: 16,
        }}>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <div>
              <label style={label} htmlFor="f-nom">Nom</label>
              <input id="f-nom" name="nom" required placeholder="Formule confort" style={champ} />
            </div>
            <div>
              <label style={label} htmlFor="f-prix">Prix mensuel (CHF)</label>
              <input id="f-prix" name="prix_mensuel" type="number" step="0.05" min="0" defaultValue="0" style={champ} />
            </div>
            <div>
              <label style={label} htmlFor="f-ordre">Ordre</label>
              <input id="f-ordre" name="ordre" type="number" defaultValue="0" style={champ} />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={label} htmlFor="f-desc">Description</label>
            <input id="f-desc" name="description" placeholder="Ce que la formule comprend" style={champ} />
          </div>
          <button type="submit" disabled={enCours} style={{ ...bouton("#4AAEA0"), marginTop: 12 }}>
            {enCours ? "Enregistrement…" : "💾 Créer"}
          </button>
        </form>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
        {formules.map((f) => {
          const total = totalIndicatifFormule(
            f.lignes.map((l) => ({ quantite_par_semaine: l.quantite_par_semaine, prix: l.prix }))
          );
          const ecart = Math.round((total.parMois - f.prix_mensuel) * 100) / 100;
          return (
            <li key={f.id} style={{
              background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
              borderRadius: 16, padding: 16, minWidth: 0, opacity: f.actif ? 1 : 0.65,
            }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                <span style={{ fontWeight: 700, color: MARINE, fontSize: 16, overflowWrap: "anywhere" }}>
                  {f.nom}
                </span>
                {!f.actif && (
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                    background: "#EDE8DF", color: SOUS,
                  }}>désactivée</span>
                )}
                {f.abonnementsActifs > 0 && (
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                    background: "#E4E7F0", color: MARINE,
                  }}>
                    {f.abonnementsActifs} abonnement(s) en cours
                  </span>
                )}
                <span style={{ marginLeft: "auto", fontWeight: 700, color: MARINE, fontSize: 16 }}>
                  {f.prix_mensuel.toFixed(2)} CHF / mois
                </span>
              </div>

              <p style={{ color: SOUS, fontSize: 13, margin: "6px 0 0", overflowWrap: "anywhere" }}>
                {f.description ?? "—"}
              </p>

              {/* Le total indicatif : une aide à la décision, pas un calcul imposé. */}
              <p style={{ color: SOUS, fontSize: 13, margin: "8px 0 0" }}>
                Prestations incluses : <strong>{total.parSemaine.toFixed(2)} CHF</strong> par semaine,
                soit environ <strong>{total.parMois.toFixed(2)} CHF</strong> par mois.
                {f.prix_mensuel > 0 && (
                  <span style={{ color: ecart > 0 ? "#1F6E5B" : "#A8453A", fontWeight: 600 }}>
                    {" "}{ecart > 0
                      ? `Vous offrez ${ecart.toFixed(2)} CHF.`
                      : `Le forfait dépasse de ${Math.abs(ecart).toFixed(2)} CHF.`}
                  </span>
                )}
              </p>

              <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gap: 6 }}>
                {f.lignes.length === 0 && (
                  <li style={{ color: SOUS, fontSize: 13 }}>Aucune prestation dans cette formule.</li>
                )}
                {f.lignes.map((l) => (
                  <li key={l.id} style={{
                    display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
                    background: "#F5F0E8", borderRadius: 10, padding: "8px 10px", fontSize: 13,
                  }}>
                    <span style={{ fontWeight: 600, color: MARINE, overflowWrap: "anywhere" }}>
                      {l.prestation}
                    </span>
                    <span style={{ color: SOUS }}>
                      ×{l.quantite_par_semaine} / semaine
                      {" · "}
                      {l.jours && l.jours.length > 0 ? l.jours.join(", ") : "tous les jours"}
                    </span>
                    <button type="button" disabled={enCours}
                      onClick={() => lancer(() => retirerLigneFormule(l.id))}
                      style={{
                        marginLeft: "auto", minHeight: 36, padding: "0 10px", borderRadius: 10,
                        border: "none", background: "transparent", color: "#A8453A",
                        fontSize: 13, fontWeight: 600, cursor: "pointer",
                      }}>
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <button type="button" onClick={() => setOuvert(ouvert === f.id ? null : f.id)}
                  style={{ ...bouton("#EDE8DF", MARINE) }}>
                  {ouvert === f.id ? "Fermer" : "✏️ Composer"}
                </button>
                <button type="button" disabled={enCours}
                  onClick={() => lancer(() => dupliquerFormule(f.id))}
                  style={{ ...bouton("#EDE8DF", MARINE) }}>
                  ⧉ Dupliquer
                </button>
                {f.abonnementsActifs > 0 && (
                  <button type="button" disabled={enCours}
                    onClick={() => lancer(() => appliquerAuxAbonnements(f.id))}
                    style={{ ...bouton("#C9A84C") }}>
                    Appliquer aux {f.abonnementsActifs} abonnement(s) en cours
                  </button>
                )}
              </div>

              {ouvert === f.id && (
                <div style={{ marginTop: 14, borderTop: "1px solid rgba(27,43,94,.08)", paddingTop: 14 }}>
                  <form onSubmit={soumettre(modifierFormule)}>
                    <input type="hidden" name="id" value={f.id} />
                    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                      <div>
                        <label style={label} htmlFor={`n-${f.id}`}>Nom</label>
                        <input id={`n-${f.id}`} name="nom" defaultValue={f.nom} style={champ} />
                      </div>
                      <div>
                        <label style={label} htmlFor={`p-${f.id}`}>Prix mensuel (CHF)</label>
                        <input id={`p-${f.id}`} name="prix_mensuel" type="number" step="0.05" min="0"
                          defaultValue={String(f.prix_mensuel)} style={champ} />
                      </div>
                      <div>
                        <label style={label} htmlFor={`o-${f.id}`}>Ordre</label>
                        <input id={`o-${f.id}`} name="ordre" type="number" defaultValue={f.ordre} style={champ} />
                      </div>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <label style={label} htmlFor={`d-${f.id}`}>Description</label>
                      <input id={`d-${f.id}`} name="description" defaultValue={f.description ?? ""} style={champ} />
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                      <input type="checkbox" name="actif" defaultChecked={f.actif} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: MARINE }}>Proposée</span>
                    </label>
                    {f.abonnementsActifs > 0 && (
                      <p style={{ color: SOUS, fontSize: 12, margin: "6px 0 0" }}>
                        Cette formule sert {f.abonnementsActifs} abonnement(s) : elle ne peut pas être
                        supprimée, seulement désactivée. Les abonnements en cours continuent sur leur prix figé.
                      </p>
                    )}
                    <button type="submit" disabled={enCours} style={{ ...bouton("#4AAEA0"), marginTop: 12 }}>
                      {enCours ? "Enregistrement…" : "💾 Enregistrer"}
                    </button>
                  </form>

                  <form onSubmit={soumettre(ajouterLigneFormule)} style={{ marginTop: 16 }}>
                    <input type="hidden" name="formule_id" value={f.id} />
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: MARINE, margin: "0 0 8px" }}>
                      Ajouter une prestation
                    </h3>
                    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                      <div>
                        <label style={label} htmlFor={`pr-${f.id}`}>Prestation</label>
                        <select id={`pr-${f.id}`} name="prestation_id" required style={champ}>
                          <option value="">— choisir —</option>
                          {prestations.filter((p) => p.actif).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nom} ({p.prix.toFixed(2)} CHF)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={label} htmlFor={`q-${f.id}`}>Par semaine</label>
                        <input id={`q-${f.id}`} name="quantite_par_semaine" type="number" step="1" min="1"
                          defaultValue="1" style={champ} />
                      </div>
                    </div>
                    <fieldset style={{ border: "none", padding: 0, margin: "10px 0 0" }}>
                      <legend style={{ ...label, padding: 0 }}>
                        Jours (aucun coché = tous les jours)
                      </legend>
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
                    </fieldset>
                    <button type="submit" disabled={enCours} style={{ ...bouton("#1B2B5E"), marginTop: 12 }}>
                      ➕ Ajouter à la formule
                    </button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
