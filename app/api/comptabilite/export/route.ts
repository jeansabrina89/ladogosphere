import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import * as XLSX from "xlsx";
import { exigerPersonnel } from "@/src/lib/apiAuth";
import { lireParametresTVA, ventilerTVA } from "@/src/lib/tva";

type Ligne = {
  "Date": string;
  "Pièce": string;
  "Client": string;
  "Libellé": string;
  "Mode": string;
  "Montant TTC": number;
  "HT": number;
  "TVA": number;
};

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;

  const { searchParams } = new URL(req.url);
  const mois = searchParams.get("mois");
  const annee = searchParams.get("annee") ?? new Date().getFullYear().toString();

  const debut = mois
    ? `${annee}-${mois.padStart(2, "0")}-01`
    : `${annee}-01-01`;
  const fin = mois
    ? new Date(parseInt(annee), parseInt(mois), 0).toISOString().split("T")[0]
    : `${annee}-12-31`;

  const paramsTV = await lireParametresTVA(supabase);

  // Source A — encaissements de réservations (filtrés par date_paiement)
  const { data: reservations } = await supabase
    .from("reservations")
    .select(`
      numero, date_paiement, montant_paye, mode_paiement,
      clients (prenom, nom),
      facture_reservations (factures (numero, statut))
    `)
    .not("date_paiement", "is", null)
    .gt("montant_paye", 0)
    .gte("date_paiement", debut)
    .lte("date_paiement", fin);

  // Source B — cotisations payées (filtrées par date_paiement)
  const { data: cotisations } = await supabase
    .from("cotisations_membres")
    .select(`montant, date_paiement, mode_paiement, clients (prenom, nom)`)
    .eq("statut", "payee")
    .not("date_paiement", "is", null)
    .gte("date_paiement", debut)
    .lte("date_paiement", fin);

  const lignes: Ligne[] = [];

  for (const res of reservations ?? []) {
    const c = res.clients as { prenom?: string; nom?: string } | null;
    const client = `${c?.prenom ?? ""} ${c?.nom ?? ""}`.trim();
    const facResas = (res.facture_reservations ?? []) as { factures: { numero: string; statut: string } | null }[];
    const factureActive = facResas.map(fr => fr.factures).find(f => f && f.statut !== "annulee");
    const piece = factureActive?.numero ?? `Résa #${res.numero}`;
    const montant = Number(res.montant_paye ?? 0);
    const dateISO = (res.date_paiement as string).split("T")[0];
    const v = ventilerTVA(montant, dateISO, paramsTV);
    lignes.push({
      "Date": dateISO,
      "Pièce": piece,
      "Client": client,
      "Libellé": `Pension chien(s) — ${client}`,
      "Mode": res.mode_paiement || "—",
      "Montant TTC": v.ttc,
      "HT": v.ht,
      "TVA": v.tva,
    });
  }

  for (const cot of cotisations ?? []) {
    const c = cot.clients as { prenom?: string; nom?: string } | null;
    const client = `${c?.prenom ?? ""} ${c?.nom ?? ""}`.trim();
    const montant = Number(cot.montant ?? 0);
    const dateISO = (cot.date_paiement as string).split("T")[0];
    const v = ventilerTVA(montant, dateISO, paramsTV);
    lignes.push({
      "Date": dateISO,
      "Pièce": "Adhésion",
      "Client": client,
      "Libellé": `Cotisation membre — ${client}`,
      "Mode": cot.mode_paiement || "—",
      "Montant TTC": v.ttc,
      "HT": v.ht,
      "TVA": v.tva,
    });
  }

  lignes.sort((a, b) => a["Date"].localeCompare(b["Date"]));

  const totalTTC = lignes.reduce((s, l) => s + l["Montant TTC"], 0);
  const totalHT  = lignes.reduce((s, l) => s + l["HT"], 0);
  const totalTVA = lignes.reduce((s, l) => s + l["TVA"], 0);
  lignes.push({
    "Date": "",
    "Pièce": "",
    "Client": "",
    "Libellé": "TOTAL",
    "Mode": "",
    "Montant TTC": Math.round(totalTTC * 100) / 100,
    "HT": Math.round(totalHT * 100) / 100,
    "TVA": Math.round(totalTVA * 100) / 100,
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(lignes);
  ws["!cols"] = [
    { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 32 },
    { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Journal encaissements");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const nomFichier = mois
    ? `journal-encaissements-${annee}-${mois.padStart(2, "0")}.xlsx`
    : `journal-encaissements-${annee}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomFichier}"`,
    },
  });
}
