import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import { aujourdhuiISO, formatHeure } from "@/src/lib/dates";
import CarteReservationAttente from "@/app/components/CarteReservationAttente";
import BoutonsCheckinDashboard from "@/app/components/BoutonsCheckinDashboard";

export default async function Home() {
  // Garde personnalisée — exigerPersonnelPage() ne peut pas être utilisé ici
  // car il redirige les non-personnels vers "/" ce qui crée une boucle infinie.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!["admin", "employe"].includes(profile?.role ?? "")) redirect("/mon-compte");

  const perms = await getProfilePerms();
  const aujourd_hui = aujourdhuiISO();

  const [
    { count: totalChiens },
    { count: totalClients },
    { count: reservationsAttente },
    { data: dernieresReservations },
    { data: arrivees },
    { data: departs },
  ] = await Promise.all([
    supabaseAdmin.from("chiens").select("*", { count: "exact", head: true }).eq("actif", true),
    supabaseAdmin.from("clients").select("*", { count: "exact", head: true }).eq("actif", true),
    supabaseAdmin.from("reservations").select("*", { count: "exact", head: true }).eq("statut", "en_attente"),
    supabaseAdmin.from("reservations")
      .select(`*, clients (prenom, nom), reservation_chiens (chiens (nom))`)
      .eq("statut", "en_attente")
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin.from("checkin_checkout")
      .select(`
        id, statut, reservation_id,
        reservations (
          id, type_reservation, heure_arrivee,
          clients (prenom, nom),
          reservation_chiens (chiens (id, nom))
        )
      `)
      .in("statut", ["attendu", "arrive"])
      .gte("date_arrivee_prevue", `${aujourd_hui}T00:00:00Z`)
      .lte("date_arrivee_prevue", `${aujourd_hui}T23:59:59Z`),
    supabaseAdmin.from("checkin_checkout")
      .select(`
        id, statut, reservation_id,
        reservations (
          id, type_reservation, heure_depart,
          clients (prenom, nom),
          reservation_chiens (chiens (id, nom))
        )
      `)
      .in("statut", ["arrive", "a_recuperer", "parti"])
      .gte("date_depart_prevu", `${aujourd_hui}T00:00:00Z`)
      .lte("date_depart_prevu", `${aujourd_hui}T23:59:59Z`),
  ]);

  const accesRapides = [
    perms.perm_checkin && { href: "/checkin", label: "✅ Check-in / Check-out", desc: "Gérer les arrivées et départs" },
    perms.perm_box && { href: "/planning", label: "🏠 Planning des boxes", desc: "Vue semaine et mois" },
    perms.perm_reservations_creer && { href: "/reservations/nouvelle", label: "📅 Nouvelle réservation", desc: "Créer une réservation admin" },
    perms.perm_clients_creer && { href: "/clients/nouveau", label: "👤 Nouveau client", desc: "Ajouter un client" },
  ].filter(Boolean) as { href: string; label: string; desc: string }[];

  const carte = "bg-white rounded-2xl p-6 shadow-sm";
  const hairline = { border: "1px solid rgba(27,43,94,.06)" };
  const titreSection = { color: "#1B2B5E", fontFamily: "Georgia, serif" };
  const muted = { color: "rgba(27,43,94,.55)" };

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold" style={{ color: "#1B2B5E", fontFamily: "Georgia, serif" }}>
            Tableau de bord
          </h1>
          <p className="mt-1" style={muted}>
            {new Date().toLocaleDateString("fr-CH", {
              weekday: "long", day: "numeric", month: "long", year: "numeric"
            })}
          </p>
        </div>

        {/* Réservations en attente */}
        <div className={`${carte} mb-6`} style={hairline}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold" style={titreSection}>
              ⏳ Réservations en attente de validation
              {reservationsAttente ? (
                <span className="ml-2 px-2 py-0.5 rounded-full text-sm font-bold"
                  style={{ background: "#FBF3DC", color: "#8A6D1F" }}>
                  {reservationsAttente}
                </span>
              ) : null}
            </h2>
            <Link href="/reservations" className="text-sm font-semibold" style={{ color: "#2E8B7E" }}>
              Voir tout →
            </Link>
          </div>
          {dernieresReservations?.length === 0 && (
            <p style={{ color: "rgba(27,43,94,.5)", fontSize: 14 }}>Aucune réservation en attente. ✅</p>
          )}
          <div className="space-y-3">
            {dernieresReservations?.map((res: any) => (
              <CarteReservationAttente key={res.id} res={res} />
            ))}
          </div>
        </div>

        {/* Arrivées et départs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

          <div className={carte} style={hairline}>
            <h2 className="text-xl font-bold mb-4" style={titreSection}>
              🐾 Arrivées aujourd&apos;hui
              <span className="ml-2 px-2 py-0.5 rounded-full text-sm font-bold"
                style={{ background: "#DEF1EC", color: "#1F6E5B" }}>
                {arrivees?.length ?? 0}
              </span>
            </h2>
            {arrivees?.length === 0 && (
              <p style={{ color: "rgba(27,43,94,.5)", fontSize: 14 }}>Aucune arrivée prévue.</p>
            )}
            <div className="space-y-3">
              {arrivees?.map((cc: any) => {
                const chiens = cc.reservations?.reservation_chiens?.map((rc: any) => rc.chiens).filter(Boolean) ?? [];
                return (
                  <div key={cc.id} className="rounded-xl p-3 flex justify-between items-center"
                    style={{ border: "1px solid rgba(27,43,94,.08)" }}>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "#1B2B5E" }}>
                        {chiens.map((c: any) => c.nom).join(", ") || "—"}
                      </p>
                      <p className="text-xs" style={muted}>
                        {cc.reservations?.clients?.prenom} {cc.reservations?.clients?.nom}
                        {cc.reservations?.heure_arrivee && ` · ${formatHeure(cc.reservations.heure_arrivee)}`}
                      </p>
                    </div>
                    {perms.perm_checkin && (
                      <BoutonsCheckinDashboard checkin_id={cc.id} statut={cc.statut} type="arrivee" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className={carte} style={hairline}>
            <h2 className="text-xl font-bold mb-4" style={titreSection}>
              🏠 Départs aujourd&apos;hui
              <span className="ml-2 px-2 py-0.5 rounded-full text-sm font-bold"
                style={{ background: "#FBE7E4", color: "#B5564C" }}>
                {departs?.length ?? 0}
              </span>
            </h2>
            {departs?.length === 0 && (
              <p style={{ color: "rgba(27,43,94,.5)", fontSize: 14 }}>Aucun départ prévu.</p>
            )}
            <div className="space-y-3">
              {departs?.map((cc: any) => {
                const chiens = cc.reservations?.reservation_chiens?.map((rc: any) => rc.chiens).filter(Boolean) ?? [];
                return (
                  <div key={cc.id} className="rounded-xl p-3 flex justify-between items-center"
                    style={{ border: "1px solid rgba(27,43,94,.08)" }}>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "#1B2B5E" }}>
                        {chiens.map((c: any) => c.nom).join(", ") || "—"}
                      </p>
                      <p className="text-xs" style={muted}>
                        {cc.reservations?.clients?.prenom} {cc.reservations?.clients?.nom}
                        {cc.reservations?.heure_depart && ` · ${formatHeure(cc.reservations.heure_depart)}`}
                      </p>
                    </div>
                    {perms.perm_checkin && (
                      <BoutonsCheckinDashboard checkin_id={cc.id} statut={cc.statut} type="depart" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Stats globales */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div className={`${carte.replace("p-6", "p-5")} flex items-center gap-4`} style={hairline}>
            <span className="text-3xl">🐶</span>
            <div>
              <p className="text-2xl font-bold" style={{ color: "#1B2B5E", fontFamily: "Georgia, serif" }}>{totalChiens}</p>
              <p className="text-sm" style={muted}>Chiens enregistrés</p>
            </div>
          </div>
          <div className={`${carte.replace("p-6", "p-5")} flex items-center gap-4`} style={hairline}>
            <span className="text-3xl">👤</span>
            <div>
              <p className="text-2xl font-bold" style={{ color: "#1B2B5E", fontFamily: "Georgia, serif" }}>{totalClients}</p>
              <p className="text-sm" style={muted}>Clients actifs</p>
            </div>
          </div>
          <div className={`${carte.replace("p-6", "p-5")} flex items-center gap-4`} style={hairline}>
            <span className="text-3xl">🏠</span>
            <div>
              <p className="text-2xl font-bold" style={{ color: "#1B2B5E", fontFamily: "Georgia, serif" }}>12</p>
              <p className="text-sm" style={muted}>Boxes disponibles</p>
            </div>
          </div>
        </div>

        {/* Accès rapides — conditionné par les permissions */}
        {accesRapides.length > 0 && (
          <div className="hidden md:grid grid-cols-2 md:grid-cols-4 gap-4">
            {accesRapides.map(({ href, label, desc }) => (
              <Link key={href} href={href}
                className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition text-left"
                style={{ borderLeft: "4px solid #2E8B7E" }}>
                <p className="font-bold" style={{ color: "#1B2B5E" }}>{label}</p>
                <p className="text-xs mt-1" style={{ color: "rgba(27,43,94,.45)" }}>{desc}</p>
              </Link>
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
