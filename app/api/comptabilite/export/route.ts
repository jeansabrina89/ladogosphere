import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../src/utils/supabase/server";
import { formatBoxLabel } from "../../../../src/lib/boxes";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const mois = searchParams.get("mois");
  const annee = searchParams.get("annee");
  const paiement = searchParams.get("paiement");

  let query = supabase
    .from("reservations")
    .select(`
      *,
      clients (prenom, nom, email, telephone, membre),
      boxes (numero, nom),
      reservation_chiens (chiens (nom))
    `)
    .neq("statut", "annulee")
    .order("date_debut", { ascending: true });

  if (mois && annee) {
    const debut = `${annee}-${mois.padStart(2, "0")}-01`;
    const fin = new Date(parseInt(annee), parseInt(mois), 0).toISOString().split("T")[0];
    query = query.gte("date_debut", debut).lte("date_debut", fin);
  }

  if (paiement) {
    query = query.eq("statut_paiement", paiement);
  }

  const { data: reservations } = await query;

  if (!reservations) {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }

  const lignes = reservations.map((res: any) => {
    const chiens = res.reservation_chiens?.map((rc: any) => rc.chiens?.nom).filter(Boolean).join(", ") || "—";
    return {
      "Date début": res.date_debut,
      "Date fin": res.date_fin,
      "Client": `${res.clients?.prenom} ${res.clients?.nom}`,
      "Email": res.clients?.email || "—",
      "Téléphone": res.clients?.telephone || "—",
      "Membre": res.clients?.membre ? "Oui" : "Non",
      "Chien(s)": chiens,
      "Box": formatBoxLabel(res.boxes),
      "Type": res.type_reservation === "journee" ? "Journée" : "Séjour",
      "Urgence": res.urgence ? "Oui" : "Non",
      "Statut réservation": res.statut,
      "Montant facturé (CHF)": res.montant_final || 0,
      "Statut paiement": res.statut_paiement === "paye" ? "Payé" :
                         res.statut_paiement === "partiel" ? "Partiel" : "Impayé",
      "Montant payé (CHF)": res.montant_paye || 0,
      "Reste à payer (CHF)": (res.montant_final || 0) - (res.montant_paye || 0),
      "Mode paiement": res.mode_paiement || "—",
      "Date paiement": res.date_paiement || "—",
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(lignes);

  ws["!cols"] = [
    { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 25 },
    { wch: 15 }, { wch: 8 }, { wch: 20 }, { wch: 8 },
    { wch: 10 }, { wch: 8 }, { wch: 15 }, { wch: 18 },
    { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Réservations");

  const totalFacture = lignes.reduce((s, r) => s + (r["Montant facturé (CHF)"] as number), 0);
  const totalPaye = lignes.reduce((s, r) => s + (r["Montant payé (CHF)"] as number), 0);
  const totalImpaye = totalFacture - totalPaye;

  const labelPaiement = paiement === "paye" ? "Encaissées" :
                        paiement === "partiel" ? "Partielles" :
                        paiement === "impaye" ? "À encaisser" : "Toutes";

  const resume = [
    { "Résumé": `Filtre : ${labelPaiement}` },
    { "Résumé": "Nombre de réservations", " ": lignes.length },
    { "Résumé": "Total facturé (CHF)", " ": totalFacture.toFixed(2) },
    { "Résumé": "Total encaissé (CHF)", " ": totalPaye.toFixed(2) },
    { "Résumé": "Total à encaisser (CHF)", " ": totalImpaye.toFixed(2) },
  ];

  const wsResume = XLSX.utils.json_to_sheet(resume);
  wsResume["!cols"] = [{ wch: 30 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, wsResume, "Résumé");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const labelFichier = paiement ? `_${paiement}` : "";
  const nomFichier = mois && annee
    ? `dogosphere_compta_${annee}_${mois.padStart(2, "0")}${labelFichier}.xlsx`
    : `dogosphere_compta_complet${labelFichier}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomFichier}"`,
    },
  });
}