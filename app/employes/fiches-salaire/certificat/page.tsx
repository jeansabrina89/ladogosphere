import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import CertificatEditeur from "./CertificatEditeur";
import Link from "next/link";
import { formatDateFR } from "@/src/lib/dates";

export default async function CertificatSalaireAnnuelPage({
  searchParams,
}: {
  searchParams: Promise<{ employe_id?: string; annee?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role, email").eq("id", user.id).single();
  if (!["admin", "employe"].includes(profile?.role)) redirect("/");

  const annee = parseInt(params.annee || new Date().getFullYear().toString());

  let employe_id = params.employe_id;
  if (profile?.role === "employe") {
    const { data: emp } = await supabase
      .from("employes_rh").select("id").eq("email", profile.email ?? "").single();
    employe_id = emp?.id;
  }

  if (!employe_id) {
    return (
      <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
        <div className="max-w-3xl mx-auto bg-white rounded-xl p-8">
          <p className="text-red-500">Employé non spécifié.</p>
          <Link href="/employes/fiches-salaire" className="text-blue-500">← Retour</Link>
        </div>
      </main>
    );
  }

  const { data: employe } = await supabase
    .from("employes_rh").select("*").eq("id", employe_id).single();

  const { data: fiches } = await supabase
    .from("fiches_salaire")
    .select("*, fiche_salaire_deductions(*)")
    .eq("employe_id", employe_id)
    .eq("annee", annee)
    .order("mois", { ascending: true });

  if (!employe) return <div>Employé introuvable</div>;

  const totalBrut = Math.round(fiches?.reduce((acc, f) => acc + Number(f.salaire_brut), 0) ?? 0);
  const totalNet = Math.round(fiches?.reduce((acc, f) => acc + Number(f.salaire_net), 0) ?? 0);

  const toutesDeductions: any[] = [];
  fiches?.forEach(f => {
    (f as any).fiche_salaire_deductions?.forEach((d: any) => {
      toutesDeductions.push(d);
    });
  });

  const sumLabel = (keywords: string[]) =>
    Math.round(toutesDeductions
      .filter(d => keywords.some(k => d.label.toLowerCase().includes(k.toLowerCase())))
      .reduce((acc, d) => acc + Number(d.montant_calcule), 0));

  const avs_ai_apg = sumLabel(["avs", "ai", "apg"]);
  const ac = sumLabel(["chômage", "ac"]);
  const aanp = sumLabel(["accident", "aanp"]);
  const lpp_ordinaire = sumLabel(["lpp", "retraite"]);
  const ijm = sumLabel(["maladie", "ijm"]);

  const dateDebut = employe.date_entree && new Date(employe.date_entree) > new Date(`${annee}-01-01`)
    ? formatDateFR(employe.date_entree)
    : `01.01.${annee}`;

  const remarquesInitiales = [
    ijm > 0 ? `Cotisation IJM (maladie) : CHF ${ijm}` : "",
    employe.taux_travail < 100 ? `Taux d'occupation : ${employe.taux_travail}%` : "",
    fiches && fiches.length < 12 ? `Mois couverts : ${fiches.length}/12` : "",
  ].filter(Boolean).join(" | ");

  return (
    <CertificatEditeur
      annee={annee}
      employe={employe}
      dateDebut={dateDebut}
      totalBrut={totalBrut}
      totalNet={totalNet}
      avs_ai_apg={avs_ai_apg}
      ac={ac}
      aanp={aanp}
      lpp_ordinaire={lpp_ordinaire}
      ijm={ijm}
      remarquesInitiales={remarquesInitiales}
      isAdmin={profile?.role === "admin"}
    />
  );
}