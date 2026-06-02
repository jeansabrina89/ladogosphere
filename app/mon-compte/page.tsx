import { createSupabaseServerClient } from "../../src/lib/supabase-server";
import { supabase } from "../../src/lib/supabase";
import Link from "next/link";

export default async function MonComptePage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();

  if (!user) return null;

  const { data: client } = await supabase
    .from("clients")
    .select(`*, chiens (id, nom, race, poids, categorie_poids)`)
    .eq("auth_user_id", user.id)
    .single();

  const { data: reservations } = client ? await supabase
    .from("reservations")
    .select(`*, boxes (numero), reservation_chiens (chiens (nom))`)
    .eq("client_id", client.id)
    .order("date_debut", { ascending: false })
    .limit(5) : { data: [] };

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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-xl p-6 shadow-sm text-center">
                <p className="text-3xl font-bold" style={{ color: "#4AAEA0" }}>
                  {client.chiens?.length ?? 0}
                </p>
                <p className="text-gray-500 text-sm mt-1">Chien(s) enregistré(s)</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm text-center">
                <p className="text-3xl font-bold" style={{ color: "#4AAEA0" }}>
                  {reservations?.length ?? 0}
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
              <div className="space-y-3">
                {client.chiens?.map((chien: any) => (
                  <Link key={chien.id} href={`/mon-compte/chiens/${chien.id}`}
                    className="flex justify-between items-center border rounded-xl p-4 hover:bg-slate-50">
                    <div>
                      <p className="font-bold" style={{ color: "#1B2B5E" }}>{chien.nom}</p>
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
                  </Link>
                ))}
              </div>
            </div>

            {/* Mes réservations */}
            <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold" style={{ color: "#1B2B5E" }}>📅 Mes réservations</h2>
                <Link href="/mon-compte/reservations/nouvelle"
                  className="text-sm px-4 py-2 rounded-lg font-semibold text-white"
                  style={{ backgroundColor: "#4AAEA0" }}>
                  ➕ Nouvelle demande
                </Link>
              </div>
              {reservations?.length === 0 && (
                <p className="text-gray-400">Aucune réservation.</p>
              )}
              <div className="space-y-3">
                {reservations?.map((res: any) => {
                  const chiens = res.reservation_chiens?.map((rc: any) => rc.chiens?.nom).filter(Boolean) ?? [];
                  return (
                    <div key={res.id} className="border rounded-xl p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold" style={{ color: "#1B2B5E" }}>
                            {chiens.join(", ") || "—"}
                          </p>
                          <p className="text-sm text-gray-500">
                            {res.date_debut} → {res.date_fin}
                          </p>
                          <p className="text-sm text-gray-500">
                            Box {res.boxes?.numero ?? "—"} · {res.type_reservation === "journee" ? "Journée" : "Séjour"}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          res.statut === "validee" ? "bg-green-100 text-green-700" :
                          res.statut === "en_attente" ? "bg-yellow-100 text-yellow-700" :
                          res.statut === "annulee" ? "bg-red-100 text-red-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>
                          {res.statut === "validee" ? "✅ Validée" :
                           res.statut === "en_attente" ? "⏳ En attente" :
                           res.statut === "annulee" ? "❌ Annulée" : res.statut}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Link href="/mon-compte/reservations"
                className="block text-center text-sm mt-4 font-semibold"
                style={{ color: "#4AAEA0" }}>
                Voir toutes mes réservations →
              </Link>
            </div>

            {/* Mon profil */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold" style={{ color: "#1B2B5E" }}>👤 Mon profil</h2>
                <Link href="/mon-compte/profil"
                  className="text-sm px-4 py-2 rounded-lg font-semibold text-white"
                  style={{ backgroundColor: "#4AAEA0" }}>
                  ✏️ Modifier
                </Link>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <p><strong>Email :</strong> {client.email}</p>
                <p><strong>Téléphone :</strong> {client.telephone || "—"}</p>
                <p><strong>Adresse :</strong> {client.adresse || "—"}</p>
              </div>
            </div>
          </>
        )}

      </div>
    </main>
  );
}