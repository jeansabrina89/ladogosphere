import { createSupabaseServerClient } from "../../../../src/lib/supabase-server";
import { redirect } from "next/navigation";
import { supabase } from "../../../../src/lib/supabase";
import FormTimbrage from "./FormTimbrage";

export default async function TimbrageePage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role, email").eq("id", user.id).single();
  if (!profile || !["admin", "employe"].includes(profile.role)) redirect("/");

  const { data: employe } = await supabase
.from("employes_rh").select("*").eq("email", profile?.email ?? "").single();  if (!employe) redirect("/employes/mon-espace");

  const aujourd_hui = new Date().toISOString().split("T")[0];
  const moisActuel = new Date().getMonth() + 1;
  const anneeActuelle = new Date().getFullYear();

  // Timbrage du mois
  const { data: timbrages } = await supabase
    .from("timbrage")
    .select("*")
    .eq("employe_id", employe.id)
    .gte("date", `${anneeActuelle}-${String(moisActuel).padStart(2, "0")}-01`)
    .order("date", { ascending: false });

  // Timbrage aujourd'hui
  const timbrageAujourdhui = timbrages?.find(t => t.date === aujourd_hui) ?? null;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">

        <h1 className="text-3xl font-bold mb-2" style={{ color: "#1B2B5E" }}>
          ⏱️ Timbrage
        </h1>
        <p className="text-gray-500 mb-6">
          {new Date().toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>

        {/* Formulaire timbrage aujourd'hui */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>
            📅 Aujourd'hui
          </h2>
          <FormTimbrage
            employe_id={employe.id}
            date={aujourd_hui}
            timbrage={timbrageAujourdhui}
          />
        </div>

        {/* Historique du mois */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>
            📋 Historique du mois
          </h2>
          <div className="space-y-2">
            {timbrages?.filter(t => t.date !== aujourd_hui).map((t: any) => {
              const matin = t.type_absence ? null : `${t.heure_debut_matin}–${t.heure_fin_matin}`;
              const aprem = t.type_absence ? null : `${t.heure_debut_aprem}–${t.heure_fin_aprem}`;
              const heures = t.type_absence ? null : calculerDuree(t.heure_debut_matin, t.heure_fin_matin) + calculerDuree(t.heure_debut_aprem, t.heure_fin_aprem);

              return (
                <div key={t.id} className="flex justify-between items-center border rounded-xl p-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#1B2B5E" }}>
                      {new Date(t.date + "T12:00:00").toLocaleDateString("fr-CH", { weekday: "short", day: "numeric", month: "short" })}
                    </p>
                    {t.type_absence ? (
                      <p className="text-xs text-orange-500 font-semibold capitalize">{t.type_absence}</p>
                    ) : (
                      <p className="text-xs text-gray-500">{matin} · {aprem}</p>
                    )}
                  </div>
                  <div className="text-right">
                    {heures !== null && (
                      <p className="text-sm font-bold" style={{ color: "#4AAEA0" }}>
                        {heures.toFixed(1)}h
                      </p>
                    )}
                    {t.type_absence && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700 font-semibold capitalize">
                        {t.type_absence}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {timbrages?.filter(t => t.date !== aujourd_hui).length === 0 && (
              <p className="text-gray-400 text-sm">Aucun timbrage ce mois.</p>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}

function calculerDuree(debut: string, fin: string): number {
  if (!debut || !fin) return 0;
  const [hD, mD] = debut.split(":").map(Number);
  const [hF, mF] = fin.split(":").map(Number);
  return (hF * 60 + mF - (hD * 60 + mD)) / 60;
}