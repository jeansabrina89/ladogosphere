"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { demanderAdhesion } from "./actions";

export default function BoutonDemanderAdhesion({ montant }: { montant: number }) {
  const [ouvert, setOuvert] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function choisir(mode: "virement" | "prochaine_resa") {
    setLoading(true);
    const res = await demanderAdhesion(mode);
    setLoading(false);
    if (res?.error) {
      alert(res.error);
      return;
    }
    setOuvert(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOuvert(true)}
        style={{ backgroundColor: "#2E8B7E", color: "#fff", border: "none", padding: "10px 18px", borderRadius: 12, fontWeight: 600, fontSize: 14, cursor: "pointer", marginTop: 8 }}
      >
        ★ Demander mon adhésion
      </button>

      {ouvert && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(27,43,94,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
          onClick={() => setOuvert(false)}
        >
          <div
            style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 380, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontFamily: "Georgia, serif", fontSize: 18, fontWeight: 700, color: "#1B2B5E", margin: "0 0 6px" }}>Demander mon adhésion</p>
            <p style={{ fontSize: 13, color: "rgba(27,43,94,0.6)", margin: "0 0 18px" }}>
              Cotisation annuelle de {montant || 180} CHF. Comment souhaites-tu la régler ?
            </p>
            <button
              disabled={loading}
              onClick={() => choisir("virement")}
              style={{ display: "block", width: "100%", textAlign: "left", background: "#F5F0E8", border: "1px solid rgba(27,43,94,0.12)", borderRadius: 12, padding: "12px 14px", marginBottom: 10, cursor: "pointer", color: "#1B2B5E", fontWeight: 600 }}
            >
              🏦 Par virement bancaire
            </button>
            <button
              disabled={loading}
              onClick={() => choisir("prochaine_resa")}
              style={{ display: "block", width: "100%", textAlign: "left", background: "#F5F0E8", border: "1px solid rgba(27,43,94,0.12)", borderRadius: 12, padding: "12px 14px", cursor: "pointer", color: "#1B2B5E", fontWeight: 600 }}
            >
              🗓️ À ajouter à ma prochaine réservation
            </button>
            <button
              onClick={() => setOuvert(false)}
              style={{ marginTop: 16, background: "none", border: "none", color: "rgba(27,43,94,0.5)", fontSize: 13, cursor: "pointer" }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </>
  );
}
