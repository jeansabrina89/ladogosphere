import { supabase } from "../../src/lib/supabase";
import { formatDate } from "../../src/lib/dates";
import ExportCompta from "./ExportCompta";
import { createSupabaseServerClient } from "../../src/lib/supabase-server";
import { redirect } from "next/navigation";

export default async function ComptabilitePage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/");

  const { data: reservations } = await supabase
    .from("reservations")
    .select(`
      *,
      clients (prenom, nom, membre),
      boxes (numero),
      reservation_chiens (chiens (nom))
    `)
    .neq("statut", "annulee")
    .order("date_debut", { ascending: false });

  const totalFacture = reservations?.reduce((s, r) => s + (r.montant_final || 0), 0) ?? 0;
  const totalPaye = reservations?.reduce((s, r) => s + (r.montant_paye || 0), 0) ?? 0;
  const totalImpaye = totalFacture - totalPaye;

  const nbPaye = reservations?.filter(r => r.statut_paiement === "paye").length ?? 0;
  const nbPartiel = reservations?.filter(r => r.statut_paiement === "partiel").length ?? 0;
  const nbImpaye = reservations?.filter(r => !r.statut_paiement || r.statut_paiement === "impaye").length ?? 0;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-7xl mx-auto">

        <div className="flex justify-between items-start mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-bold" style={{ color: "#1B2B5E" }}>📈 Comptabilité</h1>
            <p className="text-gray-500 mt-1">Suivi des paiements et export comptable</p>
          </div>
          <ExportCompta />
        </div>

        {/* Résumé financier */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl p-6 shadow-sm text-center">
            <p className="text-3xl font-bold" style={{ color: "#1B2B5E" }}>
              {totalFacture.toFixed(2)} CHF
            </p>
            <p className="text-gray-500 text-sm mt-1">Total facturé</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm text-center">
            <p className="text-3xl font-bold text-green-600">
              {totalPaye.toFixed(2)} CHF
            </p>
            <p className="text-gray-500 text-sm mt-1">Total encaissé</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm text-center">
            <p className="text-3xl font-bold text-red-600">
              {totalImpaye.toFixed(2)} CHF
            </p>
            <p className="text-gray-500 text-sm mt-1">Total à encaisser</p>
          </div>
        </div>

        {/* Stats paiement */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-green-600">{nbPaye}</p>
            <p className="text-gray-500 text-sm">✅ Payées</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-orange-500">{nbPartiel}</p>
            <p className="text-gray-500 text-sm">⚠️ Partielles</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-red-600">{nbImpaye}</p>
            <p className="text-gray-500 text-sm">❌ Impayées</p>
          </div>
        </div>

        {/* Liste détaillée */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="min-w-full">
            <thead>
              <tr style={{ backgroundColor: "#1B2B5E" }}>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Client</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Dates</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Chien(s)</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-white">Facturé</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-white">Payé</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-white">Reste</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-white">Mode</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-white">Statut</th>
              </tr>
            </thead>
            <tbody>
              {reservations?.map((res: any, idx) => {
                const chiens = res.reservation_chiens?.map((rc: any) => rc.chiens?.nom).filter(Boolean).join(", ") || "—";
                const reste = (res.montant_final || 0) - (res.montant_paye || 0);
                return (
                  <tr key={res.id}
                    className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}
                    style={{ borderBottom: "1px solid #E2E8F0" }}>
                    <td className="px-4 py-3 text-sm font-semibold" style={{ color: "#1B2B5E" }}>
                      {res.clients?.prenom} {res.clients?.nom}
                      {res.clients?.membre && <span className="ml-1 text-green-600 text-xs">⭐</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(res.date_debut)} → {formatDate(res.date_fin)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{chiens}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold" style={{ color: "#1B2B5E" }}>
                      {res.montant_final ? `${res.montant_final} CHF` : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-green-600 font-semibold">
                      {res.montant_paye ? `${res.montant_paye} CHF` : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold"
                      style={{ color: reste > 0 ? "#DC2626" : "#16A34A" }}>
                      {res.montant_final ? `${reste.toFixed(2)} CHF` : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-gray-500 capitalize">
                      {res.mode_paiement || "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        res.statut_paiement === "paye" ? "bg-green-100 text-green-700" :
                        res.statut_paiement === "partiel" ? "bg-orange-100 text-orange-700" :
                        "bg-red-100 text-red-700"
                      }`}>
                        {res.statut_paiement === "paye" ? "✅ Payé" :
                         res.statut_paiement === "partiel" ? "⚠️ Partiel" :
                         "❌ Impayé"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>
    </main>
  );
}