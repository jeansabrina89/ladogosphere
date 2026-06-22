import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import { getEmployeRhActuel } from "@/src/lib/employeActuel";
import { calculerDecompteHeures } from "@/src/lib/decompteHeures";
import TimbrageCalendrier from "../../timbrage/TimbrageCalendrier";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";

const NOMS_MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export default async function TimbrageEmployePage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  const supabase       = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role, email").eq("id", user.id).single();
  if (!profile || !["admin", "employe"].includes(profile.role)) redirect("/");

  const employe = await getEmployeRhActuel(supabase, user.id, profile?.email);
  if (!employe) redirect("/employes/mon-espace");

  // Mois sélectionné (défaut : mois courant)
  const maintenant = new Date();
  const params = await searchParams;
  const moisParam = params.mois
    || `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, "0")}`;

  const [anneeStr, moisStr] = moisParam.split("-");
  const annee    = parseInt(anneeStr);
  const moisNum  = parseInt(moisStr);

  const aujourd_hui = [
    maintenant.getFullYear(),
    String(maintenant.getMonth() + 1).padStart(2, "0"),
    String(maintenant.getDate()).padStart(2, "0"),
  ].join("-");

  const dateDebutMois  = `${moisParam}-01`;
  const dateFinMois    = new Date(annee, moisNum, 0).toISOString().split("T")[0];
  const dateDebutAnnee = `${annee}-01-01`;

  const [
    { data: planningMoisData },
    { data: timbragesMoisData },
    { data: planningAnneeData },
    { data: timbragesAnneeData },
  ] = await Promise.all([
    supabase.from("planning_employes")
      .select("date, statut").eq("employe_id", employe.id)
      .gte("date", dateDebutMois).lte("date", dateFinMois),
    supabase.from("timbrage")
      .select("date, type_absence, heure_debut_matin, heure_fin_matin, heure_debut_aprem, heure_fin_aprem, valide_admin, note")
      .eq("employe_id", employe.id)
      .gte("date", dateDebutMois).lte("date", dateFinMois),
    supabase.from("planning_employes")
      .select("date, statut").eq("employe_id", employe.id)
      .gte("date", dateDebutAnnee).lte("date", dateFinMois),
    supabase.from("timbrage")
      .select("date, type_absence, heure_debut_matin, heure_fin_matin, heure_debut_aprem, heure_fin_aprem, valide_admin")
      .eq("employe_id", employe.id)
      .gte("date", dateDebutAnnee).lte("date", dateFinMois),
  ]);

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

  // Navigation mois
  const moisPrecNum  = moisNum === 1  ? 12 : moisNum - 1;
  const anneePrecNum = moisNum === 1  ? annee - 1 : annee;
  const moisSuivNum  = moisNum === 12 ? 1  : moisNum + 1;
  const anneeSuivNum = moisNum === 12 ? annee + 1 : annee;
  const moisPrecedent = `${anneePrecNum}-${String(moisPrecNum).padStart(2, "0")}`;
  const moisSuivant   = `${anneeSuivNum}-${String(moisSuivNum).padStart(2, "0")}`;

  const soldeMois  = decompteMois.solde;
  const soldeAnnee = decompteAnnee.solde;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">

        <EnTete titre="⏱️ Mon timbrage" />

        {/* Navigation mois */}
        <div className="flex justify-between items-center mb-4">
          <Bouton href={`/employes/mon-espace/timbrage?mois=${moisPrecedent}`} variante="secondaire">
            ← {NOMS_MOIS[moisPrecNum - 1]}
          </Bouton>
          <h2 className="text-xl font-bold" style={{ color: "#1B2B5E" }}>
            {NOMS_MOIS[moisNum - 1]} {annee}
          </h2>
          <Bouton href={`/employes/mon-espace/timbrage?mois=${moisSuivant}`} variante="secondaire">
            {NOMS_MOIS[moisSuivNum - 1]} →
          </Bouton>
        </div>

        {/* Totaux compacts */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
            <p className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>
              {decompteMois.heuresFaites.toFixed(1)}h
            </p>
            <p className="text-xs text-[rgba(27,43,94,0.5)] mt-1">Faites ce mois</p>
          </div>
          <div className="text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
            <p className="text-2xl font-bold" style={{ color: "rgba(27,43,94,0.4)" }}>
              {decompteMois.heuresDues.toFixed(1)}h
            </p>
            <p className="text-xs text-[rgba(27,43,94,0.5)] mt-1">Dues ce mois</p>
          </div>
          <div className="text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
            <p className="text-2xl font-bold"
              style={{ color: soldeMois >= 0 ? "#4AAEA0" : "#D97706" }}>
              {soldeMois >= 0 ? "+" : ""}{soldeMois.toFixed(1)}h
            </p>
            <p className="text-xs text-[rgba(27,43,94,0.5)] mt-1">Solde du mois</p>
          </div>
          <div className="text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "16px" }}>
            <p className="text-2xl font-bold"
              style={{ color: soldeAnnee >= 0 ? "#4AAEA0" : "#D97706" }}>
              {soldeAnnee >= 0 ? "+" : ""}{soldeAnnee.toFixed(1)}h
            </p>
            <p className="text-xs text-[rgba(27,43,94,0.5)] mt-1">Solde {annee}</p>
          </div>
        </div>

        {/* Calendrier interactif */}
        <TimbrageCalendrier
          employeId={employe.id}
          mois={moisParam}
          planning={planningMoisData ?? []}
          timbrages={(timbragesMoisData ?? []) as any[]}
          decompteJours={decompteMois.jours}
          mode="employe"
        />

        <div className="mt-6">
          <Bouton href="/employes/mon-espace" variante="secondaire">← Mon espace</Bouton>
        </div>

      </div>
    </main>
  );
}
