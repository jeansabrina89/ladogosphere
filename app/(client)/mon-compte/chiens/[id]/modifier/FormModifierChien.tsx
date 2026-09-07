"use client";

import { useActionState } from "react";
import { modifierChienClient } from "./actions";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import ChoixCohabitationChamp from "@/app/components/ChoixCohabitation";
import AlerteFormulaire, { marqueChamp } from "@/app/components/AlerteFormulaire";
import { estChoixCohabitation, type ChoixCohabitation } from "@/src/lib/cohabitation";
import {
  ETAT_FORMULAIRE_VIDE,
  valeurChamp,
  type EtatFormulaire,
} from "@/src/lib/etatFormulaire";

export type ChienAModifier = {
  id: string;
  nom: string | null;
  race: string | null;
  couleur: string | null;
  poids: number | string | null;
  sexe: string | null;
  sterilisation: string | null;
  date_naissance: string | null;
  numero_puce: string | null;
  allergies: string | null;
  traitements: string | null;
  remarques: string | null;
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

export default function FormModifierChien({
  chien,
  choixActuel,
  verrouille,
}: {
  chien: ChienAModifier;
  choixActuel: ChoixCohabitation;
  verrouille: boolean;
}) {
  const [etat, action] = useActionState<EtatFormulaire, FormData>(
    modifierChienClient.bind(null, chien.id),
    ETAT_FORMULAIRE_VIDE
  );
  const v = etat.valeurs;

  const saisieCohabitation = valeurChamp(v, "cohabitation", choixActuel);
  const cohabitation = estChoixCohabitation(saisieCohabitation) ? saisieCohabitation : choixActuel;

  return (
    <form action={action}>
      <AlerteFormulaire etat={etat} />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Identité */}
        <Carte>
          <h2 style={titreSection}>🐶 Identité</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label htmlFor="nom" style={labelStyle}>Nom *</label>
              <input {...marqueChamp(etat, "nom", champStyle)} type="text" required
                     defaultValue={valeurChamp(v, "nom", chien.nom)} />
            </div>
            <div>
              <label htmlFor="race" style={labelStyle}>Race *</label>
              <input {...marqueChamp(etat, "race", champStyle)} type="text" required
                     defaultValue={valeurChamp(v, "race", chien.race)} />
            </div>
            <div>
              <label htmlFor="couleur" style={labelStyle}>Couleur *</label>
              <input {...marqueChamp(etat, "couleur", champStyle)} type="text" required
                     defaultValue={valeurChamp(v, "couleur", chien.couleur)} />
            </div>
            <div>
              <label htmlFor="poids" style={labelStyle}>Poids (kg) *</label>
              <input {...marqueChamp(etat, "poids", champStyle)} type="number" step="0.1" min="0" required
                     defaultValue={valeurChamp(v, "poids", chien.poids)} />
            </div>
            <div>
              <label htmlFor="sexe" style={labelStyle}>Sexe *</label>
              <select {...marqueChamp(etat, "sexe", champStyle)} required
                      defaultValue={valeurChamp(v, "sexe", chien.sexe)}>
                <option value="" disabled>Choisir</option>
                <option value="M">Mâle</option>
                <option value="F">Femelle</option>
              </select>
            </div>
            <div>
              <label htmlFor="sterilisation" style={labelStyle}>Stérilisation *</label>
              <select {...marqueChamp(etat, "sterilisation", champStyle)} required
                      defaultValue={valeurChamp(v, "sterilisation", chien.sterilisation || "non")}>
                <option value="non">Non</option>
                <option value="oui">Oui</option>
                <option value="chimique">Castré chimiquement</option>
              </select>
            </div>
            <div>
              <label htmlFor="date_naissance" style={labelStyle}>Date de naissance</label>
              <input {...marqueChamp(etat, "date_naissance", champStyle)} type="date"
                     defaultValue={valeurChamp(
                       v, "date_naissance",
                       chien.date_naissance ? String(chien.date_naissance).slice(0, 10) : ""
                     )} />
            </div>
            <div>
              <label htmlFor="numero_puce" style={labelStyle}>Numéro de puce</label>
              <input {...marqueChamp(etat, "numero_puce", champStyle)} type="text"
                     defaultValue={valeurChamp(v, "numero_puce", chien.numero_puce)} />
            </div>
          </div>
        </Carte>

        {/* Cohabitation en box */}
        <Carte>
          <h2 style={titreSection}>🏠 Cohabitation en box</h2>
          <ChoixCohabitationChamp valeur={cohabitation} verrouille={verrouille} />
        </Carte>

        {/* Santé */}
        <Carte>
          <h2 style={titreSection}>🩺 Santé</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label htmlFor="allergies" style={labelStyle}>Allergies</label>
              <textarea {...marqueChamp(etat, "allergies", champStyle)} rows={2}
                        defaultValue={valeurChamp(v, "allergies", chien.allergies)} />
            </div>
            <div>
              <label htmlFor="traitements" style={labelStyle}>Traitements en cours</label>
              <textarea {...marqueChamp(etat, "traitements", champStyle)} rows={2}
                        defaultValue={valeurChamp(v, "traitements", chien.traitements)} />
            </div>
            <div>
              <label htmlFor="remarques" style={labelStyle}>Remarques</label>
              <textarea {...marqueChamp(etat, "remarques", champStyle)} rows={3}
                        defaultValue={valeurChamp(v, "remarques", chien.remarques)} />
            </div>
          </div>
        </Carte>

      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
        <Bouton variante="principal" type="submit">💾 Enregistrer</Bouton>
        <Bouton variante="secondaire" href={`/mon-compte/chiens/${chien.id}`}>← Annuler</Bouton>
      </div>
    </form>
  );
}
