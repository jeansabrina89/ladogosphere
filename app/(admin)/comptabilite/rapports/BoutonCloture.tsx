"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BoutonCloture({ annee }: { annee: number }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const cloturer = async () => {
    if (
      !confirm(
        `Cloturer definitivement l exercice ${annee} ?\n\nCette action passe l ecriture de cloture (resultat vers le report a nouveau) et VERROUILLE l annee : plus aucune ecriture ne pourra y etre ajoutee.`
      )
    )
      return;
    setError("");
    setLoading(true);
    const res = await fetch("/api/comptabilite/cloture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annee }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Erreur lors de la cloture.");
      return;
    }
    router.refresh();
  };

  return (
    <div className="ml-auto flex flex-col items-end gap-1">
      {error && (
        <span className="text-xs" style={{ color: "#A8453A" }}>{error}</span>
      )}
      <button
        onClick={cloturer}
        disabled={loading}
        className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: "#1B2B5E" }}
      >
        {loading ? "Cloture..." : `🔒 Cloturer l exercice ${annee}`}
      </button>
    </div>
  );
}
