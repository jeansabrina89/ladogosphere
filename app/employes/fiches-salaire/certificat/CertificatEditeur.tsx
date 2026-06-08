"use client";

import { useState } from "react";
import Link from "next/link";

type Props = {
  annee: number;
  employe: any;
  dateDebut: string;
  totalBrut: number;
  totalNet: number;
  avs_ai_apg: number;
  ac: number;
  aanp: number;
  lpp_ordinaire: number;
  ijm: number;
  remarquesInitiales: string;
  isAdmin: boolean;
};

export default function CertificatEditeur({
  annee, employe, dateDebut,
  totalBrut, totalNet, avs_ai_apg, ac, aanp, lpp_ordinaire, ijm,
  remarquesInitiales, isAdmin,
}: Props) {

  const dateFin = `31.12.${annee}`;
  const dateGeneration = new Date().toLocaleDateString("fr-CH");
  const case9 = avs_ai_apg + ac + aanp;

  // Cases éditables
  const [c1, setC1] = useState(totalBrut);
  const [c21, setC21] = useState(0);
  const [c22, setC22] = useState(0);
  const [c23, setC23] = useState(0);
  const [c23genre, setC23genre] = useState("");
  const [c3, setC3] = useState(0);
  const [c3genre, setC3genre] = useState("");
  const [c4, setC4] = useState(0);
  const [c4genre, setC4genre] = useState("");
  const [c5, setC5] = useState(0);
  const [c6, setC6] = useState(0);
  const [c7, setC7] = useState(0);
  const [c7genre, setC7genre] = useState("");
  const [c9, setC9] = useState(case9);
  const [c101, setC101] = useState(lpp_ordinaire);
  const [c102, setC102] = useState(0);
  const [c12, setC12] = useState(0);
  const [c1311, setC1311] = useState(0);
  const [c1312, setC1312] = useState(0);
  const [c1312genre, setC1312genre] = useState("");
  const [c1321, setC1321] = useState(0);
  const [c1322, setC1322] = useState(0);
  const [c1323, setC1323] = useState(0);
  const [c1323genre, setC1323genre] = useState("");
  const [c133, setC133] = useState(0);
  const [c14, setC14] = useState(0);
  const [c14genre, setC14genre] = useState("");
  const [c15, setC15] = useState(remarquesInitiales);
  const [cF, setCF] = useState(false);
  const [cG, setCG] = useState(false);

  // Calculs automatiques
  const c8 = c1 + c21 + c22 + c23 + c3 + c4 + c5 + c6 + c7;
  const c11 = c8 - c9 - c101 - c102;

  const s = (n: number) => Math.round(n) === 0 ? "0" : Math.round(n).toLocaleString("fr-CH");

  const inputStyle = {
    border: "none",
    borderBottom: "1px dashed #4AAEA0",
    background: "transparent",
    width: "100%",
    fontSize: "10px",
    padding: "1px 2px",
    outline: "none",
  };

  const amountInputStyle = {
    border: "none",
    borderBottom: "1px dashed #4AAEA0",
    background: "transparent",
    width: "80px",
    fontSize: "10px",
    textAlign: "right" as const,
    padding: "1px 2px",
    outline: "none",
    fontWeight: "bold",
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print { display: none !important; }
          nav { display: none !important; }
          header { display: none !important; }
          body { background: white !important; margin: 0; }
          @page { margin: 0.8cm; size: A4; }
          input { border: none !important; border-bottom: none !important; }
          .edit-hint { display: none !important; }
        }
        body { font-family: Arial, sans-serif; font-size: 10px; }
        .cs-table { width: 100%; border-collapse: collapse; }
        .cs-table td { border: 0.5px solid #aaa; padding: 2px 6px; vertical-align: middle; font-size: 10px; }
        .cs-num { width: 28px; font-weight: bold; text-align: right; background: #f0f0f0; }
        .cs-amount { width: 90px; text-align: right; font-weight: bold; }
        .cs-label { color: #333; }
        .cs-sub { font-size: 9px; color: #555; }
        .cs-section { background: #e8e8e8; font-weight: bold; font-size: 10px; }
        .cs-total { background: #d0d0d0; font-weight: bold; }
      `}} />

      {/* Barre d'outils */}
      <div className="no-print p-4 flex gap-3 items-center" style={{ backgroundColor: "#F5F0E8" }}>
        <button onClick={() => window.print()}
          className="px-6 py-2 rounded-xl font-semibold text-white text-sm"
          style={{ backgroundColor: "#1B2B5E" }}>
          🖨️ Imprimer / PDF
        </button>
        <Link href="/employes/fiches-salaire"
          className="px-4 py-2 rounded-xl font-semibold text-sm"
          style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
          ← Retour
        </Link>
        <span className="edit-hint text-sm text-gray-500 ml-2">
          ✏️ Tous les montants sont modifiables — les totaux se recalculent automatiquement
        </span>
      </div>

      <div style={{ maxWidth: "740px", margin: "0 auto", background: "white", padding: "20px", fontFamily: "Arial, sans-serif", fontSize: "10px" }}>

        {/* A/B */}
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
                <div style={{ fontSize: "9px", color: "#666" }}>von – du / bis – au</div>
                <strong>{dateDebut} — {dateFin}</strong>
              </td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 4px", background: "#f0f0f0", fontWeight: "bold", width: "20px" }}>F</td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 8px", width: "110px", fontSize: "9px" }}>
                <label style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                  <input type="checkbox" checked={cF} onChange={e => setCF(e.target.checked)} />
                  Transport gratuit domicile ↔ travail
                </label>
              </td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 4px", background: "#f0f0f0", fontWeight: "bold", width: "20px" }}>G</td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 8px", fontSize: "9px" }}>
                <label style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                  <input type="checkbox" checked={cG} onChange={e => setCG(e.target.checked)} />
                  Repas cantine / chèques-repas
                </label>
              </td>
            </tr>
          </tbody>
        </table>

        {/* H */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "6px" }}>
          <tbody>
            <tr>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 4px", background: "#f0f0f0", fontWeight: "bold", width: "20px", verticalAlign: "top" }}>H</td>
              <td style={{ border: "0.5px solid #aaa", padding: "6px 8px", width: "50%" }}>
                <div style={{ fontSize: "9px", color: "#666", marginBottom: "2px" }}>EMPLOYEUR</div>
                <strong>La Dogosphère Sàrl</strong><br/>
                Pension canine — Sion, Valais<br/>
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
                Salaire (ne concerne pas les chiffres 2 à 7) / Rente
                <div className="cs-sub">Lohn soweit nicht unter Ziffer 2–7 aufzuführen</div>
              </td>
              <td className="cs-amount">
                <input type="number" value={c1} onChange={e => setC1(parseInt(e.target.value) || 0)}
                  style={amountInputStyle} />
              </td>
            </tr>

            {/* Case 2 */}
            <tr>
              <td className="cs-num">2.</td>
              <td className="cs-label cs-section" colSpan={2}>Prestations salariales accessoires / Gehaltsnebenleistungen</td>
            </tr>
            <tr>
              <td className="cs-num">2.1</td>
              <td className="cs-label">Pension, logement – Verpflegung, Unterkunft +</td>
              <td className="cs-amount">
                <input type="number" value={c21} onChange={e => setC21(parseInt(e.target.value) || 0)}
                  style={amountInputStyle} />
              </td>
            </tr>
            <tr>
              <td className="cs-num">2.2</td>
              <td className="cs-label">Part privée voiture de service +</td>
              <td className="cs-amount">
                <input type="number" value={c22} onChange={e => setC22(parseInt(e.target.value) || 0)}
                  style={amountInputStyle} />
              </td>
            </tr>
            <tr>
              <td className="cs-num">2.3</td>
              <td className="cs-label">
                Autres – Andere +{" "}
                <input type="text" value={c23genre} onChange={e => setC23genre(e.target.value)}
                  placeholder="Genre..." style={{ ...inputStyle, width: "120px" }} />
              </td>
              <td className="cs-amount">
                <input type="number" value={c23} onChange={e => setC23(parseInt(e.target.value) || 0)}
                  style={amountInputStyle} />
              </td>
            </tr>

            {/* Case 3 */}
            <tr>
              <td className="cs-num">3.</td>
              <td className="cs-label">
                Prestations non périodiques +{" "}
                <input type="text" value={c3genre} onChange={e => setC3genre(e.target.value)}
                  placeholder="Genre..." style={{ ...inputStyle, width: "120px" }} />
              </td>
              <td className="cs-amount">
                <input type="number" value={c3} onChange={e => setC3(parseInt(e.target.value) || 0)}
                  style={amountInputStyle} />
              </td>
            </tr>

            {/* Case 4 */}
            <tr>
              <td className="cs-num">4.</td>
              <td className="cs-label">
                Prestations en capital +{" "}
                <input type="text" value={c4genre} onChange={e => setC4genre(e.target.value)}
                  placeholder="Genre..." style={{ ...inputStyle, width: "120px" }} />
              </td>
              <td className="cs-amount">
                <input type="number" value={c4} onChange={e => setC4(parseInt(e.target.value) || 0)}
                  style={amountInputStyle} />
              </td>
            </tr>

            {/* Case 5 */}
            <tr>
              <td className="cs-num">5.</td>
              <td className="cs-label">Droits de participation selon annexe +</td>
              <td className="cs-amount">
                <input type="number" value={c5} onChange={e => setC5(parseInt(e.target.value) || 0)}
                  style={amountInputStyle} />
              </td>
            </tr>

            {/* Case 6 */}
            <tr>
              <td className="cs-num">6.</td>
              <td className="cs-label">Indemnités membres administration +</td>
              <td className="cs-amount">
                <input type="number" value={c6} onChange={e => setC6(parseInt(e.target.value) || 0)}
                  style={amountInputStyle} />
              </td>
            </tr>

            {/* Case 7 */}
            <tr>
              <td className="cs-num">7.</td>
              <td className="cs-label">
                Autres prestations +{" "}
                <input type="text" value={c7genre} onChange={e => setC7genre(e.target.value)}
                  placeholder="Genre..." style={{ ...inputStyle, width: "120px" }} />
              </td>
              <td className="cs-amount">
                <input type="number" value={c7} onChange={e => setC7(parseInt(e.target.value) || 0)}
                  style={amountInputStyle} />
              </td>
            </tr>

            {/* Case 8 — Total brut calculé auto */}
            <tr className="cs-total">
              <td className="cs-num">8.</td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 6px", fontWeight: "bold" }}>
                Salaire brut total = (cases 1 à 7)
                <div className="cs-sub">Bruttolohn total / Rente</div>
              </td>
              <td className="cs-amount" style={{ border: "0.5px solid #aaa", fontWeight: "bold", color: "#1B2B5E" }}>
                {s(c8)}
              </td>
            </tr>

            {/* Case 9 */}
            <tr>
              <td className="cs-num">9.</td>
              <td className="cs-label">
                Cotisations AVS/AI/APG/AC/AANP −
                <div className="cs-sub">Beiträge AHV/IV/EO/ALV/NBUV</div>
              </td>
              <td className="cs-amount">
                <input type="number" value={c9} onChange={e => setC9(parseInt(e.target.value) || 0)}
                  style={{ ...amountInputStyle, color: "red" }} />
              </td>
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
              <td className="cs-label">Cotisations ordinaires −</td>
              <td className="cs-amount">
                <input type="number" value={c101} onChange={e => setC101(parseInt(e.target.value) || 0)}
                  style={{ ...amountInputStyle, color: "red" }} />
              </td>
            </tr>
            <tr>
              <td className="cs-num">10.2</td>
              <td className="cs-label">Cotisations pour le rachat −</td>
              <td className="cs-amount">
                <input type="number" value={c102} onChange={e => setC102(parseInt(e.target.value) || 0)}
                  style={{ ...amountInputStyle, color: "red" }} />
              </td>
            </tr>

            {/* Case 11 — Net calculé auto */}
            <tr style={{ background: "#d0e8d0" }}>
              <td className="cs-num">11.</td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 6px", fontWeight: "bold" }}>
                ➡ Salaire net = (case 8 − cases 9 et 10) — À reporter sur la déclaration d'impôt
              </td>
              <td style={{ border: "0.5px solid #aaa", padding: "2px 6px", textAlign: "right", fontWeight: "bold", fontSize: "13px", color: "#1B2B5E" }}>
                {s(c11)}
              </td>
            </tr>

            {/* Case 12 */}
            <tr>
              <td className="cs-num">12.</td>
              <td className="cs-label">Retenue impôt à la source – Quellensteuerabzug</td>
              <td className="cs-amount">
                <input type="number" value={c12} onChange={e => setC12(parseInt(e.target.value) || 0)}
                  style={amountInputStyle} />
              </td>
            </tr>

            {/* Case 13 */}
            <tr>
              <td className="cs-num">13.</td>
              <td className="cs-label cs-section" colSpan={2}>
                Allocations pour frais (non comprises dans salaire brut case 8)
              </td>
            </tr>
            <tr>
              <td className="cs-num">13.1.1</td>
              <td className="cs-label">Voyage, repas, nuitées – Reise, Verpflegung, Übernachtung</td>
              <td className="cs-amount">
                <input type="number" value={c1311} onChange={e => setC1311(parseInt(e.target.value) || 0)}
                  style={amountInputStyle} />
              </td>
            </tr>
            <tr>
              <td className="cs-num">13.1.2</td>
              <td className="cs-label">
                Autres frais effectifs{" "}
                <input type="text" value={c1312genre} onChange={e => setC1312genre(e.target.value)}
                  placeholder="Genre..." style={{ ...inputStyle, width: "100px" }} />
              </td>
              <td className="cs-amount">
                <input type="number" value={c1312} onChange={e => setC1312(parseInt(e.target.value) || 0)}
                  style={amountInputStyle} />
              </td>
            </tr>
            <tr>
              <td className="cs-num">13.2.1</td>
              <td className="cs-label">Représentation forfaitaire</td>
              <td className="cs-amount">
                <input type="number" value={c1321} onChange={e => setC1321(parseInt(e.target.value) || 0)}
                  style={amountInputStyle} />
              </td>
            </tr>
            <tr>
              <td className="cs-num">13.2.2</td>
              <td className="cs-label">Voiture forfaitaire</td>
              <td className="cs-amount">
                <input type="number" value={c1322} onChange={e => setC1322(parseInt(e.target.value) || 0)}
                  style={amountInputStyle} />
              </td>
            </tr>
            <tr>
              <td className="cs-num">13.2.3</td>
              <td className="cs-label">
                Autres frais forfaitaires{" "}
                <input type="text" value={c1323genre} onChange={e => setC1323genre(e.target.value)}
                  placeholder="Genre..." style={{ ...inputStyle, width: "100px" }} />
              </td>
              <td className="cs-amount">
                <input type="number" value={c1323} onChange={e => setC1323(parseInt(e.target.value) || 0)}
                  style={amountInputStyle} />
              </td>
            </tr>
            <tr>
              <td className="cs-num">13.3</td>
              <td className="cs-label">Contributions perfectionnement</td>
              <td className="cs-amount">
                <input type="number" value={c133} onChange={e => setC133(parseInt(e.target.value) || 0)}
                  style={amountInputStyle} />
              </td>
            </tr>

            {/* Case 14 */}
            <tr>
              <td className="cs-num">14.</td>
              <td className="cs-label">
                Autres prestations accessoires{" "}
                <input type="text" value={c14genre} onChange={e => setC14genre(e.target.value)}
                  placeholder="Genre..." style={{ ...inputStyle, width: "100px" }} />
              </td>
              <td className="cs-amount">
                <input type="number" value={c14} onChange={e => setC14(parseInt(e.target.value) || 0)}
                  style={amountInputStyle} />
              </td>
            </tr>

            {/* Case 15 */}
            <tr>
              <td className="cs-num">15.</td>
              <td colSpan={2} style={{ border: "0.5px solid #aaa", padding: "2px 6px" }}>
                <strong>Observations – Bemerkungen :</strong>{" "}
                <input type="text" value={c15} onChange={e => setC15(e.target.value)}
                  style={{ ...inputStyle, width: "80%" }}
                  placeholder="Observations..." />
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
                y.c. adresse et n° tél. de l'employeur
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

        <div style={{ textAlign: "right", fontSize: "8px", color: "#aaa", marginTop: "4px" }}>
          Form. 11 df 605.040.18N — Certificat de salaire {annee}
        </div>

      </div>
    </>
  );
}