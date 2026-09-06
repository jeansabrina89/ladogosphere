import { exigerPersonnelPage } from "@/src/lib/exigerPersonnelPage";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import { aujourdhuiISO, formatDateFR, formatHeure } from "@/src/lib/dates";
import BoutonsCheckinDashboard from "@/app/components/BoutonsCheckinDashboard";
import NavDatesChiensDuJour from "./NavDatesChiensDuJour";
import NomClientLien from "@/app/components/NomClientLien";
import NomChienLien from "@/app/components/NomChienLien";
import BadgePhotos from "@/app/components/BadgePhotos";

const TYPE_LABELS: Record<string, string> = {
  journee: "Journée",
  sejour: "Séjour",
  essai: "Journée d'essai",
};

const SELECT = `
  id, statut, date_arrivee_prevue, date_depart_prevu, date_arrivee_reelle,
  reservations ( type_reservation, heure_arrivee, heure_depart, clients (id, prenom, nom, photos_ok) ),
  chiens ( id, nom )
` as const;

function badge(statut: string) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    attendu: { label: "⏳ Attendu", bg: "#FBF3DC", color: "#8A6D1F" },
    arrive: { label: "🟢 Présent", bg: "#DEF1EC", color: "#1F6E5B" },
    a_recuperer: { label: "🟡 À récupérer", bg: "#FBF3DC", color: "#8A6D1F" },
    parti: { label: "✅ Parti", bg: "#ECECEC", color: "#6B7280" },
  };
  const b = map[statut] ?? { label: statut, bg: "#ECECEC", color: "#6B7280" };
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
      style={{ background: b.bg, color: b.color }}>
      {b.label}
    </span>
  );
}

export default async function ChiensDuJourPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await exigerPersonnelPage();
  const perms = await getProfilePerms();
  const params = await searchParams;
  const aujourd_hui = aujourdhuiISO();
  const jour = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : aujourd_hui;
  const estAujourdhui = jour === aujourd_hui;

  const debutJour = `${jour}T00:00:00Z`;
  const finJour = `${jour}T23:59:59Z`;

  const label = new Date(`${jour}T12:00:00`).toLocaleDateString("fr-CH", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const [
    { data: arrivees },
    { data: presents },
    { data: departs },
  ] = await Promise.all([
    supabaseAdmin.from("checkin_checkout").select(SELECT)
      .gte("date_arrivee_prevue", debutJour)
      .lte("date_arrivee_prevue", finJour)
      .order("date_arrivee_prevue", { ascending: true }),
    supabaseAdmin.from("checkin_checkout").select(SELECT)
      .lt("date_arrivee_prevue", debutJour)
      .gt("date_depart_prevu", finJour)
      .order("date_depart_prevu", { ascending: true }),
    supabaseAdmin.from("checkin_checkout").select(SELECT)
      .gte("date_depart_prevu", debutJour)
      .lte("date_depart_prevu", finJour)
      .order("date_depart_prevu", { ascending: true }),
  ]);

  const peutPointer = estAujourdhui && perms.perm_checkin;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">

        <h1 className="text-4xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
          🐾 Chiens du jour
        </h1>

        <NavDatesChiensDuJour
          date={jour}
          label={label}
          aujourdhui={aujourd_hui}
          estAujourdhui={estAujourdhui}
        />

        <div className="space-y-6">

          {/* A — Arrivées */}
          <section className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
              🐾 Arrivées
              <span className="ml-2 px-2 py-0.5 rounded-full text-sm font-bold bg-green-100 text-green-700">
                {arrivees?.length ?? 0}
              </span>
            </h2>
            {!arrivees?.length ? (
              <p className="text-gray-400 text-sm">Aucune arrivée ce jour-là.</p>
            ) : (
              <div className="space-y-3">
                {arrivees.map((cc: any) => {
                  const heure = formatHeure(cc.reservations?.heure_arrivee);
                  return (
                    <div key={cc.id} className="border rounded-xl p-4 flex justify-between items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold" style={{ color: "#1B2B5E" }}><NomChienLien id={cc.chiens?.id} nom={cc.chiens?.nom} /></p>
                          {badge(cc.statut)}
                          <BadgePhotos photos_ok={cc.reservations?.clients?.photos_ok} taille="petite" />
                        </div>
                        <p className="text-sm text-gray-500 truncate">
                          <NomClientLien id={cc.reservations?.clients?.id} prenom={cc.reservations?.clients?.prenom} nom={cc.reservations?.clients?.nom} />
                          {cc.reservations?.type_reservation && ` · ${TYPE_LABELS[cc.reservations.type_reservation] ?? cc.reservations.type_reservation}`}
                          {heure && ` · ${heure}`}
                        </p>
                      </div>
                      {peutPointer && (
                        <BoutonsCheckinDashboard checkin_id={cc.id} statut={cc.statut} type="arrivee" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* B — En séjour */}
          <section className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
              🏠 En séjour
              <span className="ml-2 px-2 py-0.5 rounded-full text-sm font-bold bg-blue-100 text-blue-700">
                {presents?.length ?? 0}
              </span>
            </h2>
            {!presents?.length ? (
              <p className="text-gray-400 text-sm">Aucun chien en séjour ce jour-là.</p>
            ) : (
              <div className="space-y-3">
                {presents.map((cc: any) => {
                  const arriveLe = cc.date_arrivee_reelle ? formatDateFR(cc.date_arrivee_reelle) : "";
                  const departPrevu = cc.date_depart_prevu ? formatDateFR(cc.date_depart_prevu) : "";
                  const heureDep = formatHeure(cc.reservations?.heure_depart);
                  return (
                    <div key={cc.id} className="border rounded-xl p-4 flex justify-between items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold" style={{ color: "#1B2B5E" }}><NomChienLien id={cc.chiens?.id} nom={cc.chiens?.nom} /></p>
                          {badge(cc.statut)}
                          <BadgePhotos photos_ok={cc.reservations?.clients?.photos_ok} taille="petite" />
                        </div>
                        <p className="text-sm text-gray-500 truncate">
                          <NomClientLien id={cc.reservations?.clients?.id} prenom={cc.reservations?.clients?.prenom} nom={cc.reservations?.clients?.nom} />
                          {cc.reservations?.type_reservation && ` · ${TYPE_LABELS[cc.reservations.type_reservation] ?? cc.reservations.type_reservation}`}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {arriveLe && `Arrivé le ${arriveLe}`}
                          {departPrevu && ` · Départ prévu le ${departPrevu}`}
                          {heureDep && ` à ${heureDep}`}
                        </p>
                      </div>
                      {peutPointer && (
                        <BoutonsCheckinDashboard checkin_id={cc.id} statut={cc.statut} type="depart" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* C — Départs */}
          <section className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
              🚪 Départs
              <span className="ml-2 px-2 py-0.5 rounded-full text-sm font-bold bg-rose-100 text-rose-700">
                {departs?.length ?? 0}
              </span>
            </h2>
            {!departs?.length ? (
              <p className="text-gray-400 text-sm">Aucun départ ce jour-là.</p>
            ) : (
              <div className="space-y-3">
                {departs.map((cc: any) => {
                  const heure = formatHeure(cc.reservations?.heure_depart);
                  return (
                    <div key={cc.id} className="border rounded-xl p-4 flex justify-between items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold" style={{ color: "#1B2B5E" }}><NomChienLien id={cc.chiens?.id} nom={cc.chiens?.nom} /></p>
                          {badge(cc.statut)}
                          <BadgePhotos photos_ok={cc.reservations?.clients?.photos_ok} taille="petite" />
                        </div>
                        <p className="text-sm text-gray-500 truncate">
                          <NomClientLien id={cc.reservations?.clients?.id} prenom={cc.reservations?.clients?.prenom} nom={cc.reservations?.clients?.nom} />
                          {cc.reservations?.type_reservation && ` · ${TYPE_LABELS[cc.reservations.type_reservation] ?? cc.reservations.type_reservation}`}
                          {heure && ` · ${heure}`}
                        </p>
                      </div>
                      {peutPointer && (
                        <BoutonsCheckinDashboard checkin_id={cc.id} statut={cc.statut} type="depart" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      </div>
    </main>
  );
}
