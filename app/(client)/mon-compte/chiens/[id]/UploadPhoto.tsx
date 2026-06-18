"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function UploadPhoto({
  chienId,
  photoActuelle,
}: {
  chienId: string;
  photoActuelle: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const handleFichier = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErreur(null);

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErreur("Format accepté : JPEG, PNG ou WebP.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setErreur("La photo ne doit pas dépasser 4 Mo.");
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`/api/chiens/${chienId}/photo`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErreur(data.error || "Échec de l'envoi.");
        return;
      }
      router.refresh();
    } catch {
      setErreur("Échec de l'envoi.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        style={{ background: "transparent", border: "none", color: "#2E8B7E", fontSize: 14, fontWeight: 600, cursor: "pointer", textDecoration: "underline", padding: 4 }}
      >
        {loading ? "Envoi en cours…" : photoActuelle ? "Changer la photo" : "Ajouter une photo"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFichier}
        style={{ display: "none" }}
      />
      {erreur && <p style={{ color: "#DC2626", fontSize: 13, margin: 0 }}>{erreur}</p>}
    </div>
  );
}
