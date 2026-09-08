"use client";

import { useRouter } from "next/navigation";

const MOIS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

export default function FiltresMois({ annee, moisActif }: { annee: number; moisActif: number | null }) {
  const router = useRouter();

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold" style={{ color: "#1B2B5E" }}>Mois :</span>
        <button
          onClick={() => router.push(`/comptabilite?annee=${annee}`)}
          className="px-3 py-1 rounded-lg text-sm font-semibold transition"
          style={{
            backgroundColor: !moisActif ? "#1B2B5E" : "#F5F0E8",
            color: !moisActif ? "white" : "#1B2B5E",
          }}>
          Tous
        </button>
        {MOIS.map((m, idx) => (
          <button key={idx}
            onClick={() => router.push(`/comptabilite?annee=${annee}&mois=${idx + 1}`)}
            className="px-3 py-1 rounded-lg text-sm font-semibold transition"
            style={{
              backgroundColor: moisActif === idx + 1 ? "#4AAEA0" : "#F5F0E8",
              color: moisActif === idx + 1 ? "white" : "#1B2B5E",
            }}>
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}