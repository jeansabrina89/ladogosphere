"use client";

import { useRouter } from "next/navigation";

export default function BoutonMasquerBoxesVides({
  masquer,
  dateSelectionnee,
  vue,
}: {
  masquer: boolean;
  dateSelectionnee: string;
  vue: string;
}) {
  const router = useRouter();

  const toggle = () => {
    const nouveauMasquer = masquer ? "0" : "1";
    router.push(`/planning?date=${dateSelectionnee}&vue=${vue}&masquer=${nouveauMasquer}`);
  };

  return (
    <button onClick={toggle}
      className="px-4 py-2 rounded-xl text-sm font-semibold border-2 transition"
      style={{
        borderColor: "#4AAEA0",
        backgroundColor: masquer ? "#4AAEA0" : "white",
        color: masquer ? "white" : "#4AAEA0",
      }}>
      {masquer ? "👁 Afficher tous les boxes" : "🙈 Masquer boxes vides"}
    </button>
  );
}