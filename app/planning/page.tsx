import { createClient } from "../../src/utils/supabase/server";
import PlanningNavigation from "./PlanningNavigation";
import BoutonDeplacerChien from "./BoutonDeplacerChien";
import BoutonMasquerBoxesVides from "./BoutonMasquerBoxesVides";
import { formatBoxLabel } from "../../src/lib/boxes";

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; vue?: string; masquer?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;
  const aujourd_hui = new Date().toISOString().split("T")[0];
  const dateSelectionnee = params.date || aujourd_hui;
  const vue = params.vue || "semaine";
  const masquerVides = params.masquer === "1";

  const { dateDebut, dateFin, jours } = calculerPlage(dateSelectionnee, vue);

  const { data: boxes } = await supabase
    .from("boxes")
    .select("*")
    .order("numero");

  const { data: occupations } = await supabase
    .from("occupation_boxes")
    .select(`
      id,
      box_id,
      date_debut,
      date_fin,
      reservation_id,
      chiens (id, nom, race, poids, categorie_poids, sexe, sterilise)
    `)
    .lte("date_debut", dateFin)
    .gte("date_fin", dateDebut);

  // Index : boxId -> jour -> occupations[]
  const index: Record<string, Record<string, any[]>> = {};
  occupations?.forEach((occ) => {
    if (!index[occ.box_id]) index[occ.box_id] = {};
    jours.forEach((jour) => {
      if (jour >= occ.date_debut && jour <= occ.date_fin) {
        if (!index[occ.box_id][jour]) index[occ.box_id][jour] = [];
        if (occ.chiens) {
          const existe = index[occ.box_id][jour].find(
  (o: any) => JSON.stringify(o.chiens) === JSON.stringify(occ.chiens)
);
          if (!existe) index[occ.box_id][jour].push(occ);
        }
      }
    });
  });

  // Boxes occupés sur la période
  const boxesOccupes = new Set<string>();
  Object.keys(index).forEach(boxId => {
    if (Object.values(index[boxId]).some(occs => occs.length > 0)) {
      boxesOccupes.add(boxId);
    }
  });

  const boxesAffiches = masquerVides
    ? boxes?.filter(b => boxesOccupes.has(b.id))
    : boxes;

  const boxesSimples = boxes?.map(b => ({ id: b.id, numero: b.numero, nom: b.nom })) ?? [];

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-full mx-auto">

        <div className="flex justify-between items-center mb-2">
          <h1 className="text-4xl font-bold" style={{ color: "#1B2B5E" }}>
            🏠 Planning des boxes
          </h1>
          <BoutonMasquerBoxesVides
            masquer={masquerVides}
            dateSelectionnee={dateSelectionnee}
            vue={vue}
          />
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Cliquez sur un chien pour le déplacer — compatibilités calculées automatiquement
        </p>

        <PlanningNavigation
          dateSelectionnee={dateSelectionnee}
          vue={vue}
          aujourd_hui={aujourd_hui}
        />

        <div className="overflow-x-auto rounded-xl shadow">
          <table className="min-w-full border-collapse bg-white">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 px-4 py-3 text-left min-w-[100px]"
                  style={{ backgroundColor: "#1B2B5E", color: "white" }}>
                  Box
                </th>
                {jours.map((jour) => {
                  const estAujourdhui = jour === aujourd_hui;
                  const dateObj = new Date(jour + "T12:00:00");
                  return (
                    <th key={jour}
                      className="px-3 py-3 text-center text-sm min-w-[100px] border-l border-gray-200"
                      style={{
                        backgroundColor: estAujourdhui ? "#4AAEA0" : "#1B2B5E",
                        color: "white"
                      }}>
                      <div className="font-semibold">
                        {dateObj.toLocaleDateString("fr-CH", { weekday: "short" })}
                      </div>
                      <div className="text-xs opacity-80">
                        {dateObj.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" })}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {boxesAffiches?.map((box, idx) => (
                <tr key={box.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  <td className="sticky left-0 z-10 px-4 py-3 font-bold border-r border-gray-200"
                    style={{
                      color: "#1B2B5E",
                      backgroundColor: idx % 2 === 0 ? "white" : "#f8fafc"
                    }}>
                    {formatBoxLabel(box)}
                  </td>
                  {jours.map((jour) => {
                    const occs = index[box.id]?.[jour] ?? [];
                    const estAujourdhui = jour === aujourd_hui;
                    return (
                      <td key={jour}
                        className="px-2 py-2 border-l border-gray-200 align-top min-w-[100px]"
                        style={{ backgroundColor: estAujourdhui ? "#E8F5F4" : "transparent" }}>
                        {occs.length === 0 ? (
                          <span className="text-gray-300 text-xs">—</span>
                        ) : (
                          <div className="space-y-1">
                            {occs.map((occ: any) => (
                              <div key={occ.id} className={`text-xs px-2 py-1 rounded-lg font-semibold ${
                                occ.chiens?.categorie_poids === "moins_15kg" ? "bg-green-100 text-green-800" :
                                occ.chiens?.categorie_poids === "15_30kg" ? "bg-yellow-100 text-yellow-800" :
                                occ.chiens?.categorie_poids === "30_40kg" ? "bg-red-100 text-red-800" :
                                "bg-gray-100 text-gray-800"
                              }`}>
                                <BoutonDeplacerChien
                                  occupation_id={occ.id}
                                  chien={occ.chiens}
                                  box_actuel={{ numero: box.numero, nom: box.nom }}
                                  boxes={boxesSimples}
                                  date_debut={occ.date_debut}
                                  date_fin={occ.date_fin}
                                  reservation_id={occ.reservation_id}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {masquerVides && boxesAffiches?.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            Aucun chien présent sur cette période.
          </div>
        )}

      </div>
    </main>
  );
}

function calculerPlage(date: string, vue: string): {
  dateDebut: string;
  dateFin: string;
  jours: string[];
} {
  const d = new Date(date + "T12:00:00");
  let dateDebut: Date;
  let dateFin: Date;

  if (vue === "jour") {
    dateDebut = d;
    dateFin = d;
  } else if (vue === "semaine") {
    const jour = d.getDay() || 7;
    dateDebut = new Date(d);
    dateDebut.setDate(d.getDate() - jour + 1);
    dateFin = new Date(dateDebut);
    dateFin.setDate(dateDebut.getDate() + 6);
  } else {
    dateDebut = new Date(d.getFullYear(), d.getMonth(), 1);
    dateFin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  }

  const jours: string[] = [];
  const current = new Date(dateDebut);
  while (current <= dateFin) {
    jours.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }

  return {
    dateDebut: dateDebut.toISOString().split("T")[0],
    dateFin: dateFin.toISOString().split("T")[0],
    jours,
  };
}