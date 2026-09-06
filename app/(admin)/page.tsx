import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import { compterReservationsPersonnelAVoir } from "@/src/lib/reservationsPersonnelAdmin";
import { aujourdhuiISO, formatHeure } from "@/src/lib/dates";
import CarteReservationAttente from "@/app/components/CarteReservationAttente";
import BoutonsCheckinDashboard from "@/app/components/BoutonsCheckinDashboard";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import BadgeStatut from "@/app/components/ui/BadgeStatut";
import EtatVide from "@/app/components/ui/EtatVide";

export default async function Home() {
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
  const nbResaPersonnel = await compterReservationsPersonnelAVoir();

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

  const h2: React.CSSProperties = { fontFamily: "Georgia, 'Times New Roman', serif", color: "#1B2B5E", fontSize: 18, fontWeight: 700, margin: "0 0 12px" };
  const pill = (bg: string, color: string): React.CSSProperties => ({ display: "inline-block", backgroundColor: bg, color, borderRadius: 999, padding: "2px 10px", fontSize: 13, fontWeight: 500, marginLeft: 8 });
  const stat = (bg: string): React.CSSProperties => ({ backgroundColor: bg, borderRadius: 16, padding: "20px 16px", textAlign: "center" });
  const statNum: React.CSSProperties = { fontSize: 24, fontWeight: 500, margin: 0, lineHeight: 1 };
  const statLbl: React.CSSProperties = { fontSize: 13, marginTop: 6, marginBottom: 0 };
  const muted: React.CSSProperties = { color: "rgba(27,43,94,0.6)", fontSize: 14, margin: 0 };

  const ligneInfo = (cc: any, type: "arrivee" | "depart", dernier: boolean) => {
    const chiens = cc.reservations?.reservation_chiens?.map((rc: any) => rc.chiens).filter(Boolean) ?? [];
    const heure = type === "arrivee" ? cc.reservations?.heure_arrivee : cc.reservations?.heure_depart;
    return (
      <div key={cc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: dernier ? "none" : "1px solid rgba(27,43,94,0.08)" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <p style={{ fontWeight: 600, color: "#1B2B5E", fontSize: 14, margin: 0 }}>
              {chiens.map((c: any) => c.nom).join(", ") || "—"}
            </p>
            <BadgeStatut statut={cc.statut} />
          </div>
          <p style={{ color: "rgba(27,43,94,0.6)", fontSize: 13, margin: "2px 0 0" }}>
            {cc.reservations?.clients?.prenom} {cc.reservations?.clients?.nom}
            {heure && ` · ${formatHeure(heure)}`}
          </p>
        </div>
        {perms.perm_checkin && (
          <div style={{ flexShrink: 0 }}>
            <BoutonsCheckinDashboard
              checkin_id={cc.id}
              statut={cc.statut}
              type={type}
              est_essai={cc.reservations?.type_reservation === "essai"}
              nom_chien={chiens.map((c: any) => c.nom).join(", ") || "ce chien"}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-6xl mx-auto">

        <EnTete
          titre="Tableau de bord"
          sousTitre={new Date().toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        />

        {/* Réservations du personnel à voir (validées d'office, pour information) */}
        {nbResaPersonnel > 0 && (
          <Link
            href="/reservations?personnel=1"
            style={{
              display: "block", textDecoration: "none",
              backgroundColor: "#F4EAC9", border: "1px solid #C9A84C", borderRadius: 14,
              padding: "12px 16px", marginBottom: 20,
              fontSize: 14, fontWeight: 600, color: "#6E5410",
            }}
          >
            ⭐ {nbResaPersonnel} réservation{nbResaPersonnel > 1 ? "s" : ""} du personnel à voir ›
          </Link>
        )}

        {/* Réservations en attente */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h2 style={h2}>
              Réservations en attente
              {reservationsAttente ? <span style={pill("#E4E7F1", "#2A3B6B")}>{reservationsAttente}</span> : null}
            </h2>
            <Bouton variante="discret" href="/reservations">Voir tout ›</Bouton>
          </div>
          {dernieresReservations?.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {dernieresReservations.map((res: any) => (
                <CarteReservationAttente key={res.id} res={res} />
              ))}
            </div>
          ) : (
            <Carte>
              <EtatVide icone="✅" titre="Aucune réservation en attente" message="Tout est à jour." />
            </Carte>
          )}
        </div>

        {/* Arrivées et départs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" style={{ marginBottom: 32 }}>
          <div>
            <h2 style={h2}>
              Arrivées aujourd&apos;hui
              <span style={pill("#DBEFEA", "#1F6E5B")}>{arrivees?.length ?? 0}</span>
            </h2>
            <Carte>
              {arrivees?.length
                ? arrivees.map((cc: any, i: number) => ligneInfo(cc, "arrivee", i === arrivees.length - 1))
                : <p style={muted}>Aucune arrivée prévue.</p>}
            </Carte>
          </div>
          <div>
            <h2 style={h2}>
              Départs aujourd&apos;hui
              <span style={pill("#FBE2DE", "#A8453A")}>{departs?.length ?? 0}</span>
            </h2>
            <Carte>
              {departs?.length
                ? departs.map((cc: any, i: number) => ligneInfo(cc, "depart", i === departs.length - 1))
                : <p style={muted}>Aucun départ prévu.</p>}
            </Carte>
          </div>
        </div>

        {/* Stats globales */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3" style={{ marginBottom: 32 }}>
          <div style={stat("#DBEFEA")}>
            <p style={{ ...statNum, color: "#1F6E5B" }}>{totalChiens}</p>
            <p style={{ ...statLbl, color: "rgba(31,110,91,0.7)" }}>Chiens enregistrés</p>
          </div>
          <div style={stat("#E4E7F1")}>
            <p style={{ ...statNum, color: "#2A3B6B" }}>{totalClients}</p>
            <p style={{ ...statLbl, color: "rgba(42,59,107,0.7)" }}>Clients actifs</p>
          </div>
          <div style={stat("#F4EAC9")}>
            <p style={{ ...statNum, color: "#6E5410" }}>12</p>
            <p style={{ ...statLbl, color: "rgba(110,84,16,0.7)" }}>Boxes disponibles</p>
          </div>
        </div>

        {/* Accès rapides */}
        {accesRapides.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <h2 style={h2}>Accès rapides</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {accesRapides.map(({ href, label, desc }) => (
              <Link key={href} href={href} style={{ textDecoration: "none" }}>
                <Carte accent="teal">
                  <p style={{ fontWeight: 700, color: "#1B2B5E", margin: 0 }}>{label}</p>
                  <p style={{ color: "rgba(27,43,94,0.55)", fontSize: 13, margin: "4px 0 0" }}>{desc}</p>
                </Carte>
              </Link>
            ))}
          </div>
          </div>
        )}

      </div>
    </main>
  );
}
