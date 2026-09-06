"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { creerOuLierFicheClient } from "@/app/(public)/inscription/actions";
import { LIBELLE_ACCORD_PHOTOS } from "@/src/lib/accordPhotos";

export default function CompleterProfilForm({ email }: { email: string }) {
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [photosOk, setPhotosOk] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!prenom.trim() || !nom.trim()) {
      setError("Le prénom et le nom sont obligatoires.");
      return;
    }

    setLoading(true);
    // Même action que l'inscription : la session fait autorité côté serveur.
    const res = await creerOuLierFicheClient({
      email,
      prenom,
      nom,
      telephone,
      photos_ok: photosOk,
    });
    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }
    router.push("/mon-compte");
    router.refresh();
  };

  const labelClass = "block font-semibold mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} style={{ color: "#1B2B5E" }}>Prénom *</label>
          <input type="text" required value={prenom}
            onChange={e => setPrenom(e.target.value)}
            className="w-full border rounded-xl p-3" placeholder="Camille" />
        </div>
        <div>
          <label className={labelClass} style={{ color: "#1B2B5E" }}>Nom *</label>
          <input type="text" required value={nom}
            onChange={e => setNom(e.target.value)}
            className="w-full border rounded-xl p-3" placeholder="Rochat" />
        </div>
      </div>

      <div>
        <label className={labelClass} style={{ color: "#1B2B5E" }}>Téléphone</label>
        <input type="tel" value={telephone}
          onChange={e => setTelephone(e.target.value)}
          className="w-full border rounded-xl p-3" placeholder="+41 79 123 45 67" />
      </div>

      <div className="rounded-xl p-4" style={{ backgroundColor: "#F5F0E8", border: "1px solid #C9A84C" }}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={photosOk}
            onChange={e => setPhotosOk(e.target.checked)}
            className="mt-0.5 h-5 w-5 flex-shrink-0 accent-[#4AAEA0]" />
          <span className="text-sm" style={{ color: "#1B2B5E" }}>{LIBELLE_ACCORD_PHOTOS}</span>
        </label>
      </div>

      <button type="submit" disabled={loading}
        className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: "#4AAEA0" }}>
        {loading ? "Enregistrement..." : "Enregistrer et continuer"}
      </button>
    </form>
  );
}
