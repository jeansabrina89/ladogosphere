"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Bouton from "@/app/components/ui/Bouton";

export default function RechercheReservation({ valeurInitiale }: { valeurInitiale: string }) {
  const [valeur, setValeur] = useState(valeurInitiale);
  const router = useRouter();

  const handleRecherche = (e: React.FormEvent) => {
    e.preventDefault();
    if (valeur.trim()) router.push(`/reservations?recherche=${valeur.trim()}`);
    else router.push("/reservations");
  };

  const handleEffacer = () => {
    setValeur("");
    router.push("/reservations");
  };

  return (
    <form onSubmit={handleRecherche} style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      <input
        type="number"
        value={valeur}
        onChange={e => setValeur(e.target.value)}
        placeholder="🔍 Rechercher par n° de réservation..."
        style={{ flex: 1, maxWidth: 280, minWidth: 180, borderRadius: 14, padding: "10px 14px", fontSize: 15, border: "1px solid rgba(27,43,94,0.15)", color: "#1B2B5E", backgroundColor: "#fff", boxSizing: "border-box" }}
        min={1}
      />
      <Bouton variante="secondaire" type="submit">Rechercher</Bouton>
      {valeurInitiale && (
        <Bouton variante="discret" type="button" onClick={handleEffacer}>✖ Effacer</Bouton>
      )}
    </form>
  );
}
