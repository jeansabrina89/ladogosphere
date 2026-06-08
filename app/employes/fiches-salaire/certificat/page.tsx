import { createSupabaseServerClient } from "../../../../src/lib/supabase-server";
import { redirect } from "next/navigation";
import { supabase } from "../../../../src/lib/supabase";
import BoutonImprimer from "../[id]/BoutonImprimer";
import Link from "next/link";

export default async function CertificatSalaireAnnuelPage({
  searchParams,
}: {
  searchParams: Promise<{ employe_id?: string; annee?: string }>;
}) {
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

  const dateGeneration = new Date().toLocaleDateString("fr-CH");

  // Calculs totaux
  const totalBrut = fiches?.reduce((acc, f) => acc + Number(f.salaire_brut), 0) ?? 0;
  const totalNet = fiches?.reduce((acc, f) => acc + Number(f.salaire_net), 0) ?? 0;

  // Extraire les déductions par type depuis toutes les fiches
  const toutesDeductions: any[] = [];
  fiches?.forEach(f => {
    (f as any).fiche_salaire_deductions?.forEach((d: any) => {
      toutesDeductions.push(d);
    });
  });

  // Regrouper par label
  const deductionsParLabel: Record<string, number> = {};
  toutesDeductions.forEach(d => {
    if (!deductionsParLabel[d.label]) deductionsParLabel[d.label] = 0;
    deductionsParLabel[d.label] += Number(d.montant_calcule);
  });

  // Identifier les cotisations spécifiques
  const avs = Object.entries(deductionsParLabel)
    .filter(([k]) => k.toLowerCase().includes("avs") || k.toLowerCase().includes("ai") || k.toLowerCase().includes("apg"))
    .reduce((acc, [, v]) => acc + v, 0);

  const ac = Object.entries(deductionsParLabel)
    .filter(([k]) => k.toLowerCase().includes("chômage") || k.toLowerCase().includes("ac"))
    .reduce((acc, [, v]) => acc + v, 0);

  const lpp = Object.entries(deductionsParLabel)
    .filter(([k]) => k.toLowerCase().includes("lpp") || k.toLowerCase().includes("retraite"))
    .reduce((acc, [, v]) => acc + v, 0);

  const aanp = Object.entries(deductionsParLabel)
    .filter(([k]) => k.toLowerCase().includes("accident") || k.toLowerCase().includes("aanp"))
    .reduce((acc, [, v]) => acc + v, 0);

  const ijm = Object.entries(deductionsParLabel)
    .filter(([k]) => k.toLowerCase().includes("maladie") || k.toLowerCase().includes("ijm"))
    .reduce((acc, [, v]) => acc + v, 0);

  const autresDeductions = Object.entries(deductionsParLabel)
    .filter(([k]) =>
      !k.toLowerCase().includes("avs") && !k.toLowerCase().includes("ai") && !k.toLowerCase().includes("apg") &&
      !k.toLowerCase().includes("chômage") && !k.toLowerCase().includes("ac") &&
      !k.toLowerCase().includes("lpp") && !k.toLowerCase().includes("retraite") &&
      !k.toLowerCase().includes("accident") && !k.toLowerCase().includes("aanp") &&
      !k.toLowerCase().includes("maladie") && !k.toLowerCase().includes("ijm")
    )
    .reduce((acc, [, v]) => acc + v, 0);

  const totalCotisationsCase7 = avs + ac;

  // Dates début/fin emploi pour l'année
  const dateDebut = employe.date_entree
    ? new Date(employe.date_entree) > new Date(`${annee}-01-01`)
      ? new Date(employe.date_entree).toLocaleDateString("fr-CH")
      : `01.01.${annee}`
    : `01.01.${annee}`;
  const dateFin = `31.12.${annee}`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print { display: none !important; }
          nav { display: none !important; }
          header { display: none !important; }
          body { background: white !important; margin: 0; }
          @page { margin: 1cm; size: A4; }
        }
        .cert-table { border-collapse: collapse; width: 100%; }
        .cert-table td, .cert-table th { border: 1px solid #333; padding: 4px 8px; font-size: 11px; }
        .cert-case { background-color: #f0f0f0; font-weight: bold; width: 30px; text-align: center; }
        .cert-header { background-color: #1B2B5E; color: white; font-weight: bold; }
      `}} />

      <div className="no-print p-4 flex gap-3">
        <BoutonImprimer />
        <Link href="/employes/fiches-salaire"
          className="px-4 py-2 rounded-xl font-semibold text-sm"
          style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
          ← Retour
        </Link>
      </div>

      {/* Certificat format officiel */}
      <div className="max-w-3xl mx-auto bg-white p-8 shadow-sm mb-8" style={{ fontFamily: "Arial, sans-serif", fontSize: "12px" }}>

        {/* Titre */}
        <div className="text-center mb-4">
          <h1 style={{ fontSize: "16px", fontWeight: "bold", color: "#1B2B5E", borderBottom: "2px solid #1B2B5E", paddingBottom: "8px" }}>
            CERTIFICAT DE SALAIRE / ATTESTATION DE RENTES
          </h1>
          <p style={{ fontSize: "11px", color: "#666" }}>
            Formulaire officiel — Année fiscale {annee}
          </p>
        </div>

        {/* Section employeur + employé */}
        <div className="grid grid-cols-2 gap-4 mb-4">

          {/* Employeur */}
          <div style={{ border: "1px solid #333", padding: "8px" }}>
            <p style={{ fontWeight: "bold", backgroundColor: "#1B2B5E", color: "white", padding: "2px 6px", marginBottom: "6px", fontSize: "11px" }}>
              EMPLOYEUR
            </p>
            <p style={{ fontWeight: "bold" }}>La Dogosphère Sàrl</p>
            <p>Pension canine</p>
            <p>Sion, Valais</p>
            <p>ladogosphere@gmail.com</p>
          </div>

          {/* Employé */}
          <div style={{ border: "1px solid #333", padding: "8px" }}>
            <p style={{ fontWeight: "bold", backgroundColor: "#1B2B5E", color: "white", padding: "2px 6px", marginBottom: "6px", fontSize: "11px" }}>
              EMPLOYÉ(E)
            </p>
            <p style={{ fontWeight: "bold" }}>{employe.prenom} {employe.nom}</p>
            {employe.adresse && <p>{employe.adresse}</p>}
            <p>✉️ {employe.email}</p>
            {employe.telephone && <p>📞 {employe.telephone}</p>}
          </div>
        </div>

        {/* Cases officielles */}
        <table className="cert-table mb-4">
          <thead>
            <tr>
              <td className="cert-case cert-header">N°</td>
              <td className="cert-header" style={{ border: "1px solid #333", padding: "4px 8px" }}>DESCRIPTION</td>
              <td className="cert-header" style={{ border: "1px solid #333", padding: "4px 8px", textAlign: "right", width: "150px" }}>MONTANT (CHF)</td>
            </tr>
          </thead>
          <tbody>

            {/* Case 1 — Salaire brut */}
            <tr>
              <td className="cert-case">1</td>
              <td style={{ border: "1px solid #333", padding: "4px 8px" }}>
                <strong>Salaire brut</strong> (salaire convenu + allocations diverses)
              </td>
              <td style={{ border: "1px solid #333", padding: "4px 8px", textAlign: "right", fontWeight: "bold" }}>
                {totalBrut.toFixed(2)}
              </td>
            </tr>

            {/* Case 2 — Indemnités journalières */}
            <tr>
              <td className="cert-case">2</td>
              <td style={{ border: "1px solid #333", padding: "4px 8px" }}>
                Indemnités journalières (maladie, accident, maternité)
              </td>
              <td style={{ border: "1px solid #333", padding: "4px 8px", textAlign: "right" }}>
                0.00
              </td>
            </tr>

            {/* Case 3 — Prestations en nature */}
            <tr>
              <td className="cert-case">3</td>
              <td style={{ border: "1px solid #333", padding: "4px 8px" }}>
                Prestations en nature (logement, nourriture, etc.)
              </td>
              <td style={{ border: "1px solid #333", padding: "4px 8px", textAlign: "right" }}>
                0.00
              </td>
            </tr>

            {/* Case 4 — Participation salariée */}
            <tr>
              <td className="cert-case">4</td>
              <td style={{ border: "1px solid #333", padding: "4px 8px" }}>
                Participations de collaborateur
              </td>
              <td style={{ border: "1px solid #333", padding: "4px 8px", textAlign: "right" }}>
                0.00
              </td>
            </tr>

            {/* Case 5 — Indemnités de départ */}
            <tr>
              <td className="cert-case">5</td>
              <td style={{ border: "1px solid #333", padding: "4px 8px" }}>
                Indemnités de départ / autres prestations non périodiques
              </td>
              <td style={{ border: "1px solid #333", padding: "4px 8px", textAlign: "right" }}>
                0.00
              </td>
            </tr>

            {/* Case 6 — Salaire brut total */}
            <tr style={{ backgroundColor: "#f5f5f5" }}>
              <td className="cert-case" style={{ backgroundColor: "#1B2B5E", color: "white" }}>6</td>
              <td style={{ border: "1px solid #333", padding: "4px 8px", fontWeight: "bold" }}>
                SALAIRE BRUT TOTAL (cases 1 à 5)
              </td>
              <td style={{ border: "1px solid #333", padding: "4px 8px", textAlign: "right", fontWeight: "bold" }}>
                {totalBrut.toFixed(2)}
              </td>
            </tr>

            {/* Case 7 — AVS/AI/APG/AC */}
            <tr>
              <td className="cert-case">7</td>
              <td style={{ border: "1px solid #333", padding: "4px 8px" }}>
                Cotisations employé AVS/AI/APG + Assurance chômage (AC)
                {avs > 0 && <span style={{ color: "#666", fontSize: "10px" }}> — AVS/AI/APG: {avs.toFixed(2)} | AC: {ac.toFixed(2)}</span>}
              </td>
              <td style={{ border: "1px solid #333", padding: "4px 8px", textAlign: "right", color: "red" }}>
                -{totalCotisationsCase7.toFixed(2)}
              </td>
            </tr>

            {/* Case 8 — LPP */}
            <tr>
              <td className="cert-case">8</td>
              <td style={{ border: "1px solid #333", padding: "4px 8px" }}>
                Cotisations LPP (prévoyance professionnelle — part employé)
              </td>
              <td style={{ border: "1px solid #333", padding: "4px 8px", textAlign: "right", color: "red" }}>
                -{lpp.toFixed(2)}
              </td>
            </tr>

            {/* Case 9 — AANP/IJM */}
            <tr>
              <td className="cert-case">9</td>
              <td style={{ border: "1px solid #333", padding: "4px 8px" }}>
                Primes d'assurance (AANP + IJM — part employé)
                {(aanp > 0 || ijm > 0) && <span style={{ color: "#666", fontSize: "10px" }}> — AANP: {aanp.toFixed(2)} | IJM: {ijm.toFixed(2)}</span>}
              </td>
              <td style={{ border: "1px solid #333", padding: "4px 8px", textAlign: "right", color: "red" }}>
                -{(aanp + ijm).toFixed(2)}
              </td>
            </tr>

            {/* Case 10 — Autres déductions */}
            <tr>
              <td className="cert-case">10</td>
              <td style={{ border: "1px solid #333", padding: "4px 8px" }}>
                Autres déductions (retenues diverses)
              </td>
              <td style={{ border: "1px solid #333", padding: "4px 8px", textAlign: "right", color: "red" }}>
                -{autresDeductions.toFixed(2)}
              </td>
            </tr>

            {/* Case 11 — Salaire net */}
            <tr style={{ backgroundColor: "#E8F5F4" }}>
              <td className="cert-case" style={{ backgroundColor: "#4AAEA0", color: "white" }}>11</td>
              <td style={{ border: "1px solid #333", padding: "4px 8px", fontWeight: "bold" }}>
                SALAIRE NET (case 6 - cases 7 à 10)
              </td>
              <td style={{ border: "1px solid #333", padding: "4px 8px", textAlign: "right", fontWeight: "bold", color: "#1B2B5E", fontSize: "14px" }}>
                {totalNet.toFixed(2)}
              </td>
            </tr>

          </tbody>
        </table>

        {/* Cases 12-14 — Informations complémentaires */}
        <table className="cert-table mb-4">
          <tbody>
            <tr>
              <td className="cert-case">12</td>
              <td style={{ border: "1px solid #333", padding: "4px 8px", width: "200px" }}>
                <strong>Taux d'occupation</strong>
              </td>
              <td style={{ border: "1px solid #333", padding: "4px 8px" }}>
                <strong>{employe.taux_travail}%</strong>
              </td>
            </tr>
            <tr>
              <td className="cert-case">13</td>
              <td style={{ border: "1px solid #333", padding: "4px 8px" }}>
                <strong>Durée du rapport de travail</strong>
              </td>
              <td style={{ border: "1px solid #333", padding: "4px 8px" }}>
                Du <strong>{dateDebut}</strong> au <strong>{dateFin}</strong>
              </td>
            </tr>
            <tr>
              <td className="cert-case">14</td>
              <td style={{ border: "1px solid #333", padding: "4px 8px" }}>
                <strong>Fonction / Poste</strong>
              </td>
              <td style={{ border: "1px solid #333", padding: "4px 8px" }}>
                {employe.poste === "Autre" ? employe.poste_autre || "—" : employe.poste || "—"}
              </td>
            </tr>
            <tr>
              <td className="cert-case">15</td>
              <td style={{ border: "1px solid #333", padding: "4px 8px" }}>
                <strong>Remarques</strong>
              </td>
              <td style={{ border: "1px solid #333", padding: "4px 8px" }}>
                Certificat de salaire — Année fiscale {annee}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Signature */}
        <div className="grid grid-cols-2 gap-8 mt-6">
          <div>
            <p style={{ fontSize: "11px", color: "#666", marginBottom: "40px" }}>
              Sion, le {dateGeneration}
            </p>
            <div style={{ borderTop: "1px solid #333", width: "200px", paddingTop: "4px" }}>
              <p style={{ fontWeight: "bold", fontSize: "11px" }}>Sabrina Jean</p>
              <p style={{ fontSize: "10px", color: "#666" }}>La Dogosphère Sàrl — Responsable</p>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "10px", color: "#666" }}>
              Document établi le {dateGeneration}<br/>
              Fiches générées : {fiches?.length ?? 0} mois sur 12<br/>
              Taux : {employe.taux_travail}%
            </p>
          </div>
        </div>

        {/* Pied de page */}
        <div style={{ borderTop: "1px solid #ccc", marginTop: "20px", paddingTop: "8px", textAlign: "center", fontSize: "10px", color: "#888" }}>
          <p>La Dogosphère Sàrl — Pension canine — Sion, Valais — ladogosphere@gmail.com</p>
          <p>Ce certificat de salaire est établi conformément aux directives de l'AFC (Administration fédérale des contributions)</p>
        </div>

      </div>
    </>
  );
}