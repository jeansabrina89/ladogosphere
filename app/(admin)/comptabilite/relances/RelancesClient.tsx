"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Carte from "@/app/components/ui/Carte";
import EtatVide from "@/app/components/ui/EtatVide";
import { formatDateFR } from "@/src/lib/dates";
import { LABEL_RELANCE } from "@/src/lib/relances";

type Candidat = {
  id: string;
  numero: number | null;
  nom: string;
  email: string | null;
  date_debut: string;
  date_fin: string;
  reste: number;
  niveau: number;
  relance_niveau: number;
  relance_le: string | null;
};

const COULEUR: Record<number, string> = { 1: "#C9A84C", 2: "#E8847A", 3: "#A8453A" };

export default function RelancesClient({ candidats }: { candidats: Candidat[] }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoyes, setEnvoyes] = useState<Set<string>>(new Set());

  const envoyer = async (c: Candidat) => {
    setErreur(null);
    const label = LABEL_RELANCE[c.niveau] ?? "relance";
    if (!window.confirm(`Envoyer « ${label} » à ${c.nom} (CHF ${c.reste.toFixed(2)}) ?`)) return;
    setEnCours(c.id);
    try {
      const res = await fetch("/api/relances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservation_id: c.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur.");
        setEnCours(null);
        return;
      }
      setEnvoyes((prev) => new Set(prev).add(c.id));
      setEnCours(null);
      router.refresh();
    } catch {
      setErreur("Erreur réseau.");
      setEnCours(null);
    }
  };

  if (candidats.length === 0) {
    return (
      <Carte>
        <EtatVide
          icone="✅"
          titre="Aucune relance en attente"
          message="Tous les séjours impayés sont à jour de relance."
        />
      </Carte>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {erreur && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 14,
            background: "#FBE2DE",
            color: "#A8453A",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ❌ {erreur}
        </div>
      )}
      {candidats.map((c) => {
        const fait = envoyes.has(c.id);
        const couleur = COULEUR[c.niveau] ?? "#C9A84C";
        return (
          <Carte key={c.id}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <p style={{ margin: 0, fontWeight: 700, color: "#1B2B5E", fontSize: 16 }}>
                    {c.nom}
                  </p>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "2px 10px",
                      borderRadius: 999,
                      background: couleur,
                      color: "#fff",
                    }}
                  >
                    {LABEL_RELANCE[c.niveau] ?? "Relance"}
                  </span>
                  {c.numero && (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "#F5F0E8",
                        color: "#1B2B5E",
                      }}
                    >
                      #{c.numero}
                    </span>
                  )}
                </div>
                <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "rgba(27,43,94,0.6)" }}>
                  📅 {formatDateFR(c.date_debut)} → {formatDateFR(c.date_fin)}
                  {c.relance_niveau > 0 &&
                    ` · dernière relance : ${LABEL_RELANCE[c.relance_niveau] ?? ""}`}
                  {!c.email && " · ⚠️ pas d'email"}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <p style={{ margin: 0, fontWeight: 700, color: "#1B2B5E", whiteSpace: "nowrap" }}>
                  {c.reste.toFixed(2)} CHF
                </p>
                <button
                  onClick={() => envoyer(c)}
                  disabled={enCours === c.id || fait || !c.email}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                  style={{ backgroundColor: fait ? "#2E8B7E" : couleur }}
                >
                  {fait ? "✅ Envoyé" : enCours === c.id ? "Envoi…" : "Envoyer"}
                </button>
              </div>
            </div>
          </Carte>
        );
      })}
    </div>
  );
}
