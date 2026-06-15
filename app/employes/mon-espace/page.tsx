import { createSupabaseServerClient } from "../../../src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "../../../src/utils/supabase/server";
import { formatDateFR } from "../../../src/lib/dates";
import { getEmployeRhActuel } from "../../../src/lib/employeActuel";
import { calculerDecompteHeures } from "../../../src/lib/decompteHeures";
import Link from "next/link";
import BoutonPdf from "../planning/BoutonPdf";

export default async function MonEspaceRHPage() {
  const supabase       = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role, email").eq("id", user.id).single();
  if (!profile || !["admin", "employe"].includes(profile.role)) redirect("/");

  const employe = await getEmployeRhActuel(supabase, user.id, profile?.email);

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

  // Dates de référence (heure locale)
  const maintenant    = new Date();
  const moisActuel    = maintenant.getMonth() + 1;
  const anneeActuelle = maintenant.getFullYear();
  const moisPad       = String(moisActuel).padStart(2, "0");
  const aujourd_hui   = `${anneeActuelle}-${moisPad}-${String(maintenant.getDate()).padStart(2, "0")}`;

  const dateDebutMois  = `${anneeActuelle}-${moisPad}-01`;
  const dateFinMois    = new Date(anneeActuelle, moisActuel, 0).toISOString().split("T")[0];
  const dateDebutAnnee = `${anneeActuelle}-01-01`;
  const finAnnee       = `${anneeActuelle}-12-31`;

  const [
    { data: timbrageAujourdhui },
    { data: planningMoisData },
    { data: timbragesMoisData },
    { data: planningAnneeData },
    { data: timbragesAnneeData },
    { data: demandesVacances },
    { data: vacancesAccepteesAnnee },
    { data: feriesTravailles },
    { data: indisponibilites },
  ] = await Promise.all([
    supabase.from("timbrage")
      .select("id").eq("employe_id", employe.id).eq("date", aujourd_hui).maybeSingle(),
    supabase.from("planning_employes")
      .select("date, statut").eq("employe_id", employe.id)
      .gte("date", dateDebutMois).lte("date", dateFinMois),
    supabase.from("timbrage")
      .select("date, type_absence, heure_debut_matin, heure_fin_matin, heure_debut_aprem, heure_fin_aprem, valide_admin")
      .eq("employe_id", employe.id)
      .gte("date", dateDebutMois).lte("date", dateFinMois),
    supabase.from("planning_employes")
      .select("date, statut").eq("employe_id", employe.id)
      .gte("date", dateDebutAnnee).lte("date", dateFinMois),
    supabase.from("timbrage")
      .select("date, type_absence, heure_debut_matin, heure_fin_matin, heure_debut_aprem, heure_fin_aprem, valide_admin")
      .eq("employe_id", employe.id)
      .gte("date", dateDebutAnnee).lte("date", dateFinMois),
    // Affichage : 5 dernières demandes, toutes années confondues
    supabase.from("demandes_vacances")
      .select("*").eq("employe_id", employe.id)
      .order("date_debut", { ascending: false }).limit(5),
    // Calcul solde : demandes acceptées dans l'année de référence
    supabase.from("demandes_vacances")
      .select("nb_jours").eq("employe_id", employe.id).eq("statut", "acceptee")
      .gte("date_debut", dateDebutAnnee).lte("date_debut", finAnnee),
    // Bonus fériés travaillés dans l'année de référence
    supabase.from("planning_employes")
      .select("id").eq("employe_id", employe.id).eq("statut", "ferie_travaille")
      .gte("date", dateDebutAnnee).lte("date", finAnnee),
    supabase.from("indisponibilites")
      .select("*").eq("employe_id", employe.id)
      .gte("date", aujourd_hui).order("date", { ascending: true }).limit(3),
  ]);

  // Décomptes via la même fonction que la page timbrage
  const decompteMois = calculerDecompteHeures({
    planning:  planningMoisData  ?? [],
    timbrages: timbragesMoisData ?? [],
    dateDebut: dateDebutMois,
    dateFin:   dateFinMois,
    asOf:      aujourd_hui,
  });

  const decompteAnnee = calculerDecompteHeures({
    planning:  planningAnneeData  ?? [],
    timbrages: timbragesAnneeData ?? [],
    dateDebut: dateDebutAnnee,
    dateFin:   dateFinMois,
    asOf:      aujourd_hui,
  });

  // Solde vacances (inchangé)
  const bonusFeriers        = feriesTravailles?.length ?? 0;
  const joursVacancesTotal  = 20 * employe.taux_travail / 100;
  const joursVacancesPris   = vacancesAccepteesAnnee
    ?.reduce((acc: number, d: any) => acc + d.nb_jours, 0) ?? 0;
  const joursVacancesRestants = joursVacancesTotal + bonusFeriers - joursVacancesPris;

  const soldeMois  = decompteMois.solde;
  const soldeAnnee = decompteAnnee.solde;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">

        <h1 className="text-4xl font-bold mb-2" style={{ color: "#1B2B5E" }}>
          👋 Mon espace RH
        </h1>
        <p className="text-gray-500 mb-6">{employe.prenom} {employe.nom} — {employe.taux_travail}%</p>

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
          <Link href="/employes/mon-espace/mot-de-passe"
            className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition"
            style={{ borderLeft: "4px solid #6B7280" }}>
            <p className="font-bold" style={{ color: "#1B2B5E" }}>🔑 Changer mon mot de passe</p>
            <p className="text-xs text-gray-400 mt-1">Modifier mon mot de passe de connexion</p>
          </Link>
        </div>

        {/* Téléchargement PDF du planning */}
        <div className="bg-white rounded-xl p-5 shadow-sm mb-6" style={{ borderLeft: "4px solid #C9A84C" }}>
          <p className="font-bold mb-1" style={{ color: "#1B2B5E" }}>📥 Planning équipe du mois</p>
          <p className="text-xs text-gray-400 mb-3">Télécharger le planning complet de l'équipe en PDF</p>
          <BoutonPdf mois={moisActuel} annee={anneeActuelle} />
        </div>

        {/* Dernières demandes vacances */}
        {demandesVacances && demandesVacances.length > 0 && (
          <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
            <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>
              🏖️ Mes demandes de vacances
            </h2>
            <div className="space-y-3">
              {demandesVacances.map((d: any) => (
                <div key={d.id} className="flex justify-between items-center border rounded-xl p-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#1B2B5E" }}>
                      {formatDateFR(d.date_debut)} →{" "}
                      {formatDateFR(d.date_fin)}
                    </p>
                    <p className="text-xs text-gray-500">{d.nb_jours}j</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    d.statut === "acceptee" ? "bg-green-100 text-green-700" :
                    d.statut === "refusee"  ? "bg-red-100 text-red-700" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>
                    {d.statut === "acceptee" ? "✅ Acceptée" :
                     d.statut === "refusee"  ? "❌ Refusée" : "⏳ En attente"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats mois — alignées sur calculerDecompteHeures */}
        <h2 className="font-bold mb-3 text-sm uppercase tracking-wide text-gray-400">Ce mois</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className={soldeMois >= 0 ? "text-2xl font-bold" : "text-xl font-semibold"}
              style={{ color: soldeMois >= 0 ? "#4AAEA0" : "#D97706" }}>
              {soldeMois >= 0 ? "+" : ""}{soldeMois.toFixed(1)}h
            </p>
            <p className="text-xs text-gray-500 mt-1">Solde ce mois</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>
              {decompteMois.heuresFaites.toFixed(1)}h
            </p>
            <p className="text-xs text-gray-500 mt-1">Heures faites</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold" style={{ color: "#6B7280" }}>
              {decompteMois.heuresDues.toFixed(1)}h
            </p>
            <p className="text-xs text-gray-500 mt-1">Heures dues</p>
          </div>
        </div>

        {/* Stats année — alignées sur calculerDecompteHeures */}
        <h2 className="font-bold mb-3 text-sm uppercase tracking-wide text-gray-400">Cette année</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm text-center">
            <p className={soldeAnnee >= 0 ? "text-2xl font-bold" : "text-xl font-semibold"}
              style={{ color: soldeAnnee >= 0 ? "#4AAEA0" : "#D97706" }}>
              {soldeAnnee >= 0 ? "+" : ""}{soldeAnnee.toFixed(1)}h
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

      </div>
    </main>
  );
}
