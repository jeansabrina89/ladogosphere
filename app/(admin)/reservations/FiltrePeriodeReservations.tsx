"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const PERIODES = [
  { val: "a_venir",  label: "📅 À venir" },
  { val: "en_cours", label: "🟢 En cours" },
  { val: "passees",  label: "📁 Passées" },
  { val: "annulee",  label: "❌ Annulée" },
];

export default function FiltrePeriodeReservations() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const periodeParam = searchParams.get("periode") || "";
  const selected = new Set(periodeParam ? periodeParam.split(",").filter(Boolean) : []);

  const toggle = (val: string) => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val);
    else next.add(val);

    const params = new URLSearchParams(searchParams.toString());
    if (next.size > 0) {
      params.set("periode", Array.from(next).join(","));
    } else {
      params.delete("periode");
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div
      className="flex flex-wrap gap-4 px-4 py-3 rounded-xl mb-4"
      style={{ backgroundColor: "white" }}
    >
      <span className="text-sm font-semibold self-center" style={{ color: "#1B2B5E" }}>
        Période :
      </span>
      {PERIODES.map(({ val, label }) => (
        <label key={val} className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={selected.has(val)}
            onChange={() => toggle(val)}
            className="w-4 h-4 cursor-pointer accent-blue-600"
          />
          <span className="text-sm font-semibold" style={{ color: "#1B2B5E" }}>
            {label}
          </span>
        </label>
      ))}
    </div>
  );
}
