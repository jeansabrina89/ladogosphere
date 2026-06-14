import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const LABELS: Record<string, string> = {
  travail:   "T",
  repos:     "R",
  vacances:  "V",
  maladie:   "M",
  accident:  "Acc",
  militaire: "Mil",
  ferie:     "F",
  autre:     "A",
};

const NOMS_MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
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
  const head = [["Employé", ...jours.map(String)]];
  const body = employesList.map(([id, nom]) => {
    const row: string[] = [nom];
    jours.forEach(d => {
      const dateStr = `${annee}-${String(mois).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const s = idx[id]?.[dateStr] ?? "";
      row.push(s ? (LABELS[s] ?? s) : "");
    });
    return row;
  });

  const legende = Object.entries(LABELS)
    .map(([k, v]) => `${v} = ${k}`)
    .join("   ");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Planning équipe — ${NOMS_MOIS[mois - 1]} ${annee}`, 14, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(legende, 14, 20);

  autoTable(doc, {
    head,
    body,
    startY: 25,
    styles: { fontSize: 6.5, cellPadding: 1.5, halign: "center" },
    headStyles: { fillColor: [27, 43, 94], textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { halign: "left", cellWidth: 38 } },
    alternateRowStyles: { fillColor: [245, 240, 232] },
  });

  doc.save(`planning-equipe-${annee}-${String(mois).padStart(2, "0")}.pdf`);
}
