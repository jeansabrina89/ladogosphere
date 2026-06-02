import { createSupabaseServerClient } from "../../../src/lib/supabase-server";
import { supabase } from "../../../src/lib/supabase";
import Link from "next/link";

export default async function MesReservationsPage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!client) return <div>Profil introuvable</div>;

  const { data: reservations } = await supabase
    .from("reservations")
    .select(`
      *,
      boxes (numero),
      reservation_chiens (chiens (nom))
    `)
    .eq("client_id", client.id)
    .order("date_debut", { ascending: false });

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold" style={{ color: "#1B2B5E" }}>
            📅 Mes réservations
          </h1>
          <Link href="/mon-compte/reservations/nouvelle"
            className="px-4 py-2 rounded-lg font-semibold text-white text-sm"
            style={{ backgroundColor: "#4AAEA0" }}>
            ➕ Nouvelle demande
          </Link>
        </div>

        <div className="space-y-4">
          {reservations?.length === 0 && (
            <p className="text-gray-400">Aucune réservation pour le moment.</p>
          )}
          {reservations?.map((res: any) => {
            const chiens = res.reservation_chiens?.map((rc: any) => rc.chiens?.nom).filter(Boolean) ?? [];
            return (
              <div key={res.id} className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-lg" style={{ color: "#1B2B5E" }}>
                      {chiens.join(", ") || "—"}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      📅 {res.date_debut} → {res.date_fin}
                    </p>
                    <p className="text-sm text-gray-500">
                      🏠 Box {res.boxes?.numero ?? "—"} · {res.type_reservation === "journee" ? "Journée" : "Séjour"}
                    </p>
                    {res.montant_final && (
                      <p className="text-sm font-semibold mt-1" style={{ color: "#4AAEA0" }}>
                        💰 {res.montant_final} CHF
                      </p>
                    )}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    res.statut === "validee" ? "bg-green-100 text-green-700" :
                    res.statut === "en_attente" ? "bg-yellow-100 text-yellow-700" :
                    res.statut === "annulee" ? "bg-red-100 text-red-700" :
                    res.statut === "terminee" ? "bg-gray-100 text-gray-600" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {res.statut === "validee" ? "✅ Validée" :
                     res.statut === "en_attente" ? "⏳ En attente de confirmation" :
                     res.statut === "annulee" ? "❌ Annulée" :
                     res.statut === "terminee" ? "🏁 Terminée" : res.statut}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6">
          <Link href="/mon-compte"
            className="text-sm font-semibold"
            style={{ color: "#4AAEA0" }}>
            ← Retour à mon compte
          </Link>
        </div>

      </div>
    </main>
  );
}