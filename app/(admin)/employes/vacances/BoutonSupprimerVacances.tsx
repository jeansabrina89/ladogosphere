"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BoutonSupprimerVacances({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const supprimer = async () => {
    if (!confirm("Supprimer cette demande de vacances ? Les jours seront recrédités et le planning remis à jour.")) {
      return;
    }
    setLoading(true);
    const res = await fetch("/api/rh/vacances", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Erreur lors de la suppression.");
      return;
    }
    router.refresh();
  };

  return (
    <button onClick={supprimer} disabled={loading}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
      style={{ backgroundColor: "#EDE8DF", color: "#A8453A" }}
      title="Supprimer">
      🗑️
    </button>
  );
}
