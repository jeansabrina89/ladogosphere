"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ONGLETS_PERIODE } from "../../../src/lib/reservationsFiltres";

export default function FiltresPeriode() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const actif = searchParams.get("filtre") || "toutes";

  function choisir(val: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (val === "toutes") params.delete("filtre");
    else params.set("filtre", val);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {ONGLETS_PERIODE.map((o) => {
        const isActif = actif === o.val;
        return (
          <button
            key={o.val}
            onClick={() => choisir(o.val)}
            className="text-sm px-4 py-2 rounded-lg font-semibold transition"
            style={isActif
              ? { backgroundColor: "#1B2B5E", color: "white" }
              : { backgroundColor: "white", color: "#1B2B5E", border: "1px solid #E5E7EB" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
