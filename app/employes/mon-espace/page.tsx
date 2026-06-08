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

  const { data: timbrageAujourdhui } = await supabase
    .from("timbrage")
    .select("*")
    .eq("employe_id", employe.id)
    .eq("date", aujourd_hui)
    .maybeSingle();

  // Heures sup cumulées sur toute l'année
  const { data: timbragesAnnee } = await supabase
    .from("timbrage")
    .select("*")
    .eq("employe_id", employe.id)
    .gte("date", `${anneeActuelle}-01-01`)
    .lte("date", aujourd_hui);

  // Heures sup du mois en cours
  const { data: timbragesMois } = await supabase
    .from("timbrage")
    .select("*")
    .eq("employe_id", employe.id)
    .gte("date", `${anneeActuelle}-${String(moisActuel).padStart(2, "0")}-01`)
    .lte("date", aujourd_hui);

  let heuresTravailleesMois = 0;
  timbragesMois?.forEach((t: any) => {
    if (!t.type_absence) {
      heuresTravailleesMois += calculerDuree(t.heure_debut_matin, t.heure_fin_matin);
      heuresTravailleesMois += calculerDuree(t.heure_debut_aprem, t.heure_fin_aprem);
    }
  });

  let heuresTravailleesAnnee = 0;
  timbragesAnnee?.forEach((t: any) => {
    if (!t.type_absence) {
      heuresTravailleesAnnee += calculerDuree(t.heure_debut_matin, t.heure_fin_matin);
      heuresTravailleesAnnee += calculerDuree(t.heure_debut_aprem, t.heure_fin_aprem);
    }
  });

  // Heures théoriques ce mois
  const joursOuvrablesMois = compterJoursOuvrables(anneeActuelle, moisActuel);
  const heuresTheoMois = joursOuvrablesMois * (42 / 5) * (employe.taux_travail / 100);
  const heuresSupMois = heuresTravailleesMois - heuresTheoMois;

  // Heures théoriques cette année (jusqu'au mois actuel)
  let heuresTheoAnnee = 0;
  for (let m = 1; m <= moisActuel; m++) {
    const jo = compterJoursOuvrables(anneeActuelle, m);
    heuresTheoAnnee += jo * (42 / 5) * (employe.taux_travail / 100);
  }
  const heuresSupAnnee = heuresTravailleesAnnee - heuresTheoAnnee;

  const { data: demandesVacances } = await supabase
    .from("demandes_vacances")
    .select("*")
    .eq("employe_id", employe.id)
    .order("date_debut", { ascending: false })
    .limit(5);

  const { data: feriesTravailles } = await supabase
    .from("planning_employes")
    .select("id")
    .eq("employe_id", employe.id)
    .eq("statut", "ferie_travaille");

  const bonusFeriers = feriesTravailles?.length ?? 0;
  const joursVacancesTotal = 20 * employe.taux_travail / 100;
  const joursVacancesPris = demandesVacances
    ?.filter((d: any) => d.statut === "acceptee")
    .reduce((acc: number, d: any) => acc + d.nb_jours, 0) ?? 0;
  const joursVacancesRestants = joursVacancesTotal + bonusFeriers - joursVacancesPris;

  const { data: indisponibilites } = await supabase
    .from("indisponibilites")
    .select("*")
    .eq("employe_id", employe.id)
    .gte("date", aujourd_hui)
    .order("date", { ascending: true })
    .limit(3);

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">

        <h1 className="text-4xl font-bold mb-2" style={{ color: "#1B2B5E" }}>
          👋 Mon espace RH
        </h1>
        <p className="text-gray-500 mb-6">{employe.prenom} {employe.nom} — {employe.taux_travail}%</p>

        {/* Stats mois */}
        <h2 className="font-bold mb-3 text-sm uppercase tracking-wide text-gray-400">Ce mois</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: heuresSupMois >= 0 ? "#4AAEA0" : "#E8847A" }}>
              {heuresSupMois >= 0 ? "+" : ""}{heuresSupMois.toFixed(1)}h
            </p>
            <p className="text-xs text-gray-500 mt-1">H.sup ce mois</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>
              {heuresTravailleesMois.toFixed(1)}h
            </p>
            <p className="text-xs text-gray-500 mt-1">Heures travaillées</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: heuresTheoMois >= 0 ? "#6B7280" : "#E8847A" }}>
              {heuresTheoMois.toFixed(1)}h
            </p>
            <p className="text-xs text-gray-500 mt-1">Heures théoriques</p>
          </div>
        </div>

        {/* Stats année */}
        <h2 className="font-bold mb-3 text-sm uppercase tracking-wide text-gray-400">Cette année</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: heuresSupAnnee >= 0 ? "#4AAEA0" : "#E8847A" }}>
              {heuresSupAnnee >= 0 ? "+" : ""}{heuresSupAnnee.toFixed(1)}h
            </p>
            <p className="text-xs text-gray-500 mt-1">Solde h.sup annuel</p>
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
              {bonusFeriers > 0 && (
                <span className="text-sm text-orange-500 ml-1">+{bonusFeriers}🎉</span>
              )}
            </p>
            <p className="text-xs text-gray-500 mt-1">Droit annuel</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: "#E8847A" }}>
              {joursVacancesPris}j
            </p>
            <p className="text-xs text-gray-500 mt-1">Vacances prises</p>
          </div>
        </div>

        {/* Actions rapides */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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
          <Link href="/employes/mon-espace/indisponibilites"
            className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition"
            style={{ borderLeft: "4px solid #E8847A" }}>
            <p className="font-bold" style={{ color: "#1B2B5E" }}>🚫 Indisponibilités</p>
            <p className="text-xs text-gray-400 mt-1">Indiquer mes jours indisponibles</p>
            {indisponibilites && indisponibilites.length > 0 && (
              <p className="text-xs text-orange-500 mt-1 font-semibold">
                {indisponibilites.length} jour(s) enregistré(s)
              </p>
            )}
          </Link>
          <Link href="/employes/mon-espace/fiches-salaire"
  className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition"
  style={{ borderLeft: "4px solid #E8847A" }}>
  <p className="font-bold" style={{ color: "#1B2B5E" }}>📊 Fiches de salaire</p>
  <p className="text-xs text-gray-400 mt-1">Consulter mes fiches</p>
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