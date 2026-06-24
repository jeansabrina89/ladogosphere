"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { commanderAbonnement } from "@/app/(client)/mon-compte/actions";

export default function BoutonCommander({ categorie }: { categorie: string }) {
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const router = useRouter();

  async function commander() {
    setLoading(true);
    setErreur(null);
    const res = await commanderAbonnement(categorie);
    setLoading(false);
    if (res?.error) {
      setErreur(res.error);
      return;
    }
    setOk(true);
    router.refresh();
  }

  if (ok) {
    return (
      <p style={{ color: "#1F6E5B", fontSize: 14, fontWeight: 600, margin: 0 }}>
        Commande enregistrée — en attente de confirmation.
      </p>
    );
  }

  return (
    <div>
      <button
        onClick={commander}
        disabled={loading}
        style={{
          backgroundColor: "#1B2B5E",
          color: "#fff",
          border: "none",
          padding: "8px 18px",
          borderRadius: 10,
          fontWeight: 600,
          fontSize: 14,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "…" : "Commander"}
      </button>
      {erreur && (
        <p style={{ color: "#A8453A", fontSize: 13, margin: "4px 0 0" }}>{erreur}</p>
      )}
    </div>
  );
}
