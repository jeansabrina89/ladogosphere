"use client";

import { useState } from "react";
import { recupererPlanningMois } from "./actions";
import { genererPlanningPdf } from "./genererPlanningPdf";

export default function BoutonPdf({ mois, annee }: { mois: number; annee: number }) {
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const telecharger = async () => {
    setChargement(true);
    setErreur(null);
    const result = await recupererPlanningMois(mois, annee);
    if (result.error) {
      setErreur(result.error);
      setChargement(false);
      return;
    }
    genererPlanningPdf(result.lignes ?? [], mois, annee);
    setChargement(false);
  };

  return (
    <div>
      <button
        onClick={telecharger}
        disabled={chargement}
        className="px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: "#C9A84C" }}
      >
        {chargement ? "Génération PDF..." : "📥 PDF du planning"}
      </button>
      {erreur && <p className="text-red-600 text-sm mt-1">{erreur}</p>}
    </div>
  );
}
