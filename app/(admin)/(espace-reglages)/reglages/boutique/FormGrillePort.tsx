"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enregistrerGrillePort } from "./actions";
import {
  grilleEnSaisie,
  lireSaisieGrille,
  type LigneSaisieGrille,
  type PalierPort,
} from "@/src/lib/venteEnLigneLogique";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.58)";
const VERT = "#1F6E5B";
const BORDURE = "1px solid rgba(27,43,94,0.14)";

const champ: React.CSSProperties = {
  width: 96, minHeight: 44, padding: "10px 12px", border: BORDURE, borderRadius: 12,
  fontSize: 16, color: MARINE, fontFamily: "inherit", boxSizing: "border-box",
};

const petitBouton: React.CSSProperties = {
  minHeight: 40, padding: "0 12px", borderRadius: 10, border: BORDURE, backgroundColor: "#FFFFFF",
  color: MARINE, fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
};

/** Trie les lignes lisibles par poids croissant ; les illisibles restent en bas, telles quelles. */
function trierLignes(lignes: LigneSaisieGrille[]): LigneSaisieGrille[] {
  const kg = (l: LigneSaisieGrille) => {
    const n = Number(String(l.kg).trim().replace(",", "."));
    return Number.isFinite(n) && String(l.kg).trim() !== "" ? n : Infinity;
  };
  return [...lignes].sort((a, b) => kg(a) - kg(b));
}

/**
 * La grille des frais de port, palier par palier : « jusqu'à X kg → Y.– ».
 *
 * On saisit en kilos, la base garde des grammes — au format que lit fraisPort.
 * Les paliers se rangent d'eux-mêmes par poids croissant. Le poids maximum
 * d'un colis se règle ici aussi : le dernier palier ne peut pas le dépasser.
 */
export default function FormGrillePort({
  grille,
  poidsMaxGrammes,
}: {
  grille: PalierPort[];
  poidsMaxGrammes: number;
}) {
  const router = useRouter();
  const [lignes, setLignes] = useState<LigneSaisieGrille[]>(
    grille.length > 0 ? grilleEnSaisie(grille) : [{ kg: "", prix: "" }],
  );
  const [poidsMax, setPoidsMax] = useState(String(poidsMaxGrammes / 1000));
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<{ texte: string; erreur: boolean } | null>(null);

  const changer = (i: number, cle: keyof LigneSaisieGrille, valeur: string) =>
    setLignes(lignes.map((l, j) => (j === i ? { ...l, [cle]: valeur } : l)));

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    const triees = trierLignes(lignes);
    setLignes(triees);
    // Le même contrôle qu'au serveur, pour répondre tout de suite ; le serveur
    // le refait de toute façon.
    const saisie = lireSaisieGrille({ lignes: triees, poidsMaxKg: poidsMax });
    if (!saisie.ok) { setRetour({ texte: saisie.message, erreur: true }); return; }

    setEnCours(true);
    const fd = new FormData();
    fd.set("lignes", JSON.stringify(triees));
    fd.set("poids_max_kg", poidsMax);
    const res = await enregistrerGrillePort(fd);
    setEnCours(false);
    if (res.error) { setRetour({ texte: res.error, erreur: true }); return; }
    if (res.paliers) setLignes(grilleEnSaisie(res.paliers));
    setRetour({ texte: res.message ?? "Grille enregistrée.", erreur: false });
    router.refresh();
  }

  return (
    <form onSubmit={enregistrer} style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0, color: MARINE, fontSize: 16, fontWeight: 700 }}>Frais de port</h2>
      <p style={{ color: SOUS, fontSize: 13.5, margin: 0 }}>
        Chaque palier dit ce que coûte un colis jusqu&apos;à ce poids. Un colis plus lourd que le
        dernier palier ne part pas par la poste.
      </p>

      <div style={{ display: "grid", gap: 8 }}>
        {lignes.map((l, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: MARINE }}>Jusqu&apos;à</span>
            <input
              aria-label={`Poids du palier ${i + 1}, en kilos`}
              type="text" inputMode="decimal" value={l.kg}
              onChange={(e) => changer(i, "kg", e.target.value)}
              onBlur={() => setLignes(trierLignes(lignes))}
              style={champ}
            />
            <span style={{ color: MARINE }}>kg →</span>
            <input
              aria-label={`Prix du palier ${i + 1}, en francs`}
              type="text" inputMode="decimal" value={l.prix}
              onChange={(e) => changer(i, "prix", e.target.value)}
              style={champ}
            />
            <span style={{ color: MARINE }}>CHF</span>
            <button
              type="button"
              onClick={() => setLignes(lignes.filter((_, j) => j !== i))}
              disabled={lignes.length === 1}
              style={{ ...petitBouton, opacity: lignes.length === 1 ? 0.4 : 1 }}
              aria-label={`Supprimer le palier ${i + 1}`}
            >
              Supprimer
            </button>
          </div>
        ))}
      </div>
      <div>
        <button type="button" style={petitBouton} onClick={() => setLignes([...lignes, { kg: "", prix: "" }])}>
          + Ajouter un palier
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
        <label htmlFor="poids_max_kg" style={{ color: MARINE, fontWeight: 600 }}>
          Poids maximum d&apos;un colis
        </label>
        <input
          id="poids_max_kg" type="text" inputMode="decimal" value={poidsMax}
          onChange={(e) => setPoidsMax(e.target.value)}
          style={champ}
        />
        <span style={{ color: MARINE }}>kg</span>
      </div>

      {retour && (
        <p role={retour.erreur ? "alert" : "status"} style={{
          margin: 0, fontSize: 14.5, fontWeight: 600, borderRadius: 10, padding: "8px 12px",
          backgroundColor: retour.erreur ? "#FDECEC" : "#DBEFEA",
          color: retour.erreur ? "#8A1F1F" : VERT,
        }}>
          {retour.texte}
        </p>
      )}
      <div>
        <button type="submit" disabled={enCours} style={{
          minHeight: 44, padding: "0 18px", borderRadius: 12, border: "none",
          backgroundColor: VERT, color: "#FFFFFF", fontSize: 15, fontWeight: 700,
          fontFamily: "inherit", cursor: enCours ? "wait" : "pointer", opacity: enCours ? 0.6 : 1,
        }}>
          {enCours ? "Enregistrement…" : "Enregistrer la grille"}
        </button>
      </div>
    </form>
  );
}
