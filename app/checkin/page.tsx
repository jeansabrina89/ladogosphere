import { exigerPersonnelPage } from "../../src/lib/exigerPersonnelPage";
import { supabaseAdmin } from "../../src/lib/supabase-admin";
import { BoutonCheckin, BoutonCheckout } from "./BoutonsCheckin";
import { formatBoxLabel } from "../../src/lib/boxes";
import { aujourdhuiISO } from "../../src/lib/dates";
import { getProfilePerms } from "../../src/lib/getProfilePerms";

export default async function CheckinPage() {
  await exigerPersonnelPage();
  const perms = await getProfilePerms();
  const supabase = supabaseAdmin;
  const aujourd_hui = aujourdhuiISO();

  const { data: checkins } = await supabase
    .from("checkin_checkout")
    .select(`
      *,
      chiens (id, nom, race, poids, categorie_poids, sexe),
      reservations (
        date_debut,
        date_fin,
        type_reservation,
        boxes (numero, nom),
        clients (prenom, nom)
      )
    `)
    .gte("date_arrivee_prevue", `${aujourd_hui}T00:00:00`)
    .lte("date_arrivee_prevue", `${aujourd_hui}T23:59:59`)
    .order("date_arrivee_prevue");

  // Aussi charger les départs prévus aujourd'hui
  const { data: departs } = await supabase
    .from("checkin_checkout")
    .select(`
      *,
      chiens (id, nom, race, poids, categorie_poids, sexe),
      reservations (
        date_debut,
        date_fin,
        type_reservation,
        boxes (numero, nom),
        clients (prenom, nom)
      )
    `)
    .gte("date_depart_prevu", `${aujourd_hui}T00:00:00`)
    .lte("date_depart_prevu", `${aujourd_hui}T23:59:59`)
    .order("date_depart_prevu");

 const arrivesAttendus = checkins?.filter(c => c.statut === "attendu") ?? [];
const presents = checkins?.filter(c => c.statut === "arrive") ?? [];
const departsAttendus = departs?.filter(c => c.statut === "arrive") ?? [];
const partis = departs?.filter(c => c.statut === "parti") ?? [];

  const totalPresents = presents.length;

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-7xl mx-auto">

        <h1 className="text-4xl font-bold mb-2">✅ Check-in / Check-out</h1>
        <p className="text-gray-600 mb-2">
          {new Date().toLocaleDateString("fr-CH", {
            weekday: "long", day: "numeric", month: "long", year: "numeric"
          })}
        </p>

        {/* Résumé */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-4 shadow text-center">
            <p className="text-3xl font-bold text-yellow-500">{arrivesAttendus.length}</p>
            <p className="text-gray-600 text-sm">Arrivées attendues</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow text-center">
            <p className="text-3xl font-bold text-green-600">{presents.length}</p>
            <p className="text-gray-600 text-sm">Arrivées effectuées</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow text-center">
            <p className="text-3xl font-bold text-blue-500">{departsAttendus.length}</p>
            <p className="text-gray-600 text-sm">Départs prévus</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow text-center">
            <p className="text-3xl font-bold text-gray-500">{partis.length}</p>
            <p className="text-gray-600 text-sm">Départs effectués</p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl px-6 py-3 mb-8 font-bold text-blue-700 text-lg">
          🐶 {totalPresents} chien(s) actuellement présent(s) dans la pension
        </div>

        {/* 4 colonnes */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

          {/* Arrivées attendues */}
          <div>
            <h2 className="font-bold text-lg mb-3 text-yellow-700">
              ⏳ Arrivées attendues ({arrivesAttendus.length})
            </h2>
            <div className="space-y-3">
              {arrivesAttendus.length === 0 && (
                <p className="text-gray-400 text-sm">Aucune arrivée prévue</p>
              )}
              {arrivesAttendus.map(c => (
                <CarteCheckin key={c.id} checkin={c} action={perms.perm_checkin ? <BoutonCheckin checkin_id={c.id} /> : undefined} />
              ))}
            </div>
          </div>

          {/* Présents */}
          <div>
            <h2 className="font-bold text-lg mb-3 text-green-700">
              🟢 Présents ({presents.length})
            </h2>
            <div className="space-y-3">
              {presents.length === 0 && (
                <p className="text-gray-400 text-sm">Aucun chien présent</p>
              )}
              {presents.map(c => (
                <CarteCheckin key={c.id} checkin={c} />
              ))}
            </div>
          </div>

          {/* Départs prévus */}
          <div>
            <h2 className="font-bold text-lg mb-3 text-blue-700">
              🏁 Départs prévus ({departsAttendus.length})
            </h2>
            <div className="space-y-3">
              {departsAttendus.length === 0 && (
                <p className="text-gray-400 text-sm">Aucun départ prévu</p>
              )}
              {departsAttendus.map(c => (
                <CarteCheckin key={c.id} checkin={c} action={perms.perm_checkin ? <BoutonCheckout checkin_id={c.id} /> : undefined} />
              ))}
            </div>
          </div>

          {/* Partis */}
          <div>
            <h2 className="font-bold text-lg mb-3 text-gray-500">
              ✔️ Partis ({partis.length})
            </h2>
            <div className="space-y-3">
              {partis.length === 0 && (
                <p className="text-gray-400 text-sm">Aucun départ effectué</p>
              )}
              {partis.map(c => (
                <CarteCheckin key={c.id} checkin={c} />
              ))}
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}

function CarteCheckin({ checkin, action }: { checkin: any; action?: React.ReactNode }) {
  const chien = checkin.chiens;
  const res = checkin.reservations;

  return (
    <div className="bg-white rounded-xl p-4 shadow">
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className={`font-bold ${chien?.sexe === "F" ? "text-pink-600" : "text-blue-600"}`}>
            {chien?.nom || "—"}
          </p>
          <p className="text-sm text-gray-500">{chien?.race || "—"}</p>
          <p className="text-xs text-gray-400">
            {chien?.poids ? `${chien.poids} kg` : "—"} ·{" "}
            {chien?.categorie_poids === "moins_15kg" ? "🟢" :
             chien?.categorie_poids === "15_30kg" ? "🟡" :
             chien?.categorie_poids === "30_40kg" ? "🔴" : "—"}
          </p>
        </div>
        <div className="text-right text-xs text-gray-500">
          <p>{formatBoxLabel(res?.boxes)}</p>
          <p>{res?.clients?.prenom} {res?.clients?.nom}</p>
        </div>
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}