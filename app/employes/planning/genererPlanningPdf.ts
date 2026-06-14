import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type RGB = [number, number, number];

interface PdfStatut {
  abbr: string;
  bg: RGB;
  text: RGB;
  label: string;
}

const PDF_STATUTS: Record<string, PdfStatut> = {
  travail:         { abbr: "T",   bg: [232, 245, 244], text: [74,  174, 160], label: "Travail" },
  repos:           { abbr: "R",   bg: [241, 245, 249], text: [107, 114, 128], label: "Repos" },
  vacances:        { abbr: "V",   bg: [254, 249, 195], text: [202, 138,   4], label: "Vacances" },
  absent:          { abbr: "Ab",  bg: [254, 226, 226], text: [220,  38,  38], label: "Absent" },
  maladie:         { abbr: "Ma",  bg: [254, 226, 226], text: [220,  38,  38], label: "Maladie" },
  accident:        { abbr: "Ac",  bg: [254, 226, 226], text: [220,  38,  38], label: "Accident" },
  militaire:       { abbr: "Mi",  bg: [237, 233, 254], text: [124,  58, 237], label: "Militaire" },
  ferie_travaille: { abbr: "F+",  bg: [254, 243, 199], text: [21,  128,  61], label: "Ferie travaille" },
  heures_sup:      { abbr: "HS",  bg: [219, 234, 254], text: [37,   99, 235], label: "Heures sup." },
  autre:           { abbr: "Au",  bg: [241, 245, 249], text: [107, 114, 128], label: "Autre" },
};

const LEGENDE_ORDRE: string[] = [
  "travail", "repos", "vacances", "maladie", "accident",
  "militaire", "ferie_travaille", "absent", "heures_sup", "autre",
];

const NOMS_MOIS = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

export type LignePlanning = {
  employe_id: string;
  nom_complet: string;
  date: string;
  statut: string;
};

export function genererPlanningPdf(lignes: LignePlanning[], mois: number, annee: number) {
  const nbJours = new Date(annee, mois, 0).getDate();

  const employes = new Map<string, string>();
  lignes.forEach(l => {
    if (!employes.has(l.employe_id)) employes.set(l.employe_id, l.nom_complet);
  });
  const employesList = [...employes.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));

  const idx: Record<string, Record<string, string>> = {};
  lignes.forEach(l => {
    if (!idx[l.employe_id]) idx[l.employe_id] = {};
    idx[l.employe_id][l.date] = l.statut;
  });

  const jours = Array.from({ length: nbJours }, (_, i) => i + 1);

  // statusMatrix[rowIdx][colIdx] pour colorer les cellules
  const statusMatrix: string[][] = [];

  const head = [["Employe", ...jours.map(String)]];
  const body = employesList.map(([id, nom]) => {
    const row: string[] = [nom];
    const statusRow: string[] = [];
    jours.forEach(d => {
      const dateStr = `${annee}-${String(mois).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const s = idx[id]?.[dateStr] ?? "";
      row.push(PDF_STATUTS[s]?.abbr ?? "");
      statusRow.push(s);
    });
    statusMatrix.push(statusRow);
    return row;
  });

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(27, 43, 94);
  doc.text(`Planning equipe - ${NOMS_MOIS[mois - 1]} ${annee}`, 14, 14);

  autoTable(doc, {
    head,
    body,
    startY: 20,
    margin: { left: 14, right: 14 },
    styles: { fontSize: 6, cellPadding: 1.2, halign: "center", fontStyle: "bold" },
    headStyles: {
      fillColor: [27, 43, 94] as RGB,
      textColor: [255, 255, 255] as RGB,
      fontStyle: "bold",
      fontSize: 6,
    },
    columnStyles: { 0: { halign: "left", cellWidth: 36, fontStyle: "normal" } },
    didParseCell: (data: any) => {
      if (data.section === "body" && data.column.index > 0) {
        const statut = statusMatrix[data.row.index]?.[data.column.index - 1];
        const pdfSt = statut ? PDF_STATUTS[statut] : undefined;
        if (pdfSt) {
          data.cell.styles.fillColor = pdfSt.bg;
          data.cell.styles.textColor = pdfSt.text;
        } else {
          data.cell.styles.fillColor = [255, 255, 255];
          data.cell.styles.textColor = [200, 200, 200];
        }
      }
    },
    didDrawCell: (data: any) => {
      // Bordure verte sur les jours ferie_travaille pour les distinguer des ferie chomes
      if (data.section === "body" && data.column.index > 0) {
        const statut = statusMatrix[data.row.index]?.[data.column.index - 1];
        if (statut === "ferie_travaille") {
          doc.setDrawColor(21, 128, 61);
          doc.setLineWidth(0.4);
          doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, "S");
        }
      }
    },
  });

  // Légende sous la grille
  const tableDoc = doc as any;
  const finalY: number = (tableDoc.lastAutoTable?.finalY ?? 180) + 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(40, 40, 40);
  doc.text("Legende :", 14, finalY);

  const cols = 4;
  LEGENDE_ORDRE.forEach((statut, i) => {
    const pdfSt = PDF_STATUTS[statut];
    if (!pdfSt) return;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 14 + col * 67;
    const y = finalY + 5 + row * 7;

    // Carré de couleur
    doc.setFillColor(pdfSt.bg[0], pdfSt.bg[1], pdfSt.bg[2]);
    doc.rect(x, y, 4.5, 4, "F");
    doc.setDrawColor(160, 160, 160);
    doc.setLineWidth(0.2);
    doc.rect(x, y, 4.5, 4, "S");

    // Bordure verte pour ferie_travaille
    if (statut === "ferie_travaille") {
      doc.setDrawColor(21, 128, 61);
      doc.setLineWidth(0.5);
      doc.rect(x, y, 4.5, 4, "S");
    }

    // Libellé
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(pdfSt.text[0], pdfSt.text[1], pdfSt.text[2]);
    doc.text(`${pdfSt.abbr}`, x + 1.2, y + 3);
    doc.setTextColor(40, 40, 40);
    doc.text(`- ${pdfSt.label}`, x + 6, y + 3);
  });

  doc.save(`planning-equipe-${annee}-${String(mois).padStart(2, "0")}.pdf`);
}
