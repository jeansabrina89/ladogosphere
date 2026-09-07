"use client";

import { useActionState, type CSSProperties } from "react";
import { creerChienClient } from "./actions";
import BoutonEnregistrer from "./BoutonEnregistrer";
import Carte from "@/app/components/ui/Carte";
import ChoixCohabitationChamp from "@/app/components/ChoixCohabitation";
import Bouton from "@/app/components/ui/Bouton";
import AlerteFormulaire, { marqueChamp } from "@/app/components/AlerteFormulaire";
import {
  ETAT_FORMULAIRE_VIDE,
  valeurChamp,
  type EtatFormulaire,
} from "@/src/lib/etatFormulaire";
import { estChoixCohabitation } from "@/src/lib/cohabitation";

const MARINE = "#1B2B5E";

const sLabel: CSSProperties = {
  display: "block", fontWeight: 600, fontSize: 13.5, marginBottom: 6, color: MARINE,
};
const sInput: CSSProperties = {
  width: "100%", border: "1px solid rgba(27,43,94,0.2)", borderRadius: 12,
  padding: "12px 14px", fontSize: 15, color: MARINE, backgroundColor: "#fff",
  boxSizing: "border-box", fontFamily: "inherit",
};
const sGrid2: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };
const sChamp: CSSProperties = { marginBottom: 14 };
const sReq: CSSProperties = { color: "#A8453A" };
const sSecTitre: CSSProperties = {
  fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 19, fontWeight: 700, color: MARINE, margin: 0,
};
const sSecSous: CSSProperties = { margin: "2px 0 0", fontSize: 12.5, color: "rgba(27,43,94,0.45)" };
const sSecNum: CSSProperties = {
  width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
  backgroundColor: "#DBEFEA", color: "#1F6E5B",
  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13,
};

export default function FormNouveauChien({ clientId }: { clientId: string }) {
  const [etat, action] = useActionState<EtatFormulaire, FormData>(
    creerChienClient.bind(null, clientId),
    ETAT_FORMULAIRE_VIDE
  );
  const v = etat.valeurs;

  // Le choix refusé revient tel quel ; à défaut, le partage, comme avant.
  const saisieCohabitation = valeurChamp(v, "cohabitation", "partage");
  const cohabitation = estChoixCohabitation(saisieCohabitation) ? saisieCohabitation : "partage";

  return (
    <form action={action}>
      <AlerteFormulaire etat={etat} />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* SECTION 1 — IDENTITÉ */}
        <Carte>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={sSecNum}>1</div>
            <div>
              <p style={sSecTitre}>Identité</p>
              <p style={sSecSous}>Qui est ton chien ?</p>
            </div>
          </div>

          <div style={sChamp}>
            <label htmlFor="nom" style={sLabel}>Nom <span style={sReq}>*</span></label>
            <input {...marqueChamp(etat, "nom", sInput)} type="text" required
                   placeholder="Ex : Rex" defaultValue={valeurChamp(v, "nom")} />
          </div>

          <div style={sGrid2}>
            <div style={sChamp}>
              <label htmlFor="race" style={sLabel}>Race <span style={sReq}>*</span></label>
              <input {...marqueChamp(etat, "race", sInput)} type="text" required
                     placeholder="Ex : Berger" defaultValue={valeurChamp(v, "race")} />
            </div>
            <div style={sChamp}>
              <label htmlFor="couleur" style={sLabel}>Couleur <span style={sReq}>*</span></label>
              <input {...marqueChamp(etat, "couleur", sInput)} type="text" required
                     placeholder="Ex : Noir et feu" defaultValue={valeurChamp(v, "couleur")} />
            </div>
          </div>

          <div style={sGrid2}>
            <div style={sChamp}>
              <label htmlFor="sexe" style={sLabel}>Sexe <span style={sReq}>*</span></label>
              <select {...marqueChamp(etat, "sexe", sInput)} required
                      defaultValue={valeurChamp(v, "sexe")}>
                <option value="" disabled>Choisir</option>
                <option value="M">Mâle</option>
                <option value="F">Femelle</option>
              </select>
            </div>
            <div style={sChamp}>
              <label htmlFor="poids" style={sLabel}>Poids (kg) <span style={sReq}>*</span></label>
              <input {...marqueChamp(etat, "poids", sInput)} type="number" step="0.1" min="0" required
                     placeholder="Ex : 24" defaultValue={valeurChamp(v, "poids")} />
            </div>
          </div>

          <div style={{ ...sGrid2 }}>
            <div style={{ ...sChamp, marginBottom: 0 }}>
              <label htmlFor="date_naissance" style={sLabel}>Date de naissance</label>
              <input {...marqueChamp(etat, "date_naissance", sInput)} type="date"
                     defaultValue={valeurChamp(v, "date_naissance")} />
            </div>
            <div style={{ ...sChamp, marginBottom: 0 }}>
              <label htmlFor="numero_puce" style={sLabel}>Numéro de puce</label>
              <input {...marqueChamp(etat, "numero_puce", sInput)} type="text"
                     placeholder="15 chiffres" defaultValue={valeurChamp(v, "numero_puce")} />
            </div>
          </div>
        </Carte>

        {/* SECTION 2 — COHABITATION EN BOX */}
        <Carte>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={sSecNum}>2</div>
            <div>
              <p style={sSecTitre}>Cohabitation en box</p>
              <p style={sSecSous}>Avec qui votre chien peut-il partager son box ?</p>
            </div>
          </div>
          <ChoixCohabitationChamp valeur={cohabitation} />
        </Carte>

        {/* SECTION 3 — SANTÉ */}
        <Carte>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={sSecNum}>3</div>
            <div>
              <p style={sSecTitre}>Santé</p>
              <p style={sSecSous}>Suivi médical et remarques.</p>
            </div>
          </div>

          <div style={sChamp}>
            <label htmlFor="sterilisation" style={sLabel}>Stérilisation <span style={sReq}>*</span></label>
            <select {...marqueChamp(etat, "sterilisation", sInput)} required
                    defaultValue={valeurChamp(v, "sterilisation")}>
              <option value="" disabled>Choisir</option>
              <option value="non">Non</option>
              <option value="oui">Oui</option>
              <option value="chimique">Castré chimiquement</option>
            </select>
          </div>

          <div style={sChamp}>
            <label htmlFor="allergies" style={sLabel}>Allergies</label>
            <textarea {...marqueChamp(etat, "allergies", { ...sInput, resize: "vertical" })}
                      rows={2} placeholder="Aliments, médicaments…"
                      defaultValue={valeurChamp(v, "allergies")} />
          </div>

          <div style={sChamp}>
            <label htmlFor="traitements" style={sLabel}>Traitements en cours</label>
            <textarea {...marqueChamp(etat, "traitements", { ...sInput, resize: "vertical" })}
                      rows={2} placeholder="Médication, posologie…"
                      defaultValue={valeurChamp(v, "traitements")} />
          </div>

          <div style={{ ...sChamp, marginBottom: 0 }}>
            <label htmlFor="remarques" style={sLabel}>Remarques</label>
            <textarea {...marqueChamp(etat, "remarques", { ...sInput, resize: "vertical" })}
                      rows={3} placeholder="Tout ce qu'on devrait savoir"
                      defaultValue={valeurChamp(v, "remarques")} />
          </div>
        </Carte>

      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 20 }}>
        <BoutonEnregistrer />
        <Bouton variante="secondaire" href="/mon-compte/chiens">← Retour</Bouton>
      </div>
    </form>
  );
}
