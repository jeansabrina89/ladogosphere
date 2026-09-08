"use client";

import { useActionState, useState } from "react";
import { validerComptage, type EtatBoutique } from "@/app/(admin)/boutique/actions";
import AlerteFormulaire from "@/app/components/AlerteFormulaire";
import { ETAT_FORMULAIRE_VIDE } from "@/src/lib/etatFormulaire";
import {
  ecartInventaire,
  formatQuantite,
  libelleCategorieArticle,
  lireNombre,
  motifInventaire,
} from "@/src/lib/boutiqueLogique";

export type LigneComptage = {
  id: string;
  reference: string;
  nom: string;
  categorie: string;
  unite: string;
  stock_actuel: number;
};

/**
 * Comptage d'inventaire — l'écran le plus « debout » de l'application : on est
 * dans le local, le téléphone dans une main, les paquets dans l'autre.
 *
 * Une ligne par article, en une seule colonne, des champs de 56 px et un
 * clavier numérique. L'écart se calcule sous les yeux, et tout part en une
 * seule validation, avec un motif commun.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.14)";

export default function FormInventaire({
  lignes,
  dateDuJour,
}: {
  lignes: LigneComptage[];
  dateDuJour: string;
}) {
  const [etat, action, enCours] = useActionState<EtatBoutique, FormData>(
    validerComptage,
    ETAT_FORMULAIRE_VIDE
  );

  const [comptes, setComptes] = useState<Record<string, string>>({});
  const [date, setDate] = useState(dateDuJour);

  // Après une validation réussie, les quantités comptées repartent à zéro :
  // elles sont devenues des mouvements.
  const [messageVu, setMessageVu] = useState<string | null | undefined>(etat.message);
  if (etat.message !== messageVu) {
    setMessageVu(etat.message);
    if (etat.message) setComptes({});
  }

  const ecarts = lignes
    .map((l) => {
      const compte = lireNombre(comptes[l.id] ?? "");
      if (compte === null || compte < 0) return null;
      const ecart = ecartInventaire(l.stock_actuel, compte);
      return ecart === 0 ? null : ecart;
    })
    .filter((e): e is number => e !== null);

  const nbComptees = lignes.filter((l) => lireNombre(comptes[l.id] ?? "") !== null).length;

  return (
    <form action={action} style={{ paddingBottom: 110 }}>
      <AlerteFormulaire etat={etat} />

      {etat.message && (
        <p
          role="status"
          style={{
            backgroundColor: "#E4F1EC", color: "#1F6E5B", border: "1px solid #B9DDD1",
            borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 600,
            margin: "0 0 16px",
          }}
        >
          ✅ {etat.message}
        </p>
      )}

      <div style={{ marginBottom: 18 }}>
        <label htmlFor="date_inventaire" style={{ display: "block", fontSize: 14, fontWeight: 600, color: MARINE, marginBottom: 6 }}>
          Date de l&apos;inventaire
        </label>
        <input
          id="date_inventaire"
          name="date_inventaire"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{
            minHeight: 52, padding: "12px 14px", border: BORDURE, borderRadius: 14,
            fontSize: 16, color: MARINE, backgroundColor: "#FFFFFF", fontFamily: "inherit",
          }}
        />
        <p style={{ fontSize: 13, color: SOUS, margin: "6px 0 0" }}>
          Motif porté sur chaque ajustement : « {motifInventaire(date || dateDuJour)} ».
        </p>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {lignes.map((l) => {
          const compte = lireNombre(comptes[l.id] ?? "");
          const ecart = compte === null || compte < 0 ? null : ecartInventaire(l.stock_actuel, compte);
          return (
            <div
              key={l.id}
              style={{
                border: ecart ? "1px solid #C9A84C" : BORDURE,
                backgroundColor: ecart ? "#FFFDF6" : "#FFFFFF",
                borderRadius: 16, padding: 14,
              }}
            >
              <input type="hidden" name={`theorique_${l.id}`} value={l.stock_actuel} />

              <p style={{ color: MARINE, fontSize: 16, fontWeight: 700, margin: 0 }}>{l.nom}</p>
              <p style={{ color: SOUS, fontSize: 13, margin: "2px 0 10px" }}>
                {l.reference} · {libelleCategorieArticle(l.categorie)}
              </p>

              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ color: SOUS, fontSize: 15, minWidth: 120 }}>
                  Théorique : <strong style={{ color: MARINE }}>{formatQuantite(l.stock_actuel)}</strong> {l.unite}
                </span>

                <label htmlFor={`compte_${l.id}`} style={{ color: SOUS, fontSize: 15 }}>
                  Compté
                </label>
                <input
                  id={`compte_${l.id}`}
                  name={`compte_${l.id}`}
                  type="text"
                  inputMode="decimal"
                  value={comptes[l.id] ?? ""}
                  onChange={(e) => setComptes({ ...comptes, [l.id]: e.target.value })}
                  placeholder="—"
                  style={{
                    width: 110, minHeight: 56, padding: "12px 14px", border: BORDURE,
                    borderRadius: 14, fontSize: 20, fontWeight: 700, color: MARINE,
                    backgroundColor: "#FFFFFF", fontFamily: "inherit", textAlign: "center",
                  }}
                />

                <span
                  style={{
                    fontSize: 15, fontWeight: 700,
                    color: ecart === null ? SOUS : ecart === 0 ? "#1F6E5B" : ecart > 0 ? "#1F6E5B" : "#A8453A",
                  }}
                >
                  {ecart === null ? "" : ecart === 0 ? "juste" : `écart ${ecart > 0 ? "+" : ""}${formatQuantite(ecart)}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Barre collée en bas : le pouce y arrive sans changer de main. */}
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0,
          padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
          backgroundColor: "rgba(245,240,232,0.96)", borderTop: BORDURE,
          display: "flex", gap: 12, alignItems: "center", zIndex: 20,
        }}
        className="md:pl-[264px]"
      >
        <span style={{ color: SOUS, fontSize: 14, flex: "0 0 auto" }}>
          {nbComptees} compté{nbComptees > 1 ? "s" : ""}
          {ecarts.length > 0 && ` · ${ecarts.length} écart${ecarts.length > 1 ? "s" : ""}`}
        </span>
        <button
          type="submit"
          disabled={enCours || nbComptees === 0}
          style={{
            flex: 1, minHeight: 52, borderRadius: 14, border: "none",
            backgroundColor: nbComptees === 0 ? "#B9CFC9" : "#2E8B7E",
            color: "#FFFFFF", fontSize: 16, fontWeight: 700, fontFamily: "inherit",
            cursor: enCours || nbComptees === 0 ? "not-allowed" : "pointer",
          }}
        >
          {enCours ? "Validation…" : "Valider l'inventaire"}
        </button>
      </div>
    </form>
  );
}
