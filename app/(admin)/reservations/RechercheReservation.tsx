"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RechercheReservation({ valeurInitiale }: { valeurInitiale: string }) {
  const [valeur, setValeur] = useState(valeurInitiale);
  const router = useRouter();

  const handleRecherche = (e: React.FormEvent) => {
    e.preventDefault();
    if (valeur.trim()) {
      router.push(`/reservations?recherche=${valeur.trim()}`);
    } else {
      router.push("/reservations");
    }
  };

  const handleEffacer = () => {
    setValeur("");
    router.push("/reservations");
  };

  return (
    <form onSubmit={handleRecherche} className="flex gap-2 mb-4">
      <input
        type="number"
        value={valeur}
        onChange={e => setValeur(e.target.value)}
        placeholder="🔍 Rechercher par n° de réservation..."
        className="rounded-xl p-3 text-sm flex-1 max-w-xs"
        style={{ border: "1px solid rgba(27,43,94,.15)", color: "#1B2B5E" }}
        min={1}
      />
      <button type="submit"
        className="px-4 py-2 rounded-xl font-semibold text-white text-sm"
        style={{ backgroundColor: "#1B2B5E" }}>
        Rechercher
      </button>
      {valeurInitiale && (
        <button type="button" onClick={handleEffacer}
          className="px-4 py-2 rounded-xl font-semibold text-sm"
          style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
          ✖ Effacer
        </button>
      )}
    </form>
  );
}
