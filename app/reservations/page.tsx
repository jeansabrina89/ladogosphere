import Link from "next/link";
import { createClient } from "../../src/utils/supabase/server";
import { formatDate, aujourdhuiISO } from "../../src/lib/dates";
import { formatBoxLabel } from "../../src/lib/boxes";
import FiltresReservations from "./FiltresReservations";
import BoutonPaiementRapide from "./BoutonPaiementRapide";
import RechercheReservation from "./RechercheReservation";
import { appliquerPeriodeEtTri } from "../../src/lib/reservationsFiltres";

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filtre?: string; paiement?: string; recherche?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;
  const filtre = params.filtre || "toutes";
  const paiement = params.paiement || "tous";
  const recherche = params.recherche || "";
  const aujourd_hui = aujourdhuiISO();

  let query = supabase
    .from("reservations")
    .select(`
      *,
      clients (prenom, nom, membre),
      boxes (numero, nom),
      reservation_chiens (
        chiens (id, nom, race, categorie_poids)
      )
    `);

  if (recherche) {
    const numero = parseInt(recherche);
    if (!isNaN(numero)) {
      query = query.eq("numero", numero);
    }
    query = query.order("date_debut", { ascending: false });
  } else {
    query = appliquerPeriodeEtTri(query, filtre || "toutes", aujourd_hui);
    if (paiement !== "tous") {
      query = query.eq("statut_paiement", paiement);
    }
  }

  const { data: reservations } = await query;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-7xl mx-auto">

        <h1 className="text-4xl font-bold mb-2" style={{ color: "#1B2B5E" }}>📅 Réservations</h1>
        <p className="text-gray-600 mb-6">Liste de toutes les réservations</p>

        <div className="mb-6">
          <Link href="/reservations/nouvelle"
            className="px-4 py-2 rounded-xl font-semibold text-white"
            style={{ backgroundColor: "#4AAEA0" }}>
            ➕ Nouvelle réservation
          </Link>
        </div>

        <RechercheReservation valeurInitiale={recherche} />

        {!recherche && <FiltresReservations />}

        <p className="font-semibold mb-4" style={{ color: "#1B2B5E" }}>
          {reservations?.length ?? 0} réservation(s)
        </p>

        <div className="grid gap-4">
          {reservations?.length === 0 && (
            <p className="text-gray-400">Aucune réservation trouvée.</p>
          )}
          {reservations?.map((res) => {
            const chiens = res.reservation_chiens?.map((rc: any) => rc.chiens).filter(Boolean) ?? [];
            return (
              <div key={res.id} className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex justify-between items-start gap-4">

                  <Link href={`/reservations/${res.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xl font-bold" style={{ color: "#1B2B5E" }}>
                        {res.clients?.prenom} {res.clients?.nom}
                        {res.clients?.membre && <span className="ml-2 text-sm text-green-600">⭐ Membre</span>}
                      </p>
                      {res.numero && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: "#F5F0E8", color: "#1B2B5E" }}>
                          #{res.numero}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-500 text-sm mt-1">
                      🐶 {chiens.map((c: any) => c.nom).join(", ") || "—"}
                    </p>
                    <p className="text-gray-500 text-sm">
                      🏠 {formatBoxLabel(res.boxes)} ·{" "}
                      {res.type_reservation === "journee" ? "Journée" :
                       res.type_reservation === "sejour" ? "Séjour" : "Journée d'essai"}
                    </p>
                    <p className="text-gray-500 text-sm">
                      📅 {formatDate(res.date_debut)} → {formatDate(res.date_fin)}
                    </p>
                  </Link>

                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      res.statut === "validee" ? "bg-green-100 text-green-700" :
                      res.statut === "en_attente" ? "bg-yellow-100 text-yellow-700" :
                      res.statut === "annulee" ? "bg-red-100 text-red-700" :
                      res.statut === "refusee" ? "bg-red-100 text-red-700" :
                      res.statut === "terminee" ? "bg-gray-100 text-gray-600" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {res.statut === "validee" ? "✅ Validée" :
                       res.statut === "en_attente" ? "⏳ En attente" :
                       res.statut === "annulee" ? "❌ Annulée" :
                       res.statut === "refusee" ? "❌ Refusée" :
                       res.statut === "terminee" ? "🏁 Terminée" : res.statut}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      res.statut_paiement === "paye" ? "bg-green-100 text-green-700" :
                      res.statut_paiement === "partiel" ? "bg-orange-100 text-orange-700" :
                      "bg-red-100 text-red-700"
                    }`}>
                      {res.statut_paiement === "paye" ? "💰 Payé" :
                       res.statut_paiement === "partiel" ? "💰 Partiel" :
                       "💰 Impayé"}
                    </span>
                    {res.statut_paiement === "partiel" && res.montant_final != null && (
                      <p className="font-bold text-sm" style={{ color: "#1B2B5E" }}>
                        Reste {(Number(res.montant_final) - Number(res.montant_paye ?? 0)).toFixed(2)} CHF
                      </p>
                    )}
                    {res.statut_paiement === "impaye" && res.montant_final != null && (
                      <p className="font-bold text-sm" style={{ color: "#1B2B5E" }}>
                        {res.montant_final} CHF
                      </p>
                    )}
                    {res.statut_paiement !== "paye" && res.statut !== "annulee" && (
                      <BoutonPaiementRapide
                        reservation_id={res.id}
                        montant_final={res.montant_final}
                        statut_paiement={res.statut_paiement}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </main>
  );
}