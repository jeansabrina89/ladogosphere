import { exigerPersonnelPage } from "../../src/lib/exigerPersonnelPage";
import { supabaseAdmin } from "../../src/lib/supabase-admin";
import { getProfilePerms } from "../../src/lib/getProfilePerms";
import { aujourdhuiISO, formatDateFR, formatHeure } from "../../src/lib/dates";
import BoutonsCheckinDashboard from "../components/BoutonsCheckinDashboard";

const TYPE_LABELS: Record<string, string> = {
  journee: "Journée",
  sejour: "Séjour",
  essai: "Journée d'essai",
};

const SELECT = `
  id, statut, date_arrivee_prevue, date_depart_prevu, date_arrivee_reelle,
  reservations ( type_reservation, heure_arrivee, heure_depart, clients (prenom, nom) ),
  chiens ( id, nom )
` as const;

export default async function ChiensDuJourPage() {
  await exigerPersonnelPage();
  const perms = await getProfilePerms();
  const aujourd_hui = aujourdhuiISO();

  const [
    { data: arrivees },
    { data: presents },
    { data: departs },
  ] = await Promise.all([
    // A) Arrivent aujourd'hui (validées ou non)
    supabaseAdmin.from("checkin_checkout")
      .select(SELECT)
      .in("statut", ["attendu", "arrive"])
      .gte("date_arrivee_prevue", `${aujourd_hui}T00:00:00Z`)
      .lte("date_arrivee_prevue", `${aujourd_hui}T23:59:59Z`),
    // B) Déjà là — tous statuts "arrive"/"a_recuperer" sans filtre de date (séjours multi-jours)
    supabaseAdmin.from("checkin_checkout")
      .select(SELECT)
      .in("statut", ["arrive", "a_recuperer"]),
    // C) Partent aujourd'hui
    supabaseAdmin.from("checkin_checkout")
      .select(SELECT)
      .in("statut", ["arrive", "a_recuperer", "parti"])
      .gte("date_depart_prevu", `${aujourd_hui}T00:00:00Z`)
      .lte("date_depart_prevu", `${aujourd_hui}T23:59:59Z`),
  ]);

  // Exclure du groupe B les chiens qui partent aujourd'hui (ils sont dans le groupe C)
  const presentsAujourdhui = (presents ?? []).filter(
    cc => !cc.date_depart_prevu?.startsWith(aujourd_hui)
  );

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">

        <div className="mb-6">
          <h1 className="text-4xl font-bold" style={{ color: "#1B2B5E" }}>
            🐾 Chiens du jour
          </h1>
          <p className="text-gray-500 mt-1">
            {new Date().toLocaleDateString("fr-CH", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
            })}
          </p>
        </div>

        <div className="space-y-6">

          {/* A — Arrivent aujourd'hui */}
          <section className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
              🐾 Arrivent aujourd&apos;hui
              <span className="ml-2 px-2 py-0.5 rounded-full text-sm font-bold bg-green-100 text-green-700">
                {arrivees?.length ?? 0}
              </span>
            </h2>
            {!arrivees?.length ? (
              <p className="text-gray-400 text-sm">Aucune arrivée prévue aujourd&apos;hui.</p>
            ) : (
              <div className="space-y-3">
                {arrivees.map((cc: any) => {
                  const chien = cc.chiens;
                  const res = cc.reservations;
                  const heure = formatHeure(res?.heure_arrivee);
                  return (
                    <div key={cc.id}
                      className="border rounded-xl p-4 flex justify-between items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold" style={{ color: "#1B2B5E" }}>
                            {chien?.nom || "—"}
                          </p>
                          {cc.statut === "arrive" && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-700">
                              ✅ Arrivé
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 truncate">
                          {res?.clients?.prenom} {res?.clients?.nom}
                          {res?.type_reservation && ` · ${TYPE_LABELS[res.type_reservation] ?? res.type_reservation}`}
                          {heure && ` · ${heure}`}
                        </p>
                      </div>
                      {perms.perm_checkin && (
                        <BoutonsCheckinDashboard
                          checkin_id={cc.id}
                          statut={cc.statut}
                          type="arrivee"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* B — Déjà là */}
          <section className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
              🏠 Déjà là
              <span className="ml-2 px-2 py-0.5 rounded-full text-sm font-bold bg-blue-100 text-blue-700">
                {presentsAujourdhui.length}
              </span>
            </h2>
            {!presentsAujourdhui.length ? (
              <p className="text-gray-400 text-sm">Aucun chien en séjour (hors départs du jour).</p>
            ) : (
              <div className="space-y-3">
                {presentsAujourdhui.map((cc: any) => {
                  const chien = cc.chiens;
                  const res = cc.reservations;
                  const arriveLe = formatDateFR(cc.date_arrivee_reelle);
                  const departPrevu = formatDateFR(cc.date_depart_prevu);
                  const heureDep = formatHeure(res?.heure_depart);
                  return (
                    <div key={cc.id}
                      className="border rounded-xl p-4 flex justify-between items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold" style={{ color: "#1B2B5E" }}>
                          {chien?.nom || "—"}
                        </p>
                        <p className="text-sm text-gray-500 truncate">
                          {res?.clients?.prenom} {res?.clients?.nom}
                          {res?.type_reservation && ` · ${TYPE_LABELS[res.type_reservation] ?? res.type_reservation}`}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {arriveLe && `Arrivé le ${arriveLe}`}
                          {departPrevu && ` · Départ prévu le ${departPrevu}`}
                          {heureDep && ` à ${heureDep}`}
                        </p>
                      </div>
                      {perms.perm_checkin && (
                        <BoutonsCheckinDashboard
                          checkin_id={cc.id}
                          statut={cc.statut}
                          type="depart"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* C — Partent aujourd'hui */}
          <section className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
              🚪 Partent aujourd&apos;hui
              <span className="ml-2 px-2 py-0.5 rounded-full text-sm font-bold bg-rose-100 text-rose-700">
                {departs?.length ?? 0}
              </span>
            </h2>
            {!departs?.length ? (
              <p className="text-gray-400 text-sm">Aucun départ prévu aujourd&apos;hui.</p>
            ) : (
              <div className="space-y-3">
                {departs.map((cc: any) => {
                  const chien = cc.chiens;
                  const res = cc.reservations;
                  const heure = formatHeure(res?.heure_depart);
                  return (
                    <div key={cc.id}
                      className="border rounded-xl p-4 flex justify-between items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold" style={{ color: "#1B2B5E" }}>
                            {chien?.nom || "—"}
                          </p>
                          {cc.statut === "parti" && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-600">
                              ✔️ Parti
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 truncate">
                          {res?.clients?.prenom} {res?.clients?.nom}
                          {res?.type_reservation && ` · ${TYPE_LABELS[res.type_reservation] ?? res.type_reservation}`}
                          {heure && ` · ${heure}`}
                        </p>
                      </div>
                      {perms.perm_checkin && (
                        <BoutonsCheckinDashboard
                          checkin_id={cc.id}
                          statut={cc.statut}
                          type="depart"
                        />
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
