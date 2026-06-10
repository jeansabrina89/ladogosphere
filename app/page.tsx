import Link from "next/link";
import { createClient } from "../src/utils/supabase/server";
import { createSupabaseServerClient } from "../src/lib/supabase-server";
import CarteReservationAttente from "./components/CarteReservationAttente";
import BoutonsCheckinDashboard from "./components/BoutonsCheckinDashboard";

export default async function Home() {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();

  const aujourd_hui = new Date().toISOString().split("T")[0];

  const [
    { count: totalChiens },
    { count: totalClients },
    { count: reservationsAttente },
    { count: chiensPresents },
    { data: dernieresReservations },
    { data: arrivees },
    { data: departs },
  ] = await Promise.all([
    supabase.from("chiens").select("*", { count: "exact", head: true }).eq("actif", true),
    supabase.from("clients").select("*", { count: "exact", head: true }).eq("actif", true),
    supabase.from("reservations").select("*", { count: "exact", head: true }).eq("statut", "en_attente"),
    supabase.from("checkin_checkout").select("*", { count: "exact", head: true }).eq("statut", "arrive"),
    supabase.from("reservations")
      .select(`*, clients (prenom, nom), reservation_chiens (chiens (nom))`)
      .eq("statut", "en_attente")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("checkin_checkout")
      .select(`
        id, statut, reservation_id,
        reservations (
          id, type_reservation, heure_arrivee,
          clients (prenom, nom),
          reservation_chiens (chiens (id, nom))
        )
      `)
      .eq("statut", "attendu")
      .gte("date_arrivee_prevue", `${aujourd_hui}T00:00:00Z`)
      .lte("date_arrivee_prevue", `${aujourd_hui}T23:59:59Z`),
    supabase.from("checkin_checkout")
      .select(`
        id, statut, reservation_id,
        reservations (
          id, type_reservation, heure_depart,
          clients (prenom, nom),
          reservation_chiens (chiens (id, nom))
        )
      `)
      .in("statut", ["arrive", "a_recuperer"])
      .gte("date_depart_prevu", `${aujourd_hui}T00:00:00Z`)
      .lte("date_depart_prevu", `${aujourd_hui}T23:59:59Z`),
  ]);

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold" style={{ color: "#1B2B5E" }}>
            Tableau de bord
          </h1>
          <p className="text-gray-500 mt-1">
            {new Date().toLocaleDateString("fr-CH", {
              weekday: "long", day: "numeric", month: "long", year: "numeric"
            })}
          </p>
        </div>

        {/* Réservations en attente */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold" style={{ color: "#1B2B5E" }}>
              ⏳ Réservations en attente de validation
              {reservationsAttente ? (
                <span className="ml-2 px-2 py-0.5 rounded-full text-sm font-bold bg-yellow-100 text-yellow-700">
                  {reservationsAttente}
                </span>
              ) : null}
            </h2>
            <Link href="/reservations"
              className="text-sm font-semibold"
              style={{ color: "#4AAEA0" }}>
              Voir tout →
            </Link>
          </div>
          {dernieresReservations?.length === 0 && (
            <p className="text-gray-400">Aucune réservation en attente. ✅</p>
          )}
          <div className="space-y-3">
            {dernieresReservations?.map((res: any) => (
              <CarteReservationAttente key={res.id} res={res} />
            ))}
          </div>
        </div>

        {/* Arrivées et départs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
              🐾 Arrivées aujourd'hui
              <span className="ml-2 px-2 py-0.5 rounded-full text-sm font-bold bg-green-100 text-green-700">
                {arrivees?.length ?? 0}
              </span>
            </h2>
            {arrivees?.length === 0 && (
              <p className="text-gray-400 text-sm">Aucune arrivée prévue.</p>
            )}
            <div className="space-y-3">
              {arrivees?.map((cc: any) => {
                const chiens = cc.reservations?.reservation_chiens?.map((rc: any) => rc.chiens).filter(Boolean) ?? [];
                return (
                  <div key={cc.id} className="border rounded-xl p-3 flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "#1B2B5E" }}>
                        {chiens.map((c: any) => c.nom).join(", ") || "—"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {cc.reservations?.clients?.prenom} {cc.reservations?.clients?.nom}
                        {cc.reservations?.heure_arrivee && ` · ${cc.reservations.heure_arrivee}`}
                      </p>
                    </div>
                    <BoutonsCheckinDashboard
                      checkin_id={cc.id}
                      statut={cc.statut}
                      type="arrivee"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
              🏠 Départs aujourd'hui
              <span className="ml-2 px-2 py-0.5 rounded-full text-sm font-bold bg-rose-100 text-rose-700">
                {departs?.length ?? 0}
              </span>
            </h2>
            {departs?.length === 0 && (
              <p className="text-gray-400 text-sm">Aucun départ prévu.</p>
            )}
            <div className="space-y-3">
              {departs?.map((cc: any) => {
                const chiens = cc.reservations?.reservation_chiens?.map((rc: any) => rc.chiens).filter(Boolean) ?? [];
                return (
                  <div key={cc.id} className="border rounded-xl p-3 flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "#1B2B5E" }}>
                        {chiens.map((c: any) => c.nom).join(", ") || "—"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {cc.reservations?.clients?.prenom} {cc.reservations?.clients?.nom}
                        {cc.reservations?.heure_depart && ` · ${cc.reservations.heure_depart}`}
                      </p>
                    </div>
                    <BoutonsCheckinDashboard
                      checkin_id={cc.id}
                      statut={cc.statut}
                      type="depart"
                    />
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-6 shadow-sm text-center">
            <p className="text-4xl font-bold" style={{ color: "#4AAEA0" }}>{chiensPresents}</p>
            <p className="text-gray-500 text-sm mt-1">Chiens présents</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm text-center">
            <p className="text-4xl font-bold" style={{ color: "#E8847A" }}>{arrivees?.length ?? 0}</p>
            <p className="text-gray-500 text-sm mt-1">Arrivées aujourd'hui</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm text-center">
            <p className="text-4xl font-bold" style={{ color: "#C9A84C" }}>{departs?.length ?? 0}</p>
            <p className="text-gray-500 text-sm mt-1">Départs aujourd'hui</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm text-center">
            <p className="text-4xl font-bold" style={{ color: "#1B2B5E" }}>{reservationsAttente}</p>
            <p className="text-gray-500 text-sm mt-1">En attente</p>
          </div>
        </div>

        {/* Stats globales */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl p-5 shadow-sm flex items-center gap-4">
            <span className="text-3xl">🐶</span>
            <div>
              <p className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>{totalChiens}</p>
              <p className="text-gray-500 text-sm">Chiens enregistrés</p>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm flex items-center gap-4">
            <span className="text-3xl">👤</span>
            <div>
              <p className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>{totalClients}</p>
              <p className="text-gray-500 text-sm">Clients actifs</p>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm flex items-center gap-4">
            <span className="text-3xl">🏠</span>
            <div>
              <p className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>12</p>
              <p className="text-gray-500 text-sm">Boxes disponibles</p>
            </div>
          </div>
        </div>

        {/* Accès rapides */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { href: "/checkin", label: "✅ Check-in / Check-out", desc: "Gérer les arrivées et départs" },
            { href: "/planning", label: "🏠 Planning des boxes", desc: "Vue semaine et mois" },
            { href: "/reservations/nouvelle", label: "📅 Nouvelle réservation", desc: "Créer une réservation admin" },
            { href: "/clients/nouveau", label: "👤 Nouveau client", desc: "Ajouter un client" },
          ].map(({ href, label, desc }) => (
            <Link key={href} href={href}
              className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition text-left"
              style={{ borderLeft: "4px solid #4AAEA0" }}>
              <p className="font-bold" style={{ color: "#1B2B5E" }}>{label}</p>
              <p className="text-gray-400 text-xs mt-1">{desc}</p>
            </Link>
          ))}
        </div>

      </div>
    </main>
  );
}