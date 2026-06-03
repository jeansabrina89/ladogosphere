import { createSupabaseServerClient } from "../../src/lib/supabase-server";
import { supabase } from "../../src/lib/supabase";
import Link from "next/link";
import { formatDate } from "../../src/lib/dates";

export default async function MonComptePage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  const { data: client } = await supabase
    .from("clients")
    .select(`*, chiens (id, nom, race, poids, categorie_poids, sexe, sterilise)`)
    .eq("auth_user_id", user.id)
    .single();

  const { data: reservations } = client ? await supabase
    .from("reservations")
    .select(`*, boxes (numero), reservation_chiens (chiens (nom))`)
    .eq("client_id", client.id)
    .order("date_debut", { ascending: true }) : { data: [] };

  const aujourd_hui = new Date().toISOString().split("T")[0];

  const resAttente = reservations?.filter(r => r.statut === "en_attente") ?? [];
  const resFutures = reservations?.filter(r => r.statut === "validee" && r.date_debut > aujourd_hui) ?? [];
  const resImpayees = reservations?.filter(r =>
    r.statut !== "annulee" &&
    (!r.statut_paiement || r.statut_paiement === "impaye" || r.statut_paiement === "partiel")
  ) ?? [];

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">

        <h1 className="text-4xl font-bold mb-2" style={{ color: "#1B2B5E" }}>
          Bonjour {client?.prenom || "!"} 👋
        </h1>
        <p className="text-gray-500 mb-8">Bienvenue dans votre espace client</p>

        {!client && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8">
            <p className="font-semibold text-amber-800">
              ⚠️ Votre compte n'est pas encore lié à un profil client.
            </p>
            <p className="text-amber-700 text-sm mt-1">
              Contactez-nous à ladogosphere@gmail.com pour lier votre compte.
            </p>
          </div>
        )}

        {client && (
          <>
            {/* Mes chiens */}
            <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold" style={{ color: "#1B2B5E" }}>🐶 Mes chiens</h2>
                <Link href="/mon-compte/chiens/nouveau"
                  className="text-sm px-4 py-2 rounded-lg font-semibold text-white"
                  style={{ backgroundColor: "#4AAEA0" }}>
                  ➕ Ajouter
                </Link>
              </div>
              {client.chiens?.length === 0 && (
                <p className="text-gray-400">Aucun chien enregistré.</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {client.chiens?.map((chien: any) => (
                  <Link key={chien.id} href={`/mon-compte/chiens/${chien.id}`}
                    className="border rounded-xl p-4 hover:bg-slate-50 transition">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-bold" style={{ color: "#1B2B5E" }}>
                          {chien.sexe === "F" ? "♀️" : "♂️"} {chien.nom}
                        </p>
                        <p className="text-sm text-gray-500">{chien.race || "—"}</p>
                      </div>
                      <div className="text-right text-sm text-gray-500">
                        <p>{chien.poids ? `${chien.poids} kg` : "—"}</p>
                        <p>{
                          chien.categorie_poids === "moins_15kg" ? "🟢 Petit" :
                          chien.categorie_poids === "15_30kg" ? "🟡 Moyen" :
                          chien.categorie_poids === "30_40kg" ? "🔴 Grand" : "—"
                        }</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Réservations en attente de validation */}
            {resAttente.length > 0 && (
              <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
                <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
                  ⏳ En attente de confirmation
                  <span className="ml-2 px-2 py-0.5 rounded-full text-sm bg-yellow-100 text-yellow-700">
                    {resAttente.length}
                  </span>
                </h2>
                <div className="space-y-3">
                  {resAttente.map((res: any) => {
                    const chiens = res.reservation_chiens?.map((rc: any) => rc.chiens?.nom).filter(Boolean) ?? [];
                    return (
                      <div key={res.id} className="border border-yellow-200 rounded-xl p-4 bg-yellow-50">
                        <p className="font-semibold" style={{ color: "#1B2B5E" }}>
                          🐶 {chiens.join(", ") || "—"}
                        </p>
                        <p className="text-sm text-gray-500">
                          📅 {formatDate(res.date_debut)} → {formatDate(res.date_fin)}
                        </p>
                        <p className="text-sm text-gray-500">
                          {res.type_reservation === "journee" ? "Journée" : "Séjour"}
                        </p>
                        <p className="text-xs text-yellow-700 font-semibold mt-1">
                          ⏳ En attente de confirmation par notre équipe
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Réservations futures */}
            {resFutures.length > 0 && (
              <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
                <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
                  📅 Réservations à venir
                  <span className="ml-2 px-2 py-0.5 rounded-full text-sm bg-green-100 text-green-700">
                    {resFutures.length}
                  </span>
                </h2>
                <div className="space-y-3">
                  {resFutures.map((res: any) => {
                    const chiens = res.reservation_chiens?.map((rc: any) => rc.chiens?.nom).filter(Boolean) ?? [];
                    return (
                      <div key={res.id} className="border border-green-200 rounded-xl p-4 bg-green-50">
                        <p className="font-semibold" style={{ color: "#1B2B5E" }}>
                          🐶 {chiens.join(", ") || "—"}
                        </p>
                        <p className="text-sm text-gray-500">
                          📅 {formatDate(res.date_debut)} → {formatDate(res.date_fin)}
                        </p>
                        <p className="text-sm text-gray-500">
                          🏠 Box {res.boxes?.numero ?? "—"} · {res.type_reservation === "journee" ? "Journée" : "Séjour"}
                        </p>
                        {res.heure_arrivee && (
                          <p className="text-sm text-gray-500">🕐 Arrivée : {res.heure_arrivee}</p>
                        )}
                        <p className="text-xs text-green-700 font-semibold mt-1">✅ Confirmée</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Réservations en attente de paiement */}
            {resImpayees.length > 0 && (
              <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
                <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
                  💰 En attente de paiement
                  <span className="ml-2 px-2 py-0.5 rounded-full text-sm bg-red-100 text-red-700">
                    {resImpayees.length}
                  </span>
                </h2>
                <div className="space-y-3">
                  {resImpayees.map((res: any) => {
                    const chiens = res.reservation_chiens?.map((rc: any) => rc.chiens?.nom).filter(Boolean) ?? [];
                    return (
                      <div key={res.id} className="border border-red-200 rounded-xl p-4 bg-red-50">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold" style={{ color: "#1B2B5E" }}>
                              🐶 {chiens.join(", ") || "—"}
                            </p>
                            <p className="text-sm text-gray-500">
                              📅 {formatDate(res.date_debut)} → {formatDate(res.date_fin)}
                            </p>
                          </div>
                          <div className="text-right">
                            {res.montant_final && (
                              <p className="font-bold" style={{ color: "#1B2B5E" }}>
                                {res.montant_final} CHF
                              </p>
                            )}
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                              {res.statut_paiement === "partiel" ? "⚠️ Partiel" : "❌ Impayé"}
                            </span>
                          </div>
                        </div>
                        {res.statut_paiement === "partiel" && res.montant_paye && (
                          <p className="text-xs text-gray-500 mt-1">
                            Payé : {res.montant_paye} CHF · Reste : {((res.montant_final || 0) - res.montant_paye).toFixed(2)} CHF
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link href="/mon-compte/reservations/nouvelle"
                className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition text-left"
                style={{ borderLeft: "4px solid #4AAEA0" }}>
                <p className="font-bold" style={{ color: "#1B2B5E" }}>📅 Nouvelle demande</p>
                <p className="text-gray-400 text-xs mt-1">Faire une demande de réservation</p>
              </Link>
              <Link href="/mon-compte/reservations"
                className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition text-left"
                style={{ borderLeft: "4px solid #C9A84C" }}>
                <p className="font-bold" style={{ color: "#1B2B5E" }}>📋 Toutes mes réservations</p>
                <p className="text-gray-400 text-xs mt-1">Voir l'historique complet</p>
              </Link>
              <Link href="/mon-compte/profil"
                className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition text-left"
                style={{ borderLeft: "4px solid #E8847A" }}>
                <p className="font-bold" style={{ color: "#1B2B5E" }}>👤 Mon profil</p>
                <p className="text-gray-400 text-xs mt-1">Modifier mes informations</p>
              </Link>
              <Link href="/mon-compte/chiens"
                className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition text-left"
                style={{ borderLeft: "4px solid #1B2B5E" }}>
                <p className="font-bold" style={{ color: "#1B2B5E" }}>🐶 Mes chiens</p>
                <p className="text-gray-400 text-xs mt-1">Gérer les fiches de mes chiens</p>
              </Link>
            </div>

          </>
        )}

      </div>
    </main>
  );
}