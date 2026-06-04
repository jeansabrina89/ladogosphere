import { createSupabaseServerClient } from "../../../src/lib/supabase-server";
import { redirect } from "next/navigation";
import { supabase } from "../../../src/lib/supabase";
import Link from "next/link";

export default async function MonEspaceRHPage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role, email").eq("id", user.id).single();
  if (!profile || !["admin", "employe"].includes(profile.role)) redirect("/");
  const { data: employe } = await supabase
    .from("employes_rh")
    .select("*")
    .eq("email", profile?.email ?? "")
    .single();

  if (!employe) return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm text-center">
        <p className="text-4xl mb-4">👷</p>
        <h1 className="text-2xl font-bold mb-3" style={{ color: "#1B2B5E" }}>
          Fiche RH non créée
        </h1>
        <p className="text-gray-500">Contactez l'administrateur pour créer votre fiche RH.</p>
      </div>
    </main>
  );

  const aujourd_hui = new Date().toISOString().split("T")[0];
  const moisActuel = new Date().getMonth() + 1;
  const anneeActuelle = new Date().getFullYear();

  // Timbrage aujourd'hui
  const { data: timbrageAujourdhui } = await supabase
    .from("timbrage")
    .select("*")
    .eq("employe_id", employe.id)
    .eq("date", aujourd_hui)
    .maybeSingle();

  // Stats du mois
  const { data: timbragesMois } = await supabase
    .from("timbrage")
    .select("*")
    .eq("employe_id", employe.id)
    .gte("date", `${anneeActuelle}-${String(moisActuel).padStart(2, "0")}-01`)
    .lte("date", aujourd_hui);

  // Calcul heures travaillées ce mois
  let heuresTravaillees = 0;
  timbragesMois?.forEach((t: any) => {
    if (!t.type_absence) {
      const matin = calculerDuree(t.heure_debut_matin, t.heure_fin_matin);
      const aprem = calculerDuree(t.heure_debut_aprem, t.heure_fin_aprem);
      heuresTravaillees += matin + aprem;
    }
  });

  // Heures théoriques ce mois (jours ouvrables * heures/jour)
  const joursOuvrables = compterJoursOuvrables(anneeActuelle, moisActuel);
  const heuresParJour = 42 / 5;
  const heuresTheoMois = joursOuvrables * heuresParJour * (employe.taux_travail / 100);
  const heuresSup = heuresTravaillees - heuresTheoMois;

  // Vacances
  const { data: demandesVacances } = await supabase
    .from("demandes_vacances")
    .select("*")
    .eq("employe_id", employe.id)
    .order("date_debut", { ascending: false })
    .limit(5);

  const joursVacancesTotal = 20 * employe.taux_travail / 100;
  const joursVacancesPris = demandesVacances
    ?.filter((d: any) => d.statut === "acceptee")
    .reduce((acc: number, d: any) => acc + d.nb_jours, 0) ?? 0;
  const joursVacancesRestants = joursVacancesTotal - joursVacancesPris;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">

        <h1 className="text-4xl font-bold mb-2" style={{ color: "#1B2B5E" }}>
          👋 Mon espace RH
        </h1>
        <p className="text-gray-500 mb-6">{employe.prenom} {employe.nom} — {employe.taux_travail}%</p>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: heuresSup >= 0 ? "#4AAEA0" : "#E8847A" }}>
              {heuresSup >= 0 ? "+" : ""}{heuresSup.toFixed(1)}h
            </p>
            <p className="text-xs text-gray-500 mt-1">Heures {heuresSup >= 0 ? "sup" : "neg"}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>
              {heuresTravaillees.toFixed(1)}h
            </p>
            <p className="text-xs text-gray-500 mt-1">Heures ce mois</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: "#C9A84C" }}>
              {joursVacancesRestants.toFixed(1)}j
            </p>
            <p className="text-xs text-gray-500 mt-1">Vacances restantes</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>
              {joursVacancesTotal}j
            </p>
            <p className="text-xs text-gray-500 mt-1">Droit annuel</p>
          </div>
        </div>

        {/* Actions rapides */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Link href="/employes/mon-espace/timbrage"
            className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition"
            style={{ borderLeft: "4px solid #4AAEA0" }}>
            <p className="font-bold" style={{ color: "#1B2B5E" }}>⏱️ Timbrage</p>
            <p className="text-xs text-gray-400 mt-1">Saisir mes heures</p>
            {timbrageAujourdhui && (
              <p className="text-xs text-green-600 mt-1 font-semibold">✅ Timbré aujourd'hui</p>
            )}
          </Link>
          <Link href="/employes/mon-espace/vacances"
            className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition"
            style={{ borderLeft: "4px solid #C9A84C" }}>
            <p className="font-bold" style={{ color: "#1B2B5E" }}>🏖️ Vacances</p>
            <p className="text-xs text-gray-400 mt-1">Demander des vacances</p>
          </Link>
          <Link href="/employes/mon-espace/planning"
            className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition"
            style={{ borderLeft: "4px solid #1B2B5E" }}>
            <p className="font-bold" style={{ color: "#1B2B5E" }}>📅 Mon planning</p>
            <p className="text-xs text-gray-400 mt-1">Voir mes jours de travail</p>
          </Link>
        </div>

        {/* Dernières demandes vacances */}
        {demandesVacances && demandesVacances.length > 0 && (
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>
              🏖️ Mes demandes de vacances
            </h2>
            <div className="space-y-3">
              {demandesVacances.map((d: any) => (
                <div key={d.id} className="flex justify-between items-center border rounded-xl p-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#1B2B5E" }}>
                      {new Date(d.date_debut).toLocaleDateString("fr-CH")} →{" "}
                      {new Date(d.date_fin).toLocaleDateString("fr-CH")}
                    </p>
                    <p className="text-xs text-gray-500">{d.nb_jours}j</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    d.statut === "acceptee" ? "bg-green-100 text-green-700" :
                    d.statut === "refusee" ? "bg-red-100 text-red-700" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>
                    {d.statut === "acceptee" ? "✅ Acceptée" :
                     d.statut === "refusee" ? "❌ Refusée" : "⏳ En attente"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

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

function compterJoursOuvrables(annee: number, mois: number): number {
  const daysInMonth = new Date(annee, mois, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const jour = new Date(annee, mois - 1, d).getDay();
    if (jour !== 0 && jour !== 6) count++;
  }
  return count;
}