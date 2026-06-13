import { createSupabaseServerClient } from "../../../../src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "../../../../src/utils/supabase/server";
import { aujourdhuiISO } from "../../../../src/lib/dates";
import { getEmployeRhActuel } from "../../../../src/lib/employeActuel";
import FormTimbrage from "./FormTimbrage";

export default async function TimbrageePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role, email").eq("id", user.id).single();
  if (!profile || !["admin", "employe"].includes(profile.role)) redirect("/");

  const employe = await getEmployeRhActuel(supabase, user.id, profile?.email);
  if (!employe) redirect("/employes/mon-espace");

  const params = await searchParams;
  const aujourd_hui = aujourdhuiISO();
  const dateSelectionnee = params.date || aujourd_hui;

  const moisActuel = new Date().getMonth() + 1;
  const anneeActuelle = new Date().getFullYear();

  // Timbrage pour la date sélectionnée
  const { data: timbrageDate } = await supabase
    .from("timbrage")
    .select("*")
    .eq("employe_id", employe.id)
    .eq("date", dateSelectionnee)
    .maybeSingle();

  // Timbrages du mois
  const { data: timbrages } = await supabase
    .from("timbrage")
    .select("*")
    .eq("employe_id", employe.id)
    .gte("date", `${anneeActuelle}-${String(moisActuel).padStart(2, "0")}-01`)
    .order("date", { ascending: false });

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">

        <h1 className="text-3xl font-bold mb-2" style={{ color: "#1B2B5E" }}>
          ⏱️ Timbrage
        </h1>

        {/* Sélecteur de date */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>
            📅 Sélectionner une date
          </h2>
          <form method="GET">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                  Date
                </label>
                <input type="date" name="date"
                  defaultValue={dateSelectionnee}
                  max={aujourd_hui}
                  className="w-full border rounded-xl p-3" />
              </div>
              <button type="submit"
                className="px-6 py-3 rounded-xl font-semibold text-white"
                style={{ backgroundColor: "#4AAEA0" }}>
                Charger
              </button>
            </div>
          </form>
          {dateSelectionnee !== aujourd_hui && (
            <p className="text-xs text-orange-500 mt-2">
              ⚠️ Vous timbrez pour le {new Date(dateSelectionnee + "T12:00:00").toLocaleDateString("fr-CH")}
            </p>
          )}
        </div>

        {/* Formulaire timbrage */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>
            {dateSelectionnee === aujourd_hui ? "📅 Aujourd'hui" : `📅 ${new Date(dateSelectionnee + "T12:00:00").toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long" })}`}
          </h2>
          <FormTimbrage
            employe_id={employe.id}
            date={dateSelectionnee}
            timbrage={timbrageDate}
          />
        </div>

        {/* Historique du mois */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>
            📋 Historique du mois
          </h2>
          <div className="space-y-2">
            {timbrages?.filter(t => t.date !== dateSelectionnee).map((t: any) => {
              const heures = t.type_absence ? null :
                calculerDuree(t.heure_debut_matin, t.heure_fin_matin) +
                calculerDuree(t.heure_debut_aprem, t.heure_fin_aprem);

              return (
                <a key={t.id} href={`/employes/mon-espace/timbrage?date=${t.date}`}
                  className="flex justify-between items-center border rounded-xl p-3 hover:bg-slate-50 transition">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#1B2B5E" }}>
                      {new Date(t.date + "T12:00:00").toLocaleDateString("fr-CH", { weekday: "short", day: "numeric", month: "short" })}
                    </p>
                    {t.type_absence ? (
                      <p className="text-xs text-orange-500 font-semibold capitalize">{t.type_absence}</p>
                    ) : (
                      <p className="text-xs text-gray-500">
                        {t.heure_debut_matin?.slice(0,5)}–{t.heure_fin_matin?.slice(0,5)} · {t.heure_debut_aprem?.slice(0,5)}–{t.heure_fin_aprem?.slice(0,5)}
                      </p>
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
                </a>
              );
            })}
            {timbrages?.length === 0 && (
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