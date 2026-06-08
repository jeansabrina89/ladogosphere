"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BoutonSupprimerFiche({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSupprimer = async () => {
    if (!confirm("Supprimer cette fiche de salaire ? Cette action est irréversible.")) return;
    setLoading(true);
    await fetch(`/api/rh/fiches-salaire/${id}`, { method: "DELETE" });
    router.refresh();
    setLoading(false);
  };

  return (
    <button onClick={handleSupprimer} disabled={loading}
      className="ml-2 px-3 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
      style={{ backgroundColor: "#E8847A" }}>
      {loading ? "..." : "🗑️"}
    </button>
  );
}