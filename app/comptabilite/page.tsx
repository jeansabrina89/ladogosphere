import { createClient } from "../../src/utils/supabase/server";
import { formatDate } from "../../src/lib/dates";
import ExportCompta from "./ExportCompta";
import Statistiques from "./Statistiques";
import { createSupabaseServerClient } from "../../src/lib/supabase-server";
import { redirect } from "next/navigation";
import FiltresMois from "./FiltresMois";

export default async function ComptabilitePage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string; mois?: string }>;
}) {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const params = await searchParams;
  const annee = parseInt(params.annee || new Date().getFullYear().toString());
  const moisFiltre = params.mois ? parseInt(params.mois) : null;
  const anneePrec = annee - 1;

  // Toutes les réservations
  const { data: reservations } = await supabase
    .from("reservations")
    .select(`*, clients (prenom, nom, membre), boxes (numero), reservation_chiens (chiens (nom))`)
    .neq("statut", "annulee")
    .order("date_debut", { ascending: false });

  // Cotisations de l'année
  const { data: cotisations } = await supabase
    .from("cotisations_membres")
    .select("*, clients(prenom, nom)")
    .eq("annee", annee)
    .eq("statut", "payee")
    .order("date_paiement", { ascending: false });

  const moisLabels = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  const NB_BOXES = 12;

  const statsMois = moisLabels.map((label, idx) => {
    const moisNum = idx + 1;

    const resAnnee = reservations?.filter(r => {
      const d = new Date(r.date_debut);
      return d.getFullYear() === annee && d.getMonth() === idx;
    }) ?? [];

    const resAnneePrec = reservations?.filter(r => {
      const d = new Date(r.date_debut);
      return d.getFullYear() === anneePrec && d.getMonth() === idx;
    }) ?? [];

    const ca = resAnnee.reduce((s, r) => s + (r.montant_final || 0), 0);
    const caPrec = resAnneePrec.reduce((s, r) => s + (r.montant_final || 0), 0);

    // Cotisations du mois
    const cotisMois = cotisations?.filter(c => {
      if (!c.date_paiement) return false;
      const d = new Date(c.date_paiement);
      return d.getFullYear() === annee && d.getMonth() === idx;
    }) ?? [];
    const caCotis = cotisMois.reduce((s, c) => s + Number(c.montant), 0);

    const nbChiens = resAnnee.reduce((s, r) => s + (r.reservation_chiens?.length || 0), 0);
    const nbJoursMois = new Date(annee, moisNum, 0).getDate();
    const capaciteTotale = nbJoursMois * NB_BOXES;
    const jourOccupes = resAnnee.reduce((s, r) => {
      const debut = new Date(r.date_debut);
      const fin = new Date(r.date_fin);
      const jours = Math.max(1, Math.round((fin.getTime() - debut.getTime()) / 86400000) + 1);
      const nbC = r.reservation_chiens?.length || 1;
      return s + jours * nbC;
    }, 0);
    const taux = capaciteTotale > 0
      ? Math.min(100, Math.round(jourOccupes / capaciteTotale * 100))
      : 0;

    return {
      mois: label,
      ca: Math.round(ca * 100) / 100,
      ca_annee_prec: Math.round(caPrec * 100) / 100,
      ca_cotisations: Math.round(caCotis * 100) / 100,
      ca_total: Math.round((ca + caCotis) * 100) / 100,
      nb_reservations: resAnnee.length,
      nb_chiens_total: nbChiens,
      taux_remplissage: taux,
    };
  });

  const totalAnnee = statsMois.reduce((s, m) => s + m.ca, 0);
  const totalAnneePrec = statsMois.reduce((s, m) => s + m.ca_annee_prec, 0);
  const totalCotisations = statsMois.reduce((s, m) => s + m.ca_cotisations, 0);
  const totalGeneral = totalAnnee + totalCotisations;

  // Stats journalières
  const moisActuel = new Date().getMonth();
  const anneeActuelle = new Date().getFullYear();
  const nbJoursMoisActuel = new Date(anneeActuelle, moisActuel + 1, 0).getDate();
  const statsJours = Array.from({ length: nbJoursMoisActuel }, (_, i) => {
    const jour = i + 1;
    const dateStr = `${anneeActuelle}-${String(moisActuel + 1).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
    const nbChiens = reservations?.reduce((s, r) => {
      if (r.date_debut <= dateStr && r.date_fin >= dateStr) {
        return s + (r.reservation_chiens?.length || 0);
      }
      return s;
    }, 0) ?? 0;
    return {
      jour: String(jour),
      nb_chiens: nbChiens,
      taux_remplissage: Math.min(100, Math.round(nbChiens / NB_BOXES * 100)),
    };
  });

  // Filtrer les réservations par mois si filtre actif
  const reservationsFiltrees = moisFiltre
    ? reservations?.filter(r => {
        const d = new Date(r.date_debut);
        return d.getFullYear() === annee && d.getMonth() + 1 === moisFiltre;
      })
    : reservations;

  const cotisationsFiltrees = moisFiltre
    ? cotisations?.filter(c => {
        if (!c.date_paiement) return false;
        const d = new Date(c.date_paiement);
        return d.getFullYear() === annee && d.getMonth() + 1 === moisFiltre;
      })
    : cotisations;

  // Totaux globaux
  const totalFacture = reservationsFiltrees?.reduce((s, r) => s + (r.montant_final || 0), 0) ?? 0;
  const totalPaye = reservationsFiltrees?.reduce((s, r) => s + (r.montant_paye || 0), 0) ?? 0;
  const totalImpaye = totalFacture - totalPaye;
  const nbPaye = reservationsFiltrees?.filter(r => r.statut_paiement === "paye").length ?? 0;
  const nbPartiel = reservationsFiltrees?.filter(r => r.statut_paiement === "partiel").length ?? 0;
  const nbImpaye = reservationsFiltrees?.filter(r => !r.statut_paiement || r.statut_paiement === "impaye").length ?? 0;
  const totalCotisFiltrees = cotisationsFiltrees?.reduce((s, c) => s + Number(c.montant), 0) ?? 0;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-7xl mx-auto">

        <div className="flex justify-between items-start mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-bold" style={{ color: "#1B2B5E" }}>📈 Comptabilité</h1>
            <p className="text-gray-500 mt-1">Suivi des paiements et statistiques</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-white rounded-xl p-3 shadow-sm">
              <label className="text-sm font-semibold" style={{ color: "#1B2B5E" }}>Année :</label>
              <div className="flex gap-1">
                {[2025, 2026, 2027, 2028].map(a => (
                  <a key={a} href={`/comptabilite?annee=${a}`}
                    className="px-3 py-1 rounded-lg text-sm font-semibold transition"
                    style={{
                      backgroundColor: a === annee ? "#1B2B5E" : "#F5F0E8",
                      color: a === annee ? "white" : "#1B2B5E",
                    }}>
                    {a}
                  </a>
                ))}
              </div>
            </div>
            <ExportCompta />
          </div>
        </div>

        {/* Statistiques */}
        <Statistiques
          statsMois={statsMois}
          statsJours={statsJours}
          annee={annee}
          totalAnnee={totalAnnee}
          totalAnneePrec={totalAnneePrec}
          totalCotisations={totalCotisations}
          totalGeneral={totalGeneral}
        />

        {/* Résumé paiements */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 my-8">
          <div className="bg-white rounded-xl p-6 shadow-sm text-center">
            <p className="text-3xl font-bold" style={{ color: "#1B2B5E" }}>{totalFacture.toFixed(2)} CHF</p>
            <p className="text-gray-500 text-sm mt-1">
              Réservations facturées {moisFiltre ? `(${moisLabels[moisFiltre - 1]})` : "(toutes années)"}
            </p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm text-center">
            <p className="text-3xl font-bold" style={{ color: "#4AAEA0" }}>{totalCotisFiltrees.toFixed(2)} CHF</p>
            <p className="text-gray-500 text-sm mt-1">
              ⭐ Cotisations {moisFiltre ? `(${moisLabels[moisFiltre - 1]})` : `(${annee})`}
            </p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm text-center">
            <p className="text-3xl font-bold text-green-600">{totalPaye.toFixed(2)} CHF</p>
            <p className="text-gray-500 text-sm mt-1">Total encaissé</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm text-center">
            <p className="text-3xl font-bold text-red-600">{totalImpaye.toFixed(2)} CHF</p>
            <p className="text-gray-500 text-sm mt-1">Total à encaisser</p>
          </div>
        </div>

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

        {/* Filtre par mois */}
        <FiltresMois annee={annee} moisActif={moisFiltre} />

        {/* Liste détaillée réservations */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b" style={{ backgroundColor: "#F5F0E8" }}>
            <h2 className="font-bold" style={{ color: "#1B2B5E" }}>
              📅 Réservations {moisFiltre ? `— ${moisLabels[moisFiltre - 1]} ${annee}` : "— toutes"}
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({reservationsFiltrees?.length ?? 0} réservation(s))
              </span>
            </h2>
          </div>
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
              {reservationsFiltrees?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-gray-400 text-sm">
                    Aucune réservation pour ce mois.
                  </td>
                </tr>
              )}
              {reservationsFiltrees?.map((res: any, idx) => {
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

        {/* Liste cotisations */}
        {cotisationsFiltrees && cotisationsFiltrees.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b" style={{ backgroundColor: "#F5F0E8" }}>
              <h2 className="font-bold" style={{ color: "#1B2B5E" }}>
                ⭐ Cotisations membres {moisFiltre ? `— ${moisLabels[moisFiltre - 1]} ${annee}` : `— ${annee}`}
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({cotisationsFiltrees.length} cotisation(s) — {totalCotisFiltrees.toFixed(2)} CHF)
                </span>
              </h2>
            </div>
            <table className="min-w-full">
              <thead>
                <tr style={{ backgroundColor: "#1B2B5E" }}>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">Client</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">Date paiement</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">Mode</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-white">Montant</th>
                </tr>
              </thead>
              <tbody>
                {cotisationsFiltrees.map((c: any, idx) => (
                  <tr key={c.id}
                    className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}
                    style={{ borderBottom: "1px solid #E2E8F0" }}>
                    <td className="px-4 py-3 text-sm font-semibold" style={{ color: "#1B2B5E" }}>
                      {c.clients?.prenom} {c.clients?.nom} ⭐
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {c.date_paiement ? new Date(c.date_paiement).toLocaleDateString("fr-CH") : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 capitalize">
                      {c.mode_paiement === "cash" ? "💵 Cash" :
                       c.mode_paiement === "virement" ? "🏦 Virement" :
                       c.mode_paiement === "prochaine_resa" ? "📅 Réservation" : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: "#4AAEA0" }}>
                      {Number(c.montant).toFixed(2)} CHF
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </main>
  );
}