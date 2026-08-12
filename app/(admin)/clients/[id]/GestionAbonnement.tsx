"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ajusterJoursAbonnement, supprimerAbonnement } from "./actions";

export default function GestionAbonnement({
  abonnementId,
  joursRestants,
  joursTotal,
  statut,
}: {
  abonnementId: string;
  joursRestants: number;
  joursTotal: number;
  statut: string;
}) {
  const router = useRouter();
  const [valeur, setValeur] = useState(String(joursRestants));
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const ajustable = ["actif", "epuise", "expire"].includes(statut);

  async function enregistrer() {
    setErreur(null);
    setOk(false);
    const n = Number(valeur);
    if (!Number.isInteger(n) || n < 0) {
      setErreur("Indiquez un nombre entier positif ou nul.");
      return;
    }
    setLoading(true);
    const res = await ajusterJoursAbonnement(abonnementId, n);
    setLoading(false);
    if (res?.error) {
      setErreur(res.error);
      return;
    }
    setOk(true);
    router.refresh();
  }

  async function supprimer() {
    if (
      !confirm(
        "Supprimer cet abonnement ? Il sera annulé et retiré du compte du client, et la comptabilité liée sera corrigée automatiquement. Une carte ayant déjà réglé des réservations ne pourra pas être supprimée.",
      )
    )
      return;
    setErreur(null);
    setLoading(true);
    const res = await supprimerAbonnement(abonnementId);
    setLoading(false);
    if (res?.error) {
      setErreur(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
      {ajustable && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: "rgba(27,43,94,0.6)" }}>Jours restants :</label>
          <input
            type="number"
            min={0}
            max={joursTotal}
            value={valeur}
            onChange={(e) => setValeur(e.target.value)}
            disabled={loading}
            style={{
              width: 64,
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid rgba(27,43,94,0.2)",
              padding: "4px 8px",
              color: "#1B2B5E",
              backgroundColor: "#fff",
            }}
          />
          <button
            onClick={enregistrer}
            disabled={loading}
            className="px-2 py-1 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "#4AAEA0" }}
          >
            {loading ? "…" : "Enregistrer"}
          </button>
          {ok && <span style={{ fontSize: 12, color: "#1F6E5B" }}>✓ Enregistré</span>}
        </div>
      )}
      <div>
        <button
          onClick={supprimer}
          disabled={loading}
          className="px-2 py-1 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#A8453A" }}
        >
          Supprimer l&apos;abonnement
        </button>
      </div>
      {erreur && <p style={{ color: "#A8453A", fontSize: 12, margin: 0 }}>{erreur}</p>}
    </div>
  );
}
