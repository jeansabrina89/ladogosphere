"use client";

import { useActionState } from "react";
import { creerChien } from "./actions";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import AlerteFormulaire, { marqueChamp } from "@/app/components/AlerteFormulaire";
import {
  ETAT_FORMULAIRE_VIDE,
  caseCochee,
  valeurChamp,
  type EtatFormulaire,
} from "@/src/lib/etatFormulaire";

export type ProprietaireChoix = {
  id: string;
  prenom: string | null;
  nom: string | null;
  membre: boolean | null;
  aJour: boolean;
};

const labelStyle: React.CSSProperties = {
  display: "block", fontWeight: 600, color: "#1B2B5E", marginBottom: 6, fontSize: 14,
};
const champStyle: React.CSSProperties = {
  width: "100%", border: "1px solid rgba(27,43,94,0.2)", borderRadius: 12,
  padding: "10px 12px", fontSize: 15, color: "#1B2B5E", backgroundColor: "#FFFFFF",
  boxSizing: "border-box",
};
const titreSection: React.CSSProperties = {
  fontFamily: "Georgia, 'Times New Roman', serif", color: "#1B2B5E",
  fontSize: 18, fontWeight: 700, margin: "0 0 16px",
};
const sousTitre: React.CSSProperties = {
  fontWeight: 600, color: "#1B2B5E", fontSize: 14, margin: "16px 0 8px",
};
const muted: React.CSSProperties = { color: "rgba(27,43,94,0.6)", fontSize: 13, margin: "6px 0 0" };

export default function FormNouveauChien({ proprietaires }: { proprietaires: ProprietaireChoix[] }) {
  const [etat, action] = useActionState<EtatFormulaire, FormData>(creerChien, ETAT_FORMULAIRE_VIDE);
  const v = etat.valeurs;

  const caseRow = (name: string, label: string) => (
    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: "#1B2B5E", cursor: "pointer", padding: "6px 0" }}>
      <input type="checkbox" id={name} name={name}
             defaultChecked={caseCochee(v, name, false)}
             style={{ width: 18, height: 18, flexShrink: 0 }} />
      {label}
    </label>
  );

  return (
    <form action={action}>
      <AlerteFormulaire etat={etat} />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Identité */}
        <Carte>
          <h2 style={titreSection}>🐶 Identité</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label htmlFor="client_id" style={labelStyle}>Propriétaire *</label>
              <select {...marqueChamp(etat, "client_id", champStyle)} required
                      defaultValue={valeurChamp(v, "client_id")}>
                <option value="">-- Sélectionner --</option>
                {proprietaires.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.membre ? (c.aJour ? "⭐ " : "🔔 ") : ""}{c.prenom} {c.nom}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="nom" style={labelStyle}>Nom *</label>
              <input {...marqueChamp(etat, "nom", champStyle)} type="text" required
                     defaultValue={valeurChamp(v, "nom")} />
            </div>
            <div>
              <label htmlFor="race" style={labelStyle}>Race *</label>
              <input {...marqueChamp(etat, "race", champStyle)} type="text" required
                     defaultValue={valeurChamp(v, "race")} />
            </div>
            <div>
              <label htmlFor="couleur" style={labelStyle}>Couleur *</label>
              <input {...marqueChamp(etat, "couleur", champStyle)} type="text" required
                     defaultValue={valeurChamp(v, "couleur")} />
            </div>
            <div>
              <label htmlFor="poids" style={labelStyle}>Poids (kg) *</label>
              <input {...marqueChamp(etat, "poids", champStyle)} type="number" step="0.1" required
                     defaultValue={valeurChamp(v, "poids")} />
              <p style={muted}>{"Catégorie calculée automatiquement : <15 kg = Petit · 15–30 kg = Moyen · >30 kg = Grand"}</p>
            </div>
            <div>
              <label htmlFor="date_naissance" style={labelStyle}>Date de naissance</label>
              <input {...marqueChamp(etat, "date_naissance", champStyle)} type="date"
                     defaultValue={valeurChamp(v, "date_naissance")} />
            </div>
            <div>
              <label htmlFor="sexe" style={labelStyle}>Sexe *</label>
              <select {...marqueChamp(etat, "sexe", champStyle)} required
                      defaultValue={valeurChamp(v, "sexe")}>
                <option value="">Choisir</option>
                <option value="M">Mâle</option>
                <option value="F">Femelle</option>
              </select>
            </div>
            <div>
              <label htmlFor="sterilisation" style={labelStyle}>Stérilisation</label>
              <select {...marqueChamp(etat, "sterilisation", champStyle)}
                      defaultValue={valeurChamp(v, "sterilisation", "non")}>
                <option value="non">Non</option>
                <option value="oui">Oui</option>
                <option value="chimique">Castré chimiquement</option>
              </select>
            </div>
            <div>
              <label htmlFor="numero_puce" style={labelStyle}>Numéro de puce *</label>
              <input {...marqueChamp(etat, "numero_puce", champStyle)} type="text" required
                     defaultValue={valeurChamp(v, "numero_puce")} />
            </div>
            <div>
              <label htmlFor="niveau_energie" style={labelStyle}>Niveau d&apos;énergie</label>
              <select {...marqueChamp(etat, "niveau_energie", champStyle)}
                      defaultValue={valeurChamp(v, "niveau_energie")}>
                <option value="">Choisir</option>
                <option value="faible">Faible</option>
                <option value="moyen">Moyen</option>
                <option value="eleve">Élevé</option>
              </select>
            </div>
          </div>
        </Carte>

        {/* Santé */}
        <Carte>
          <h2 style={titreSection}>🩺 Santé</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label htmlFor="allergies" style={labelStyle}>Allergies</label>
              <textarea {...marqueChamp(etat, "allergies", champStyle)} rows={3}
                        defaultValue={valeurChamp(v, "allergies")} />
            </div>
            <div>
              <label htmlFor="traitements" style={labelStyle}>Traitements</label>
              <textarea {...marqueChamp(etat, "traitements", champStyle)} rows={3}
                        defaultValue={valeurChamp(v, "traitements")} />
            </div>
          </div>
        </Carte>

        {/* Comportement */}
        <Carte>
          <h2 style={titreSection}>🐾 Comportement</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label htmlFor="comportement" style={labelStyle}>Comportement / Sociabilité</label>
              <textarea {...marqueChamp(etat, "comportement", champStyle)} rows={3}
                        defaultValue={valeurChamp(v, "comportement")} />
            </div>
            <div>
              <p style={sousTitre}>⚠️ Comportements particuliers</p>
              {caseRow("protection_ressources", "⚠️ Protection de ressources")}
              {caseRow("destructeur", "🔨 Destructeur")}
              {caseRow("craintif", "😰 Craintif")}
            </div>
            <div>
              <label htmlFor="comportement_autre" style={labelStyle}>Autres comportements</label>
              <input {...marqueChamp(etat, "comportement_autre", champStyle)} type="text"
                     placeholder="Ex: aboie beaucoup, saute sur les gens..."
                     defaultValue={valeurChamp(v, "comportement_autre")} />
            </div>
            <div>
              <label htmlFor="remarques" style={labelStyle}>Remarques</label>
              <textarea {...marqueChamp(etat, "remarques", champStyle)} rows={4}
                        defaultValue={valeurChamp(v, "remarques")} />
            </div>
          </div>
        </Carte>

        {/* Compatibilités */}
        <Carte>
          <h2 style={titreSection}>🤝 Compatibilités</h2>
          <div>
            <p style={{ ...sousTitre, marginTop: 0 }}>Sexe</p>
            {caseRow("compatible_males_castres", "Mâles castrés")}
            {caseRow("compatible_males_entiers", "Mâles entiers")}
            {caseRow("compatible_femelles_sterilisees", "Femelles stérilisées")}
            {caseRow("compatible_femelles_entieres", "Femelles entières")}
          </div>
          <div>
            <p style={sousTitre}>⚖️ Gabarit</p>
            {caseRow("compatible_moins_15kg", "🟢 Chiens de moins de 15 kg (Petits)")}
            {caseRow("compatible_15_30kg", "🟡 Chiens de 15 à 30 kg (Moyens)")}
            {caseRow("compatible_30_40kg", "🔴 Chiens de plus de 30 kg (Grands)")}
          </div>
          <div>
            <p style={sousTitre}>🚪 Isolement</p>
            {caseRow("doit_etre_isole", "🚫🐕 Doit être isolé (box seul, tarif privatif)")}
          </div>
        </Carte>

      </div>

      {/* Actions */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
        <Bouton variante="principal" type="submit">💾 Enregistrer</Bouton>
        <Bouton variante="secondaire" href="/chiens">✖ Annuler</Bouton>
      </div>
    </form>
  );
}
