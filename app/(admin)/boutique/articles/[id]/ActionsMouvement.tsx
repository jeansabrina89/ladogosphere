"use client";

import { useActionState, useState } from "react";
import { passerMouvement, type EtatBoutique } from "../../actions";
import AlerteFormulaire, { marqueChamp } from "@/app/components/AlerteFormulaire";
import { ETAT_FORMULAIRE_VIDE } from "@/src/lib/etatFormulaire";
import {
  ecartInventaire,
  formatQuantite,
  lireNombre,
  type TypeMouvement,
} from "@/src/lib/boutiqueLogique";

/**
 * Les trois gestes du local : une entrée, un comptage, une casse.
 *
 * Écran de debout : une seule colonne, des champs de 52 px, une police de
 * 16 px, et un clavier numérique qui s'ouvre tout seul. Rien n'est enfoui dans
 * un menu — on choisit le geste, on tape la quantité, on valide.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.16)";

const champ: React.CSSProperties = {
  width: "100%", minHeight: 52, padding: "12px 14px",
  border: BORDURE, borderRadius: 14, fontSize: 16, color: MARINE,
  backgroundColor: "#FFFFFF", fontFamily: "inherit", boxSizing: "border-box",
};

const etiquette: React.CSSProperties = {
  display: "block", fontSize: 14, fontWeight: 600, color: MARINE, marginBottom: 6,
};

const GESTES: { type: TypeMouvement; libelle: string; couleur: string }[] = [
  { type: "entree",     libelle: "➕ Entrée manuelle",        couleur: "#1F6E5B" },
  { type: "ajustement", libelle: "📦 Ajustement d'inventaire", couleur: "#6E5410" },
  { type: "perte",      libelle: "💔 Perte / casse",           couleur: "#A8453A" },
];

export default function ActionsMouvement({
  articleId,
  stockActuel,
  unite,
  perissable,
}: {
  articleId: string;
  stockActuel: number;
  unite: string;
  perissable: boolean;
}) {
  const [etat, action, enCours] = useActionState<EtatBoutique, FormData>(
    passerMouvement.bind(null, articleId),
    ETAT_FORMULAIRE_VIDE
  );

  const [geste, setGeste] = useState<TypeMouvement | null>(null);
  const [quantite, setQuantite] = useState("");

  // Après un enregistrement réussi, le formulaire se referme de lui-même.
  const [messageVu, setMessageVu] = useState<string | null | undefined>(etat.message);
  if (etat.message !== messageVu) {
    setMessageVu(etat.message);
    if (etat.message) { setGeste(null); setQuantite(""); }
  }

  const saisie = lireNombre(quantite);
  const ecart = saisie === null ? null : ecartInventaire(stockActuel, saisie);

  return (
    <div>
      <h2 className="font-bold" style={{ color: MARINE, margin: "0 0 12px" }}>Mouvements</h2>

      {etat.message && (
        <p
          role="status"
          style={{
            backgroundColor: "#E4F1EC", color: "#1F6E5B", border: "1px solid #B9DDD1",
            borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 600,
            margin: "0 0 12px",
          }}
        >
          ✅ {etat.message}
        </p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {GESTES.map((g) => (
          <button
            key={g.type}
            type="button"
            onClick={() => { setGeste(geste === g.type ? null : g.type); setQuantite(""); }}
            style={{
              minHeight: 52, borderRadius: 14, fontSize: 16, fontWeight: 700,
              fontFamily: "inherit", cursor: "pointer", textAlign: "left", padding: "0 16px",
              border: geste === g.type ? `2px solid ${g.couleur}` : BORDURE,
              backgroundColor: geste === g.type ? "#FFFFFF" : "#FBF9F5",
              color: g.couleur,
            }}
          >
            {g.libelle}
          </button>
        ))}
      </div>

      {geste && (
        <form action={action} style={{ display: "grid", gap: 16, marginTop: 18 }}>
          <AlerteFormulaire etat={etat} />
          <input type="hidden" name="type" value={geste} />

          <div>
            <label htmlFor="quantite" style={etiquette}>
              {geste === "ajustement" ? `Stock compté (${unite})` : `Quantité (${unite})`}
            </label>
            <input
              {...marqueChamp(etat, "quantite", { ...champ, fontSize: 22, fontWeight: 700 })}
              type="text"
              inputMode="decimal"
              autoFocus
              value={quantite}
              onChange={(e) => setQuantite(e.target.value)}
              placeholder="0"
            />
            <p style={{ fontSize: 14, color: SOUS, margin: "8px 0 0" }}>
              {geste === "ajustement"
                ? `Stock de la fiche : ${formatQuantite(stockActuel)} ${unite}${
                    ecart === null || ecart === 0 ? "" : ` · écart ${ecart > 0 ? "+" : ""}${formatQuantite(ecart)}`
                  }`
                : `Stock actuel : ${formatQuantite(stockActuel)} ${unite}`}
            </p>
          </div>

          {(geste === "ajustement" || geste === "perte") && (
            <div>
              <label htmlFor="motif" style={etiquette}>Motif</label>
              <input
                {...marqueChamp(etat, "motif", champ)}
                type="text"
                required
                placeholder={geste === "perte" ? "Sac déchiré à la réception" : "Comptage du rayon"}
              />
            </div>
          )}

          {geste === "entree" && perissable && (
            <div>
              <label htmlFor="date_peremption" style={etiquette}>
                Date de péremption (facultative)
              </label>
              <input {...marqueChamp(etat, "date_peremption", champ)} type="date" />
            </div>
          )}

          <button
            type="submit"
            disabled={enCours}
            style={{
              minHeight: 52, borderRadius: 14, border: "none", backgroundColor: "#2E8B7E",
              color: "#FFFFFF", fontSize: 16, fontWeight: 700, fontFamily: "inherit",
              cursor: enCours ? "wait" : "pointer", opacity: enCours ? 0.6 : 1,
            }}
          >
            {enCours ? "Enregistrement…" : "Enregistrer le mouvement"}
          </button>
        </form>
      )}
    </div>
  );
}
