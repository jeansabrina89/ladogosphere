"use client";

import { useRouter } from "next/navigation";

export default function BoutonValiderReservation({ id }: { id: string }) {
  const router = useRouter();

  const handleValider = async () => {
    const response = await fetch(`/api/reservations/${id}/statut`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statut: "validee" }),
    });
    if (response.ok) {
      router.refresh();
    }
  };

  return (
    <button onClick={handleValider}
      className="px-3 py-1 rounded-lg text-xs font-semibold text-white"
      style={{ backgroundColor: "#4AAEA0" }}>
      ✅ Valider
    </button>
  );
}