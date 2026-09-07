"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { refusFichierPiece } from "@/src/lib/depensesLogique";

export type PieceAffichee = {
  id: string;
  nom_fichier: string;
  mime: string;
  taille: number;
  created_at: string;
};

/**
 * Zone « Pièces jointes », partagée par les dépenses, les factures et les
 * paiements. Le fichier part vers /api/pieces ; la lecture passe toujours par
 * une URL signée de courte durée, jamais par une URL publique.
 */
export default function PiecesJointes({
  entite,
  entiteId,
  pieces,
  lectureSeule = false,
  titre = "Pièces jointes",
}: {
  entite: "depense" | "facture" | "paiement";
  entiteId: string;
  pieces: PieceAffichee[];
  /** Une pièce comptable figée ne reçoit plus de dépôt ni de retrait. */
  lectureSeule?: boolean;
  titre?: string;
}) {
  const router = useRouter();
  const champ = useRef<HTMLInputElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const marine = "#1B2B5E";
  const sous = "rgba(27,43,94,0.55)";
  const bordure = "1px solid rgba(27,43,94,0.14)";

  async function envoyer(f: File | null) {
    setErreur(null);
    if (!f) return;
    const refus = refusFichierPiece({ type: f.type, size: f.size });
    if (refus) return setErreur(refus);

    setEnCours(true);
    const corps = new FormData();
    corps.set("entite", entite);
    corps.set("entite_id", entiteId);
    corps.set("fichier", f);
    const r = await fetch("/api/pieces", { method: "POST", body: corps });
    setEnCours(false);
    if (champ.current) champ.current.value = "";

    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      return setErreur(data.error ?? "Le dépôt a échoué.");
    }
    router.refresh();
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        {titre ? (
          <h2 className="font-bold" style={{ color: marine, margin: 0 }}>{titre}</h2>
        ) : <span />}
        {!lectureSeule && (
          <>
            <input
              ref={champ}
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,application/pdf"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => envoyer(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => champ.current?.click()}
              disabled={enCours}
              style={{
                minHeight: 44, padding: "0 16px", borderRadius: 12,
                border: "1px dashed rgba(27,43,94,0.3)", backgroundColor: "#FFFFFF",
                color: marine, fontSize: 14, fontWeight: 600, fontFamily: "inherit",
                cursor: enCours ? "wait" : "pointer",
              }}
            >
              {enCours ? "Dépôt…" : "📎 Ajouter"}
            </button>
          </>
        )}
      </div>

      {pieces.length === 0 ? (
        <p style={{ color: sous, fontSize: 14, margin: 0 }}>
          {lectureSeule ? "Aucune pièce jointe." : "Aucune pièce jointe pour l'instant."}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {pieces.map((p) => (
            <li
              key={p.id}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                border: bordure, borderRadius: 12, padding: "10px 12px",
                backgroundColor: "#FFFFFF",
              }}
            >
              <span style={{ fontSize: 18 }}>{p.mime === "application/pdf" ? "📄" : "🖼️"}</span>
              <a
                href={`/api/pieces/${p.id}`}
                target="_blank"
                rel="noreferrer"
                style={{ flex: 1, color: marine, fontSize: 14, fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}
              >
                {p.nom_fichier}
              </a>
              <span style={{ color: sous, fontSize: 12, whiteSpace: "nowrap" }}>
                {(p.taille / 1024).toFixed(0)} Ko
              </span>
            </li>
          ))}
        </ul>
      )}

      {erreur && (
        <p aria-live="polite" style={{ color: "#8A1F1F", fontSize: 13, fontWeight: 600, marginTop: 8, marginBottom: 0 }}>
          ⚠️ {erreur}
        </p>
      )}
    </div>
  );
}
