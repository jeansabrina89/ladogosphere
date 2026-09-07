"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Photo de l'article, déposée comme un justificatif de dépense : un bouton, la
 * caméra du téléphone, et c'est fini.
 *
 * Elle part en revanche dans un bucket PUBLIC, distinct des justificatifs :
 * c'est une image de catalogue, destinée au site vitrine, qui n'a ni session
 * ni clé pour renouveler une URL signée.
 */
export default function PhotoArticle({
  articleId,
  url,
  nom,
}: {
  articleId: string;
  url: string | null;
  nom: string;
}) {
  const router = useRouter();
  const champ = useRef<HTMLInputElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const MARINE = "#1B2B5E";
  const BORDURE = "1px solid rgba(27,43,94,0.14)";

  async function envoyer(fichier: File | null) {
    setErreur(null);
    if (!fichier) return;
    if (fichier.size > 4 * 1024 * 1024) {
      return setErreur("La photo ne doit pas dépasser 4 Mo.");
    }

    setEnCours(true);
    const corps = new FormData();
    corps.set("photo", fichier);
    const r = await fetch(`/api/articles/${articleId}/photo`, { method: "POST", body: corps });
    setEnCours(false);
    if (champ.current) champ.current.value = "";

    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      return setErreur(data.error ?? "Le dépôt a échoué.");
    }
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {url ? (
        // Image du bucket public de la boutique — servie telle quelle.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={nom}
          style={{
            width: "100%", maxHeight: 260, objectFit: "contain",
            borderRadius: 14, border: BORDURE, backgroundColor: "#FFFFFF",
          }}
        />
      ) : (
        <p style={{ color: "rgba(27,43,94,0.55)", fontSize: 14, margin: 0 }}>
          Aucune photo. Le site vitrine affichera l&apos;article sans image.
        </p>
      )}

      <input
        ref={champ}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => envoyer(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => champ.current?.click()}
        disabled={enCours}
        style={{
          minHeight: 48, padding: "0 16px", borderRadius: 14,
          border: "1px dashed rgba(27,43,94,0.3)", backgroundColor: "#FFFFFF",
          color: MARINE, fontSize: 15, fontWeight: 600, fontFamily: "inherit",
          cursor: enCours ? "wait" : "pointer",
        }}
      >
        {enCours ? "Dépôt…" : url ? "📷 Remplacer la photo" : "📷 Ajouter une photo"}
      </button>

      {erreur && (
        <p aria-live="polite" style={{ color: "#8A1F1F", fontSize: 14, fontWeight: 600, margin: 0 }}>
          ⚠️ {erreur}
        </p>
      )}
    </div>
  );
}
