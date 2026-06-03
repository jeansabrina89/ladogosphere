"use client";

import { useRouter } from "next/navigation";

export default function BoutonsCheckinDashboard({
  checkin_id,
  statut,
  type,
}: {
  checkin_id: string;
  statut: string;
  type: "arrivee" | "depart";
}) {
  const router = useRouter();

  const handleAction = async () => {
    const nouveauStatut = type === "arrivee" ? "arrive" : "parti";
    await fetch(`/api/checkin/${checkin_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statut: nouveauStatut }),
    });
    router.refresh();
  };

  if (type === "arrivee" && statut === "attendu") {
    return (
      <button onClick={handleAction}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
        style={{ backgroundColor: "#4AAEA0" }}>
        ✅ Arrivé
      </button>
    );
  }

  if (type === "depart" && (statut === "arrive" || statut === "a_recuperer")) {
    return (
      <button onClick={handleAction}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
        style={{ backgroundColor: "#E8847A" }}>
        🏠 Parti
      </button>
    );
  }

  return null;
}