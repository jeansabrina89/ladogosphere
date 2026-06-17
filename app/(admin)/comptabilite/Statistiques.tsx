"use client";

import { useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts";

type StatMois = {
  mois: string;
  ca_facture: number;
  ca_encaisse: number;
  ca_annee_prec: number;
  ca_cotisations: number;
  ca_total: number;
  nb_reservations: number;
  nb_chiens_total: number;
  taux_box: number;
  taux_places: number;
};

type StatJour = {
  jour: string;
  nb_chiens: number;
  taux_remplissage: number;
};

export default function Statistiques({
  statsMois,
  statsJours,
  annee,
  totalAnneeFacture,
  totalAnneeEncaisse,
  totalAnneePrec,
  totalCotisations,
  totalEncaisse,
  nbChiensActifs,
}: {
  statsMois: StatMois[];
  statsJours: StatJour[];
  annee: number;
  totalAnneeFacture: number;
  totalAnneeEncaisse: number;
  totalAnneePrec: number;
  totalCotisations: number;
  totalEncaisse: number;
  nbChiensActifs: number;
}) {
  const [vue, setVue] = useState<"ca" | "chiens" | "remplissage">("ca");

  const evolution = totalAnneePrec > 0
    ? ((totalAnneeFacture - totalAnneePrec) / totalAnneePrec * 100).toFixed(1)
    : null;

  const exporterExcel = () => {
    import("xlsx").then(XLSX => {
      const wb = XLSX.utils.book_new();

      const wsCA = XLSX.utils.json_to_sheet(statsMois.map(m => ({
        "Mois": m.mois,
        [`CA facturé ${annee} (CHF)`]: m.ca_facture,
        [`CA encaissé ${annee} (CHF)`]: m.ca_encaisse,
        [`Adhésions ${annee} (CHF)`]: m.ca_cotisations,
        [`Total ${annee} (CHF)`]: m.ca_total,
        [`CA facturé ${annee - 1} (CHF)`]: m.ca_annee_prec,
        "Évolution (%)": m.ca_annee_prec > 0
          ? ((m.ca_facture - m.ca_annee_prec) / m.ca_annee_prec * 100).toFixed(1)
          : "—",
      })));
      wsCA["!cols"] = [{ wch: 8 }, { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 15 }, { wch: 20 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, wsCA, `CA ${annee}`);

      const wsChiens = XLSX.utils.json_to_sheet(statsMois.map(m => ({
        "Mois": m.mois,
        "Chiens présents (distincts)": m.nb_chiens_total,
        "Nb réservations": m.nb_reservations,
      })));
      wsChiens["!cols"] = [{ wch: 8 }, { wch: 12 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsChiens, `Chiens ${annee}`);

      const wsTaux = XLSX.utils.json_to_sheet(statsMois.map(m => ({
        "Mois": m.mois,
        "Taux box (%)": m.taux_box,
        "Taux places (%)": m.taux_places,
      })));
      wsTaux["!cols"] = [{ wch: 8 }, { wch: 16 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsTaux, `Remplissage ${annee}`);

      if (statsJours.length > 0) {
        const wsJours = XLSX.utils.json_to_sheet(statsJours.map(j => ({
          "Jour": j.jour,
          "Nb chiens": j.nb_chiens,
          "Taux remplissage (%)": j.taux_remplissage,
        })));
        wsJours["!cols"] = [{ wch: 6 }, { wch: 12 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, wsJours, "Journalier");
      }

      XLSX.writeFile(wb, `dogosphere_stats_${annee}.xlsx`);
    });
  };

  return (
    <div className="space-y-6">

      {/* Résumé annuel */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm text-center">
          <p className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>
            {totalAnneeFacture.toFixed(2)} CHF
          </p>
          <p className="text-gray-500 text-sm mt-1">CA facturé (prestations) {annee}</p>
          {evolution && (
            <p className={`text-sm font-semibold mt-1 ${parseFloat(evolution) >= 0 ? "text-green-600" : "text-red-600"}`}>
              {parseFloat(evolution) >= 0 ? "▲" : "▼"} {Math.abs(parseFloat(evolution))}% vs {annee - 1}
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm text-center">
          <p className="text-2xl font-bold text-green-600">
            {totalAnneeEncaisse.toFixed(2)} CHF
          </p>
          <p className="text-gray-500 text-sm mt-1">CA encaissé (prestations) {annee}</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm text-center">
          <p className="text-2xl font-bold" style={{ color: "#4AAEA0" }}>
            {totalCotisations.toFixed(2)} CHF
          </p>
          <p className="text-gray-500 text-sm mt-1">⭐ Adhésions encaissées {annee}</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm text-center">
          <p className="text-2xl font-bold" style={{ color: "#C9A84C" }}>
            {totalEncaisse.toFixed(2)} CHF
          </p>
          <p className="text-gray-500 text-sm mt-1">💰 Total encaissé {annee}</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm text-center">
          <p className="text-2xl font-bold" style={{ color: "#E8847A" }}>
            {totalAnneePrec.toFixed(2)} CHF
          </p>
          <p className="text-gray-500 text-sm mt-1">CA facturé {annee - 1}</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm text-center">
          <p className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>
            {nbChiensActifs}
          </p>
          <p className="text-gray-500 text-sm mt-1">🐾 Chiens actifs (clientèle)</p>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Facturé = prestations dues sur la période (par date de séjour). Encaissé = montants perçus (par date de paiement).
      </p>

      {/* Graphiques */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
          <div className="flex gap-2 flex-wrap">
            {[
              { val: "ca", label: "💰 Chiffre d'affaires" },
              { val: "chiens", label: "🐶 Chiens présents" },
              { val: "remplissage", label: "📊 Taux de remplissage" },
            ].map(v => (
              <button key={v.val} onClick={() => setVue(v.val as any)}
                className="px-4 py-2 rounded-lg text-sm font-semibold border-2 transition"
                style={{
                  borderColor: vue === v.val ? "#4AAEA0" : "#E2E8F0",
                  backgroundColor: vue === v.val ? "#4AAEA0" : "white",
                  color: vue === v.val ? "white" : "#1B2B5E",
                }}>
                {v.label}
              </button>
            ))}
          </div>
          <button onClick={exporterExcel}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: "#C9A84C" }}>
            📥 Exporter stats Excel
          </button>
        </div>

        <h3 className="font-bold mb-3" style={{ color: "#1B2B5E" }}>
          {vue === "ca" ? `Facturé vs encaissé par mois — ${annee} (comparaison ${annee - 1})` :
           vue === "chiens" ? `Chiens présents par mois — ${annee}` :
           `Taux de remplissage mensuel — ${annee}`}
        </h3>

        <ResponsiveContainer width="100%" height={300}>
          {vue === "ca" ? (
            <BarChart data={statsMois}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mois" />
              <YAxis />
              <Tooltip formatter={(v: any) => `${v} CHF`} />
              <Legend />
              <Bar dataKey="ca_facture" name={`Facturé ${annee}`} fill="#4AAEA0" radius={[4,4,0,0]} />
              <Bar dataKey="ca_encaisse" name={`Encaissé ${annee}`} fill="#1B2B5E" radius={[4,4,0,0]} />
              <Bar dataKey="ca_annee_prec" name={`Facturé ${annee - 1}`} fill="#E8847A" radius={[4,4,0,0]} />
            </BarChart>
          ) : vue === "chiens" ? (
            <BarChart data={statsMois}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mois" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="nb_chiens_total" name="Chiens présents (distincts)" fill="#1B2B5E" radius={[4,4,0,0]} />
            </BarChart>
          ) : (
            <LineChart data={statsMois}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mois" />
              <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={(v: any) => `${v}%`} />
              <Legend />
              <Line
                type="monotone" dataKey="taux_box"
                name="Taux box (occupation des boxes)" stroke="#E8847A" strokeWidth={2}
                dot={{ fill: "#E8847A" }} />
              <Line
                type="monotone" dataKey="taux_places"
                name="Taux places (densité d'accueil)" stroke="#4AAEA0" strokeWidth={2}
                dot={{ fill: "#4AAEA0" }} />
            </LineChart>
          )}
        </ResponsiveContainer>
        {vue === "remplissage" && (
          <p className="text-xs text-gray-400 mt-3">
            Taux box = boxes occupées / boxes actives. Taux places = chiens présents / capacité standard totale (2 chiens/box).
          </p>
        )}
      </div>

      {/* Graphique journalier */}
      {statsJours.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="font-bold mb-3" style={{ color: "#1B2B5E" }}>
            📅 Chiens présents — mois en cours (jour par jour)
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={statsJours}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="jour" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="nb_chiens" name="Nb chiens" fill="#4AAEA0" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tableau mensuel */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr style={{ backgroundColor: "#1B2B5E" }}>
              <th className="px-4 py-3 text-left text-sm font-semibold text-white">Mois</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-white">Facturé {annee}</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-white">Encaissé {annee}</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-white">⭐ Adhésions</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-white">💰 Total</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-white">Facturé {annee - 1}</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-white">Évolution</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-white">Réservations</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-white">Chiens</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-white">Taux remplissage</th>
            </tr>
          </thead>
          <tbody>
            {statsMois.map((m, idx) => {
              const evol = m.ca_annee_prec > 0
                ? ((m.ca_facture - m.ca_annee_prec) / m.ca_annee_prec * 100).toFixed(1)
                : null;
              return (
                <tr key={m.mois}
                  className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}
                  style={{ borderBottom: "1px solid #E2E8F0" }}>
                  <td className="px-4 py-3 font-semibold text-sm" style={{ color: "#1B2B5E" }}>
                    {m.mois}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold" style={{ color: "#4AAEA0" }}>
                    {m.ca_facture > 0 ? `${m.ca_facture.toFixed(2)} CHF` : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-green-600">
                    {m.ca_encaisse > 0 ? `${m.ca_encaisse.toFixed(2)} CHF` : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold" style={{ color: "#C9A84C" }}>
                    {m.ca_cotisations > 0 ? `${m.ca_cotisations.toFixed(2)} CHF` : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: "#1B2B5E" }}>
                    {m.ca_total > 0 ? `${m.ca_total.toFixed(2)} CHF` : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">
                    {m.ca_annee_prec > 0 ? `${m.ca_annee_prec.toFixed(2)} CHF` : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold">
                    {evol ? (
                      <span style={{ color: parseFloat(evol) >= 0 ? "#16A34A" : "#DC2626" }}>
                        {parseFloat(evol) >= 0 ? "▲" : "▼"} {Math.abs(parseFloat(evol))}%
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{m.nb_reservations}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{m.nb_chiens_total}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    <div className="flex flex-col gap-1 items-end">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        m.taux_box >= 80 ? "bg-green-100 text-green-700" :
                        m.taux_box >= 50 ? "bg-yellow-100 text-yellow-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        📦 {m.taux_box}%
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        m.taux_places >= 80 ? "bg-green-100 text-green-700" :
                        m.taux_places >= 50 ? "bg-yellow-100 text-yellow-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        🐾 {m.taux_places}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}