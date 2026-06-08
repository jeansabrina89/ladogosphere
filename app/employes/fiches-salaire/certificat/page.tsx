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

  // Calculs — uniquement francs entiers
  const totalBrut = Math.round(fiches?.reduce((acc, f) => acc + Number(f.salaire_brut), 0) ?? 0);
  const totalNet = Math.round(fiches?.reduce((acc, f) => acc + Number(f.salaire_net), 0) ?? 0);

  // Extraire toutes les déductions
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

  // Case 9 = AVS+AI+APG + AC + AANP
  const case9 = avs_ai_apg + ac + aanp;
  // Case 10.1 = LPP ordinaire
  const case10_1 = lpp_ordinaire;

  // Dates
  const dateDebut = employe.date_entree && new Date(employe.date_entree) > new Date(`${annee}-01-01`)
    ? new Date(employe.date_entree).toLocaleDateString("fr-CH")
    : `01.01.${annee}`;
  const dateFin = `31.12.${annee}`;
  const dateGeneration = new Date().toLocaleDateString("fr-CH");

  const s = (n: number) => n === 0 ? "0" : n.toLocaleString("fr-CH");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print { display: none !important; }
          nav { display: none !important; }
          header { display: none !important; }
          body { background: white !important; margin: 0; }
          @page { margin: 0.8cm; size: A4; }
        }
        body { font-family: Arial, sans-serif; font-size: 10px; }
        .cs-table { width: 100%; border-collapse: collapse; }
        .cs-table td { border: 0.5px solid #aaa; padding: 2px 6px; vertical-align: top; font-size: 10px; }
        .cs-num { width: 28px; font-weight: bold; text-align: right; background: #f0f0f0; }
        .cs-amount { width: 90px; text-align: right; font-weight: bold; }
        .cs-label { color: #333; }
        .cs-sub { font-size: 9px; color: #555; }
        .cs-section { background: #e8e8e8; font-weight: bold; font-size: 10px; }
        .cs-total { background: #d0d0d0; font-weight: bold; }
      `}} />

      <div className="no-print p-4 flex gap-3">
        <BoutonImprimer />
        <Link href="/employes/fiches-salaire"
          className="px-4 py-2 rounded-xl font-semibold text-sm"
          style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
          ← Retour
        </Link>
      </div>

      <div style={{ maxWidth: "740px", margin: "0 auto", background: "white", padding: "20px", fontFamily: "Arial, sans-serif", fontSize: "10px" }}>

        {/* En-tête A/B */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "6px" }}>
          <tbody>
            <tr>
              <td style={{ width: "20px", fontWeight: "bold", fontSize: "11px", border: "0.5px solid #aaa", padding: "2px 4px", background: "#f0f0f0" }}>A</td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 8px", fontWeight: "bold", fontSize: "11px" }}>
                ☑ Lohnausweis – <strong>Certificat de salaire</strong> – Certificato di salario
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold", fontSize: "11px", border: "0.5px solid #aaa", padding: "2px 4px", background: "#f0f0f0" }}>B</td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 8px", color: "#888", fontSize: "10px" }}>
                ☐ Rentenbescheinigung – Attestation de rentes – Attestazione delle rendite
              </td>
            </tr>
          </tbody>
        </table>

        {/* C D E F G */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "6px" }}>
          <tbody>
            <tr>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 4px", background: "#f0f0f0", fontWeight: "bold", width: "20px" }}>C</td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 8px", width: "200px" }}>
                <div style={{ fontSize: "9px", color: "#666" }}>AHV-Nr. – No AVS – N. AVS</div>
                <strong>{employe.numero_avs || "—"}</strong>
              </td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 4px", background: "#f0f0f0", fontWeight: "bold", width: "20px" }}>D</td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 8px", width: "60px" }}>
                <div style={{ fontSize: "9px", color: "#666" }}>Jahr – Année</div>
                <strong>{annee}</strong>
              </td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 4px", background: "#f0f0f0", fontWeight: "bold", width: "20px" }}>E</td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 8px" }}>
                <div style={{ fontSize: "9px", color: "#666" }}>von – du – dal / bis – au – al</div>
                <strong>{dateDebut} — {dateFin}</strong>
              </td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 4px", background: "#f0f0f0", fontWeight: "bold", width: "20px" }}>F</td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 8px", width: "100px", fontSize: "9px", color: "#666" }}>
                Transport gratuit domicile ↔ travail : ☐
              </td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 4px", background: "#f0f0f0", fontWeight: "bold", width: "20px" }}>G</td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 8px", fontSize: "9px", color: "#666" }}>
                Repas cantine / chèques-repas : ☐
              </td>
            </tr>
          </tbody>
        </table>

        {/* H — Employeur + Employé */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "6px" }}>
          <tbody>
            <tr>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 4px", background: "#f0f0f0", fontWeight: "bold", width: "20px", verticalAlign: "top" }}>H</td>
              <td style={{ border: "0.5px solid #aaa", padding: "6px 8px", width: "50%" }}>
                <div style={{ fontSize: "9px", color: "#666", marginBottom: "2px" }}>EMPLOYEUR</div>
                <strong>La Dogosphère Sàrl</strong><br/>
                Pension canine<br/>
                Sion, Valais<br/>
                ladogosphere@gmail.com
              </td>
              <td style={{ border: "0.5px solid #aaa", padding: "6px 8px" }}>
                <div style={{ fontSize: "9px", color: "#666", marginBottom: "2px" }}>EMPLOYÉ(E)</div>
                <strong>{employe.prenom} {employe.nom}</strong><br/>
                {employe.adresse && <>{employe.adresse}<br/></>}
                {employe.date_naissance && (
                  <span style={{ fontSize: "9px", color: "#666" }}>
                    Né(e) le : {new Date(employe.date_naissance).toLocaleDateString("fr-CH")}<br/>
                  </span>
                )}
                {employe.poste === "Autre" ? employe.poste_autre : employe.poste} — {employe.taux_travail}%
              </td>
            </tr>
          </tbody>
        </table>

        {/* Note francs entiers */}
        <div style={{ textAlign: "right", fontSize: "9px", color: "#666", marginBottom: "3px" }}>
          Que des montants entiers en CHF
        </div>

        {/* Cases 1 à 15 */}
        <table className="cs-table">
          <tbody>

            {/* Case 1 */}
            <tr>
              <td className="cs-num">1.</td>
              <td className="cs-label">
                Salaire (ne concerne pas les chiffres 2 à 7 ci-dessous) / Rente
                <div className="cs-sub">Lohn soweit nicht unter Ziffer 2–7 aufzuführen / Rente</div>
              </td>
              <td className="cs-amount">{s(totalBrut)}</td>
            </tr>

            {/* Case 2 */}
            <tr>
              <td className="cs-num">2.</td>
              <td className="cs-label cs-section" colSpan={2}>Prestations salariales accessoires / Gehaltsnebenleistungen</td>
            </tr>
            <tr>
              <td className="cs-num">2.1</td>
              <td className="cs-label">Pension, logement – Verpflegung, Unterkunft +</td>
              <td className="cs-amount">0</td>
            </tr>
            <tr>
              <td className="cs-num">2.2</td>
              <td className="cs-label">Part privée voiture de service – Privatanteil Geschäftsfahrzeug +</td>
              <td className="cs-amount">0</td>
            </tr>
            <tr>
              <td className="cs-num">2.3</td>
              <td className="cs-label">Autres – Andere +</td>
              <td className="cs-amount">0</td>
            </tr>

            {/* Case 3 */}
            <tr>
              <td className="cs-num">3.</td>
              <td className="cs-label">Prestations non périodiques – Unregelmässige Leistungen +</td>
              <td className="cs-amount">0</td>
            </tr>

            {/* Case 4 */}
            <tr>
              <td className="cs-num">4.</td>
              <td className="cs-label">Prestations en capital – Kapitalleistungen +</td>
              <td className="cs-amount">0</td>
            </tr>

            {/* Case 5 */}
            <tr>
              <td className="cs-num">5.</td>
              <td className="cs-label">Droits de participation selon annexe – Beteiligungsrechte gemäss Beiblatt +</td>
              <td className="cs-amount">0</td>
            </tr>

            {/* Case 6 */}
            <tr>
              <td className="cs-num">6.</td>
              <td className="cs-label">Indemnités membres administration – Verwaltungsratsentschädigungen +</td>
              <td className="cs-amount">0</td>
            </tr>

            {/* Case 7 */}
            <tr>
              <td className="cs-num">7.</td>
              <td className="cs-label">Autres prestations – Andere Leistungen +</td>
              <td className="cs-amount">0</td>
            </tr>

            {/* Case 8 — Total brut */}
            <tr className="cs-total">
              <td className="cs-num">8.</td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 6px", fontWeight: "bold" }}>
                Salaire brut total / Rente = (cases 1 à 7)
                <div className="cs-sub">Bruttolohn total / Rente</div>
              </td>
              <td className="cs-amount" style={{ border: "0.5px solid #aaa", fontWeight: "bold" }}>{s(totalBrut)}</td>
            </tr>

            {/* Case 9 */}
            <tr>
              <td className="cs-num">9.</td>
              <td className="cs-label">
                Cotisations AVS/AI/APG/AC/AANP −
                <div className="cs-sub">Beiträge AHV/IV/EO/ALV/NBUV</div>
                {avs_ai_apg > 0 && <div className="cs-sub">AVS/AI/APG: {s(avs_ai_apg)} | AC: {s(ac)} | AANP: {s(aanp)}</div>}
              </td>
              <td className="cs-amount" style={{ color: "red" }}>-{s(case9)}</td>
            </tr>

            {/* Case 10 */}
            <tr>
              <td className="cs-num">10.</td>
              <td className="cs-label cs-section" colSpan={2}>
                Prévoyance professionnelle 2e pilier – Berufliche Vorsorge 2. Säule
              </td>
            </tr>
            <tr>
              <td className="cs-num">10.1</td>
              <td className="cs-label">Cotisations ordinaires – Ordentliche Beiträge −</td>
              <td className="cs-amount" style={{ color: "red" }}>-{s(case10_1)}</td>
            </tr>
            <tr>
              <td className="cs-num">10.2</td>
              <td className="cs-label">Cotisations pour le rachat – Beiträge für den Einkauf −</td>
              <td className="cs-amount">0</td>
            </tr>

            {/* Case 11 — Net */}
            <tr style={{ background: "#d0e8d0" }}>
              <td className="cs-num">11.</td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 6px", fontWeight: "bold" }}>
                ➡ Salaire net / Rente = (case 8 − cases 9 et 10)
                <div className="cs-sub">Nettolohn / Rente — À reporter sur la déclaration d'impôt</div>
              </td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 6px", textAlign: "right", fontWeight: "bold", fontSize: "12px", color: "#1B2B5E" }}>
                {s(totalNet)}
              </td>
            </tr>

            {/* Case 12 */}
            <tr>
              <td className="cs-num">12.</td>
              <td className="cs-label">Retenue impôt à la source – Quellensteuerabzug</td>
              <td className="cs-amount">0</td>
            </tr>

            {/* Case 13 */}
            <tr>
              <td className="cs-num">13.</td>
              <td className="cs-label cs-section" colSpan={2}>
                Allocations pour frais (non comprises dans salaire brut case 8) – Spesenvergütungen
              </td>
            </tr>
            <tr>
              <td className="cs-num">13.1.1</td>
              <td className="cs-label">Voyage, repas, nuitées – Reise, Verpflegung, Übernachtung</td>
              <td className="cs-amount">0</td>
            </tr>
            <tr>
              <td className="cs-num">13.1.2</td>
              <td className="cs-label">Autres frais effectifs – Übrige effektive Spesen</td>
              <td className="cs-amount">0</td>
            </tr>
            <tr>
              <td className="cs-num">13.2.1</td>
              <td className="cs-label">Représentation forfaitaire – Pauschalspesen Repräsentation</td>
              <td className="cs-amount">0</td>
            </tr>
            <tr>
              <td className="cs-num">13.2.2</td>
              <td className="cs-label">Voiture forfaitaire – Pauschalspesen Auto</td>
              <td className="cs-amount">0</td>
            </tr>
            <tr>
              <td className="cs-num">13.2.3</td>
              <td className="cs-label">Autres frais forfaitaires – Übrige Pauschalspesen</td>
              <td className="cs-amount">0</td>
            </tr>
            <tr>
              <td className="cs-num">13.3</td>
              <td className="cs-label">Contributions perfectionnement – Beiträge an die Weiterbildung</td>
              <td className="cs-amount">0</td>
            </tr>

            {/* Case 14 */}
            <tr>
              <td className="cs-num">14.</td>
              <td className="cs-label">Autres prestations accessoires – Weitere Gehaltsnebenleistungen</td>
              <td className="cs-amount">0</td>
            </tr>

            {/* Case 15 — Remarques */}
            <tr>
              <td className="cs-num">15.</td>
              <td className="cs-label" colSpan={2}>
                <strong>Observations – Bemerkungen :</strong>
                {ijm > 0 && <span> | Cotisation IJM (maladie) : CHF {s(ijm)}</span>}
                {employe.taux_travail < 100 && <span> | Taux d'occupation : {employe.taux_travail}%</span>}
                {fiches && fiches.length < 12 && <span> | Mois couverts : {fiches.length}/12</span>}
              </td>
            </tr>

          </tbody>
        </table>

        {/* Signature */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "8px" }}>
          <tbody>
            <tr>
              <td style={{ border: "0.5px solid #aaa", padding: "4px 8px", width: "20px", background: "#f0f0f0", fontWeight: "bold", verticalAlign: "top" }}>I</td>
              <td style={{ border: "0.5px solid #aaa", padding: "6px 8px", width: "40%" }}>
                <div style={{ fontSize: "9px", color: "#666" }}>Lieu et date – Ort und Datum</div>
                <strong>Sion, {dateGeneration}</strong>
              </td>
              <td style={{ border: "0.5px solid #aaa", padding: "6px 8px", width: "25%", fontSize: "9px", color: "#666" }}>
                Certifié exact et complet<br/>
                y.c. adresse et n° tél. de l'employeur<br/>
                <em>(Die Richtigkeit und Vollständigkeit bestätigt)</em>
              </td>
              <td style={{ border: "0.5px solid #aaa", padding: "6px 8px", fontSize: "10px" }}>
                <strong>La Dogosphère Sàrl</strong><br/>
                Sabrina Jean<br/>
                Sion, Valais<br/>
                ladogosphere@gmail.com
              </td>
            </tr>
          </tbody>
        </table>

        {/* Pied */}
        <div style={{ textAlign: "right", fontSize: "8px", color: "#aaa", marginTop: "4px" }}>
          Form. 11 df 605.040.18N — Certificat de salaire {annee}
        </div>

      </div>
    </>
  );
}