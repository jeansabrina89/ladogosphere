"use client";

import { useRouter } from "next/navigation";

export default function PlanningNavigation({
  dateSelectionnee,
  vue,
  aujourd_hui,
}: {
  dateSelectionnee: string;
  vue: string;
  aujourd_hui: string;
}) {
  const router = useRouter();

  const naviguer = (nouvelleDate: string, nouvelleVue: string) => {
    router.push(`/planning?date=${nouvelleDate}&vue=${nouvelleVue}`);
  };

  const changerVue = (nouvelleVue: string) => {
    naviguer(dateSelectionnee, nouvelleVue);
  };

  const getPrevDate = () => {
    const d = new Date(dateSelectionnee);
    if (vue === "jour") d.setDate(d.getDate() - 1);
    else if (vue === "semaine") d.setDate(d.getDate() - 7);
    else if (vue === "mois") d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  };

  const getNextDate = () => {
    const d = new Date(dateSelectionnee);
    if (vue === "jour") d.setDate(d.getDate() + 1);
    else if (vue === "semaine") d.setDate(d.getDate() + 7);
    else if (vue === "mois") d.setMonth(d.getMonth() + 1);
    return d.toISOString().split("T")[0];
  };

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">

      {/* Sélecteur de vue */}
      <div className="flex rounded-xl overflow-hidden border bg-white shadow">
        {["jour", "semaine", "mois"].map((v) => (
          <button key={v} onClick={() => changerVue(v)}
            className={`px-4 py-2 text-sm font-semibold capitalize ${
              vue === v ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}>
            {v === "jour" ? "Jour" : v === "semaine" ? "Semaine" : "Mois"}
          </button>
        ))}
      </div>

      {/* Navigation */}
      <button onClick={() => naviguer(getPrevDate(), vue)}
        className="bg-white px-3 py-2 rounded-xl shadow hover:bg-gray-50 text-sm">
        ←
      </button>

      <button onClick={() => naviguer(aujourd_hui, vue)}
        className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 text-sm">
        Aujourd'hui
      </button>

      <button onClick={() => naviguer(getNextDate(), vue)}
        className="bg-white px-3 py-2 rounded-xl shadow hover:bg-gray-50 text-sm">
        →
      </button>

      {/* Sélecteur de date */}
      <input type="date" defaultValue={dateSelectionnee}
        onChange={(e) => naviguer(e.target.value, vue)}
        className="bg-white border rounded-xl px-4 py-2 shadow text-sm" />

    </div>
  );
}