"use client";

import { useActionState, useState } from "react";
import { entrerStock, type EtatBoutique } from "@/app/(admin)/boutique/actions";
import AlerteFormulaire from "@/app/components/AlerteFormulaire";
import EntreeEnStock, {
  type ArticleEntree,
  type LigneEntree,
} from "@/app/components/EntreeEnStock";
import { ETAT_FORMULAIRE_VIDE } from "@/src/lib/etatFormulaire";

/**
 * Entrée en stock rattachée à une dépense de marchandises déjà validée :
 * le cas du brouillon repris plus tard, ou du carton oublié à la saisie.
 */
export default function AjouterEntreeStock({
  depenseId,
  articles,
}: {
  depenseId: string;
  articles: ArticleEntree[];
}) {
  const [etat, action, enCours] = useActionState<EtatBoutique, FormData>(
    entrerStock.bind(null, depenseId),
    ETAT_FORMULAIRE_VIDE
  );

  const [lignes, setLignes] = useState<Record<string, LigneEntree>>({});
  const [ouvert, setOuvert] = useState(false);

  const [messageVu, setMessageVu] = useState<string | null | undefined>(etat.message);
  if (etat.message !== messageVu) {
    setMessageVu(etat.message);
    if (etat.message) { setLignes({}); setOuvert(false); }
  }

  if (!ouvert) {
    return (
      <div>
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
        <button
          type="button"
          onClick={() => setOuvert(true)}
          style={{
            minHeight: 48, padding: "0 18px", borderRadius: 14,
            border: "1px dashed rgba(27,43,94,0.3)", backgroundColor: "#FFFFFF",
            color: "#1B2B5E", fontSize: 15, fontWeight: 600, fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          📦 Entrer des articles en stock
        </button>
      </div>
    );
  }

  return (
    <form action={action} style={{ display: "grid", gap: 14 }}>
      <AlerteFormulaire etat={etat} />
      <EntreeEnStock articles={articles} lignes={lignes} onChange={setLignes} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="submit"
          disabled={enCours || Object.keys(lignes).length === 0}
          style={{
            minHeight: 48, padding: "0 20px", borderRadius: 14, border: "none",
            backgroundColor: Object.keys(lignes).length === 0 ? "#B9CFC9" : "#2E8B7E",
            color: "#FFFFFF", fontSize: 15, fontWeight: 700, fontFamily: "inherit",
            cursor: enCours || Object.keys(lignes).length === 0 ? "not-allowed" : "pointer",
          }}
        >
          {enCours ? "Enregistrement…" : "Enregistrer les entrées"}
        </button>
        <button
          type="button"
          onClick={() => { setOuvert(false); setLignes({}); }}
          style={{
            minHeight: 48, padding: "0 20px", borderRadius: 14,
            border: "1px solid rgba(27,43,94,0.16)", backgroundColor: "#FFFFFF",
            color: "rgba(27,43,94,0.55)", fontSize: 15, fontFamily: "inherit", cursor: "pointer",
          }}
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
