import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import { formatDateFR } from "@/src/lib/dates";
import { getEmployeRhActuel } from "@/src/lib/employeActuel";
import { calculerDecompteHeures } from "@/src/lib/decompteHeures";
import Link from "next/link";
import EnTete from "@/app/components/ui/EnTete";
import EtatVide from "@/app/components/ui/EtatVide";
import BadgeStatut from "@/app/components/ui/BadgeStatut";

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
      <div className="max-w-2xl mx-auto">
        <EtatVide
          icone="👷"
          titre="Fiche RH non créée"
          message="Contactez l'administrateur pour créer votre fiche RH."
        />
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

        <EnTete
          titre="👋 Mon espace RH"
          sousTitre={`${employe.prenom} ${employe.nom} — ${employe.taux_travail}%`}
        />

        {/* Actions rapides */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Link href="/employes/mon-espace/timbrage" className="hover:shadow-md transition"
            style={{ display: "block", backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderLeft: "4px solid #4AAEA0", borderRadius: "18px", padding: "20px" }}>
            <p className="font-bold" style={{ color: "#1B2B5E" }}>⏱️ Timbrage</p>
            <p className="text-xs mt-1" style={{ color: "rgba(27,43,94,0.45)" }}>Saisir mes heures</p>
            {timbrageAujourdhui && (
              <p className="text-xs mt-1 font-semibold" style={{ color: "#1F6E5B" }}>✅ Timbré aujourd'hui</p>
            )}
          </Link>
          <Link href="/employes/mon-espace/vacances" className="hover:shadow-md transition"
            style={{ display: "block", backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderLeft: "4px solid #C9A84C", borderRadius: "18px", padding: "20px" }}>
            <p className="font-bold" style={{ color: "#1B2B5E" }}>🏖️ Vacances</p>
            <p className="text-xs mt-1" style={{ color: "rgba(27,43,94,0.45)" }}>Demander des vacances</p>
          </Link>
          <Link href="/employes/mon-espace/planning" className="hover:shadow-md transition"
            style={{ display: "block", backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderLeft: "4px solid #1B2B5E", borderRadius: "18px", padding: "20px" }}>
            <p className="font-bold" style={{ color: "#1B2B5E" }}>📅 Mon planning</p>
            <p className="text-xs mt-1" style={{ color: "rgba(27,43,94,0.45)" }}>Voir mes jours de travail</p>
          </Link>
          <Link href="/employes/planning-equipe" className="hover:shadow-md transition"
            style={{ display: "block", backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderLeft: "4px solid #4AAEA0", borderRadius: "18px", padding: "20px" }}>
            <p className="font-bold" style={{ color: "#1B2B5E" }}>👥 Planning de l'équipe</p>
            <p className="text-xs mt-1" style={{ color: "rgba(27,43,94,0.45)" }}>Voir qui travaille chaque jour</p>
          </Link>
          <Link href="/employes/mon-espace/indisponibilites" className="hover:shadow-md transition"
            style={{ display: "block", backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderLeft: "4px solid #E8847A", borderRadius: "18px", padding: "20px" }}>
            <p className="font-bold" style={{ color: "#1B2B5E" }}>🚫 Indisponibilités</p>
            <p className="text-xs mt-1" style={{ color: "rgba(27,43,94,0.45)" }}>Indiquer mes jours indisponibles</p>
            {indisponibilites && indisponibilites.length > 0 && (
              <p className="text-xs mt-1 font-semibold" style={{ color: "#8A6D1F" }}>
                {indisponibilites.length} jour(s) enregistré(s)
              </p>
            )}
          </Link>
          <Link href="/employes/mon-espace/fiches-salaire" className="hover:shadow-md transition"
            style={{ display: "block", backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderLeft: "4px solid #E8847A", borderRadius: "18px", padding: "20px" }}>
            <p className="font-bold" style={{ color: "#1B2B5E" }}>📊 Fiches de salaire</p>
            <p className="text-xs mt-1" style={{ color: "rgba(27,43,94,0.45)" }}>Consulter mes fiches</p>
          </Link>
          <Link href="/employes/mon-espace/mot-de-passe" className="hover:shadow-md transition"
            style={{ display: "block", backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderLeft: "4px solid rgba(27,43,94,0.45)", borderRadius: "18px", padding: "20px" }}>
            <p className="font-bold" style={{ color: "#1B2B5E" }}>🔑 Changer mon mot de passe</p>
            <p className="text-xs mt-1" style={{ color: "rgba(27,43,94,0.45)" }}>Modifier mon mot de passe de connexion</p>
          </Link>
        </div>

        {/* Impression du planning (vue calendrier, comme le generateur) */}
        <div className="mb-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderLeft: "4px solid #C9A84C", borderRadius: "18px", padding: "20px" }}>
          <p className="font-bold mb-1" style={{ color: "#1B2B5E" }}>🖨️ Imprimer le planning de l'équipe</p>
          <p className="text-xs mb-3" style={{ color: "rgba(27,43,94,0.45)" }}>Ouvre le calendrier du mois, prêt à imprimer ou enregistrer en PDF</p>
          <a href={`/employes/planning-equipe?mois=${moisActuel}&annee=${anneeActuelle}`}
            className="inline-flex items-center px-6 py-3 rounded-xl font-semibold text-white"
            style={{ backgroundColor: "#2E8B7E" }}>
            🖨️ Imprimer le planning
          </a>
        </div>

        {/* Dernieres demandes vacances */}
        {demandesVacances && demandesVacances.length > 0 && (
          <div className="mb-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "24px" }}>
            <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>🏖️ Mes demandes de vacances</h2>
            <div className="space-y-3">
              {demandesVacances.map((d: any) => (
                <div key={d.id} className="flex justify-between items-center rounded-xl p-3" style={{ border: "1px solid rgba(27,43,94,0.12)" }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#1B2B5E" }}>
                      {formatDateFR(d.date_debut)} → {formatDateFR(d.date_fin)}
                    </p>
                    <p className="text-xs" style={{ color: "rgba(27,43,94,0.5)" }}>{d.nb_jours}j</p>
                  </div>
                  <BadgeStatut statut={d.statut} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats mois */}
        <h2 className="font-bold mb-3 text-sm uppercase tracking-wide" style={{ color: "rgba(27,43,94,0.45)" }}>Ce mois</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <div className="text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
            <p className={soldeMois >= 0 ? "text-2xl font-bold" : "text-xl font-semibold"} style={{ color: soldeMois >= 0 ? "#4AAEA0" : "#D97706" }}>
              {soldeMois >= 0 ? "+" : ""}{soldeMois.toFixed(1)}h
            </p>
            <p className="text-xs mt-1" style={{ color: "rgba(27,43,94,0.5)" }}>Solde ce mois</p>
          </div>
          <div className="text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
            <p className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>{decompteMois.heuresFaites.toFixed(1)}h</p>
            <p className="text-xs mt-1" style={{ color: "rgba(27,43,94,0.5)" }}>Heures faites</p>
          </div>
          <div className="text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
            <p className="text-2xl font-bold" style={{ color: "rgba(27,43,94,0.55)" }}>{decompteMois.heuresDues.toFixed(1)}h</p>
            <p className="text-xs mt-1" style={{ color: "rgba(27,43,94,0.5)" }}>Heures dues</p>
          </div>
        </div>

        {/* Stats annee */}
        <h2 className="font-bold mb-3 text-sm uppercase tracking-wide" style={{ color: "rgba(27,43,94,0.45)" }}>Cette année</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
            <p className={soldeAnnee >= 0 ? "text-2xl font-bold" : "text-xl font-semibold"} style={{ color: soldeAnnee >= 0 ? "#4AAEA0" : "#D97706" }}>
              {soldeAnnee >= 0 ? "+" : ""}{soldeAnnee.toFixed(1)}h
            </p>
            <p className="text-xs mt-1" style={{ color: "rgba(27,43,94,0.5)" }}>Solde h.sup annuel</p>
          </div>
          <div className="text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
            <p className="text-2xl font-bold" style={{ color: "#C9A84C" }}>{joursVacancesRestants.toFixed(1)}j</p>
            <p className="text-xs mt-1" style={{ color: "rgba(27,43,94,0.5)" }}>Vacances restantes</p>
          </div>
          <div className="text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
            <p className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>
              {joursVacancesTotal}j
              {bonusFeriers > 0 && (<span className="text-sm ml-1" style={{ color: "#8A6D1F" }}>+{bonusFeriers}🎉</span>)}
            </p>
            <p className="text-xs mt-1" style={{ color: "rgba(27,43,94,0.5)" }}>Droit annuel</p>
          </div>
          <div className="text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
            <p className="text-2xl font-bold" style={{ color: "#E8847A" }}>{joursVacancesPris}j</p>
            <p className="text-xs mt-1" style={{ color: "rgba(27,43,94,0.5)" }}>Vacances prises</p>
          </div>
        </div>

      </div>
    </main>
  );
}
