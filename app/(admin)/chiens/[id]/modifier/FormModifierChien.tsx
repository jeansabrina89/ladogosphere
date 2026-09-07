"use client";

import { useActionState } from "react";
import { modifierChien } from "./actions";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import AlerteFormulaire, { marqueChamp } from "@/app/components/AlerteFormulaire";
import {
  ETAT_FORMULAIRE_VIDE,
  caseCochee,
  valeurChamp,
  type EtatFormulaire,
} from "@/src/lib/etatFormulaire";

/** La fiche telle que la lit la page : champs libres, pas de typage strict. */
export type ChienFiche = Record<string, unknown> & { id: string };

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

export default function FormModifierChien({
  chien,
  categorieTxt,
}: {
  chien: ChienFiche;
  categorieTxt: string;
}) {
  const [etat, action] = useActionState<EtatFormulaire, FormData>(
    modifierChien.bind(null, chien.id),
    ETAT_FORMULAIRE_VIDE
  );
  const v = etat.valeurs;

  const texte = (nom: string) => valeurChamp(v, nom, (chien[nom] as string | number | null) ?? "");

  const caseRow = (name: string, label: string) => (
    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: "#1B2B5E", cursor: "pointer", padding: "6px 0" }}>
      <input type="checkbox" id={name} name={name}
             defaultChecked={caseCochee(v, name, !!chien[name])}
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
              <label htmlFor="nom" style={labelStyle}>Nom</label>
              <input {...marqueChamp(etat, "nom", champStyle)} defaultValue={texte("nom")} />
            </div>
            <div>
              <label htmlFor="race" style={labelStyle}>Race *</label>
              <input {...marqueChamp(etat, "race", champStyle)} required defaultValue={texte("race")} />
            </div>
            <div>
              <label htmlFor="couleur" style={labelStyle}>Couleur</label>
              <input {...marqueChamp(etat, "couleur", champStyle)} defaultValue={texte("couleur")} />
            </div>
            <div>
              <label htmlFor="poids" style={labelStyle}>Poids (kg)</label>
              <input {...marqueChamp(etat, "poids", champStyle)} type="number" step="0.1"
                     defaultValue={texte("poids")} />
              <p style={muted}>Catégorie actuelle : {categorieTxt}</p>
            </div>
            <div>
              <label htmlFor="date_naissance" style={labelStyle}>Date de naissance</label>
              <input {...marqueChamp(etat, "date_naissance", champStyle)} type="date"
                     defaultValue={texte("date_naissance")} />
            </div>
            <div>
              <label htmlFor="sexe" style={labelStyle}>Sexe</label>
              <select {...marqueChamp(etat, "sexe", champStyle)} defaultValue={texte("sexe")}>
                <option value="M">Mâle</option>
                <option value="F">Femelle</option>
              </select>
            </div>
            <div>
              <label htmlFor="sterilisation" style={labelStyle}>Stérilisation</label>
              <select {...marqueChamp(etat, "sterilisation", champStyle)}
                      defaultValue={valeurChamp(v, "sterilisation", (chien.sterilisation as string) || "non")}>
                <option value="non">Non</option>
                <option value="oui">Oui</option>
                <option value="chimique">Castré chimiquement</option>
              </select>
            </div>
            <div>
              <label htmlFor="numero_puce" style={labelStyle}>Numéro de puce *</label>
              <input {...marqueChamp(etat, "numero_puce", champStyle)} required
                     defaultValue={texte("numero_puce")} />
            </div>
            <div>
              <label htmlFor="niveau_energie" style={labelStyle}>Niveau d&apos;énergie</label>
              <select {...marqueChamp(etat, "niveau_energie", champStyle)}
                      defaultValue={texte("niveau_energie")}>
                <option value="">Choisir</option>
                <option value="faible">Faible</option>
                <option value="moyen">Moyen</option>
                <option value="eleve">Élevé</option>
              </select>
            </div>
          </div>
        </Carte>

        {/* Santé & vétérinaire */}
        <Carte>
          <h2 style={titreSection}>🩺 Santé &amp; vétérinaire</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label htmlFor="allergies" style={labelStyle}>Allergies</label>
              <textarea {...marqueChamp(etat, "allergies", champStyle)} rows={3}
                        defaultValue={texte("allergies")} />
            </div>
            <div>
              <label htmlFor="traitements" style={labelStyle}>Traitements</label>
              <textarea {...marqueChamp(etat, "traitements", champStyle)} rows={3}
                        defaultValue={texte("traitements")} />
            </div>
            <div>
              <label htmlFor="veterinaire_nom" style={labelStyle}>Nom du vétérinaire</label>
              <input {...marqueChamp(etat, "veterinaire_nom", champStyle)}
                     defaultValue={texte("veterinaire_nom")} />
            </div>
            <div>
              <label htmlFor="veterinaire_telephone" style={labelStyle}>Téléphone du vétérinaire</label>
              <input {...marqueChamp(etat, "veterinaire_telephone", champStyle)}
                     defaultValue={texte("veterinaire_telephone")} />
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
                        defaultValue={texte("comportement")} />
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
                     defaultValue={texte("comportement_autre")} />
            </div>
            <div>
              <label htmlFor="remarques" style={labelStyle}>Remarques</label>
              <textarea {...marqueChamp(etat, "remarques", champStyle)} rows={4}
                        defaultValue={texte("remarques")} />
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
        </Carte>

      </div>

      {/* Actions */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
        <Bouton variante="principal" type="submit">💾 Enregistrer</Bouton>
        <Bouton variante="secondaire" href={`/chiens/${chien.id}`}>✖ Annuler</Bouton>
      </div>
    </form>
  );
}
