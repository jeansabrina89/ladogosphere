"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { creerFicheInterne } from "@/app/(client)/mon-compte/actionsPersonnel";

/**
 * Page proposée à un membre du personnel qui n'a pas encore de fiche interne.
 * Un seul geste : créer son profil, à partir de sa fiche RH.
 */
export default function CreerProfilPersonnel() {
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState("");
  const router = useRouter();

  const creer = async () => {
    setLoading(true);
    setErreur("");
    const res = await creerFicheInterne();
    if (!res.ok) {
      setErreur(res.error);
      setLoading(false);
      return;
    }
    router.refresh();
  };

  return (
    <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ backgroundColor: "#fff", borderRadius: 18, padding: 32, border: "1px solid rgba(27,43,94,0.12)", textAlign: "center" }}>
          <p style={{ fontSize: 44, margin: "0 0 8px" }}>🐾</p>
          <h1 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 24, fontWeight: 700, color: "#1B2B5E", margin: "0 0 8px" }}>
            Mes chiens à la pension
          </h1>
          <p style={{ fontSize: 14.5, color: "rgba(27,43,94,0.65)", margin: "0 0 8px", lineHeight: 1.6 }}>
            Créez votre profil pour enregistrer vos chiens et réserver leurs journées
            et séjours, comme un client — mais gratuitement.
          </p>
          <p style={{ fontSize: 13, color: "rgba(27,43,94,0.5)", margin: "0 0 22px" }}>
            Vos réservations sont validées automatiquement, sans cotisation ni facture.
          </p>

          {erreur && (
            <div style={{ backgroundColor: "#FBE2DE", color: "#A8453A", borderRadius: 12, padding: "12px 16px", marginBottom: 16, fontSize: 14 }}>
              {erreur}
            </div>
          )}

          <button
            onClick={creer}
            disabled={loading}
            style={{
              backgroundColor: "#4AAEA0", color: "#fff", border: "none",
              padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15,
              cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Création…" : "Créer mon profil"}
          </button>
        </div>
      </div>
    </main>
  );
}
