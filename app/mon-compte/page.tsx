import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { createClient } from "@/src/utils/supabase/server";
import Link from "next/link";
import { formatDateFR, formatHeure, aujourdhuiISO } from "@/src/lib/dates";
import { formatBoxLabel } from "@/src/lib/boxes";
import { getSoldeAvoir } from "@/src/lib/avoirs";

export default async function MonComptePage() {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  const { data: client } = await supabase
    .from("clients")
    .select(`*, chiens (id, nom, race, poids, categorie_poids, sexe, sterilise)`)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const aujourd_hui = aujourdhuiISO();

  const { data: reservations } = client ? await supabase
    .from("reservations")
    .select(`*, boxes (numero, nom), reservation_chiens (chiens (nom))`)
    .eq("client_id", client.id)
    .order("date_debut", { ascending: true }) : { data: [] };

  const resAttente = reservations?.filter(r => r.statut === "en_attente") ?? [];
  const resFutures = reservations?.filter(r => r.statut === "validee" && r.date_debut > aujourd_hui) ?? [];
  // « En attente de paiement » = réservation payable (validée par l'admin, ou séjour terminé)
  // dont il reste un montant à régler. On exclut volontairement en_attente, refusee et annulee.
  const resImpayees = reservations?.filter(r => {
    const estPayable = r.statut === "validee" || r.statut === "terminee";
    const nonRegle = !r.statut_paiement || r.statut_paiement === "impaye" || r.statut_paiement === "partiel";
    const restant = Number(r.montant_final ?? 0) - Number(r.montant_paye ?? 0);
    return estPayable && nonRegle && restant > 0;
  }) ?? [];

  // Client sans profil complet (prénom/nom vides)
  const profilIncomplet = !client || (!client.prenom && !client.nom);

  const soldeAvoir = client ? await getSoldeAvoir(supabase, client.id) : 0;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">

        <h1 className="text-4xl font-bold mb-2" style={{ color: "#1B2B5E" }}>
          Bonjour {client?.prenom || "!"} 👋
        </h1>
        <p className="text-gray-500 mb-8">Bienvenue dans votre espace client</p>

        {profilIncomplet && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
            <p className="font-semibold text-blue-800 mb-1">
              👋 Bienvenue à La Dogosphère !
            </p>
            <p className="text-blue-700 text-sm mb-3">
              Votre profil est en cours de validation par notre équipe. En attendant, vous pouvez déjà compléter votre profil, ajouter vos chiens et faire une demande de journée d'essai.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Link href="/mon-compte/profil"
                className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition text-center"
                style={{ borderTop: "3px solid #4AAEA0" }}>
                <p className="font-bold text-sm" style={{ color: "#1B2B5E" }}>👤 Compléter mon profil</p>
              </Link>
              <Link href="/mon-compte/chiens/nouveau"
                className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition text-center"
                style={{ borderTop: "3px solid #C9A84C" }}>
                <p className="font-bold text-sm" style={{ color: "#1B2B5E" }}>🐶 Ajouter un chien</p>
              </Link>
              <Link href="/mon-compte/reservations/nouvelle"
                className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition text-center"
                style={{ borderTop: "3px solid #E8847A" }}>
                <p className="font-bold text-sm" style={{ color: "#1B2B5E" }}>🧪 Journée d'essai</p>
              </Link>
            </div>
          </div>
        )}

        {client && (
          <>
            {/* Statut membre */}
            {!profilIncomplet && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-white rounded-xl p-6 shadow-sm text-center">
                  <p className="text-3xl font-bold" style={{ color: "#4AAEA0" }}>
                    {client.chiens?.length ?? 0}
                  </p>
                  <p className="text-gray-500 text-sm mt-1">Chien(s) enregistré(s)</p>
                </div>
                <div className="bg-white rounded-xl p-6 shadow-sm text-center">
                  <p className="text-3xl font-bold" style={{ color: "#4AAEA0" }}>
                    {reservations?.filter(r => r.statut !== "annulee" && r.statut !== "refusee").length ?? 0}
                  </p>
                  <p className="text-gray-500 text-sm mt-1">Réservation(s)</p>
                </div>
                <div className="bg-white rounded-xl p-6 shadow-sm text-center">
                  <p className="text-2xl font-bold" style={{ color: client.membre ? "#4AAEA0" : "#6B7280" }}>
                    {client.membre ? "⭐ Membre" : "Standard"}
                  </p>
                  <p className="text-gray-500 text-sm mt-1">Statut</p>
                </div>
              </div>
            )}

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

            {/* Avoir */}
            {!profilIncomplet && soldeAvoir !== 0 && (
              <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold" style={{ color: "#1B2B5E" }}>👛 Mon avoir</h2>
                  <p className="text-2xl font-bold" style={{ color: soldeAvoir < 0 ? "#DC2626" : "#4AAEA0" }}>
                    CHF {soldeAvoir.toFixed(2)}
                  </p>
                </div>
                {soldeAvoir > 0 && (
                  <p className="text-sm text-gray-500 mt-2">
                    Le détail de vos avoirs figure sur les réservations concernées.
                  </p>
                )}
              </div>
            )}

            {/* Réservations en attente */}
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
                          📅 {formatDateFR(res.date_debut)} → {formatDateFR(res.date_fin)}
                        </p>
                        <p className="text-sm text-gray-500">
                          {res.type_reservation === "essai" ? "🧪 Journée d'essai" :
                           res.type_reservation === "journee" ? "Journée" : "Séjour"}
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
                          📅 {formatDateFR(res.date_debut)} → {formatDateFR(res.date_fin)}
                        </p>
                        <p className="text-sm text-gray-500">
                          🏠 {formatBoxLabel(res.boxes)} · {res.type_reservation === "journee" ? "Journée" : "Séjour"}
                        </p>
                        {res.heure_arrivee && (
                          <p className="text-sm text-gray-500">🕐 Arrivée : {formatHeure(res.heure_arrivee)}</p>
                        )}
                        <p className="text-xs text-green-700 font-semibold mt-1">✅ Confirmée</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Réservations impayées */}
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
                    const total = Number(res.montant_final ?? 0);
                    const paye = Number(res.montant_paye ?? 0);
                    const restant = total - paye;
                    return (
                      <Link
                        key={res.id}
                        href={`/mon-compte/reservations/${res.id}`}
                        className="block border border-red-200 rounded-xl p-4 bg-red-50 hover:shadow-md hover:border-red-300 transition"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold" style={{ color: "#1B2B5E" }}>
                              🐶 {chiens.join(", ") || "—"}
                            </p>
                            <p className="text-sm text-gray-500">
                              📅 {formatDateFR(res.date_debut)} → {formatDateFR(res.date_fin)}
                            </p>
                          </div>
                          <div className="text-right">
                            {total > 0 && (
                              <p className="font-bold" style={{ color: "#1B2B5E" }}>
                                {total} CHF
                              </p>
                            )}
                            {res.statut_paiement === "partiel" && restant > 0 && (
                              <p className="text-xs text-gray-500">Restant : {restant} CHF</p>
                            )}
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                              {res.statut_paiement === "partiel" ? "⚠️ Partiel" : "❌ Impayé"}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs font-semibold mt-2 text-right" style={{ color: "#E8847A" }}>
                          Régler cette réservation →
                        </p>
                      </Link>
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