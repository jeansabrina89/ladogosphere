"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ajouterAuPanier } from "../actions";

const VERT = "#1F6E5B";
const GRENAT = "#8A1F1F";
const BORDURE = "1px solid rgba(27,43,94,0.16)";
const CIBLE = 44;

/** Ajouter au panier, avec la quantité. Cibles au pouce, pas à la souris. */
export default function BoutonAjouter({
  articleId,
  nom,
  epuise,
  connecte,
}: {
  articleId: string;
  nom: string;
  epuise: boolean;
  connecte: boolean;
}) {
  const router = useRouter();
  const [quantite, setQuantite] = useState(1);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (epuise) {
    return (
      <p style={{ color: "rgba(27,43,94,0.55)", fontSize: 15, margin: 0 }}>
        « {nom} » est épuisé. Il reviendra : repassez nous voir.
      </p>
    );
  }

  const rond: React.CSSProperties = {
    width: CIBLE, height: CIBLE, flexShrink: 0, borderRadius: 12, border: BORDURE,
    backgroundColor: "#FFFFFF", color: "#1B2B5E", fontSize: 22, fontWeight: 700,
    fontFamily: "inherit", cursor: "pointer", lineHeight: 1,
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {erreur && (
        <p role="alert" style={{ color: GRENAT, fontSize: 14, margin: 0, fontWeight: 600 }}>{erreur}</p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" style={rond} aria-label="Un de moins"
          onClick={() => setQuantite((q) => Math.max(q - 1, 1))}>−</button>
        <span aria-live="polite" style={{
          minWidth: 40, textAlign: "center", color: "#1B2B5E", fontSize: 20, fontWeight: 700,
        }}>
          {quantite}
        </span>
        <button type="button" style={rond} aria-label="Un de plus"
          onClick={() => setQuantite((q) => q + 1)}>+</button>
      </div>

      <button
        type="button"
        disabled={enCours}
        onClick={async () => {
          if (!connecte) {
            router.push(`/login?suite=/mon-compte/boutique/${articleId}`);
            return;
          }
          setEnCours(true);
          const res = await ajouterAuPanier(articleId, quantite);
          setEnCours(false);
          setErreur(res.error ?? null);
          if (!res.error) router.push("/mon-compte/boutique/panier");
        }}
        style={{
          minHeight: CIBLE + 8, borderRadius: 14, border: "none",
          backgroundColor: VERT, color: "#FFFFFF", fontSize: 17, fontWeight: 700,
          fontFamily: "inherit", cursor: "pointer",
        }}
      >
        {enCours ? "…" : connecte ? "🛒 Ajouter au panier" : "Se connecter pour commander"}
      </button>
    </div>
  );
}
