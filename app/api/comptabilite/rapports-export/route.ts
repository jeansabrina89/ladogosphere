import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { construireRapport } from "@/src/lib/rapportsCompta";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest) {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return new NextResponse("Non autorise", { status: 401 });
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return new NextResponse("Acces refuse", { status: 403 });

  const { searchParams } = new URL(req.url);
  const annee = searchParams.get("annee") ?? String(new Date().getFullYear());

  const { data: comptes } = await supabaseAdmin.from("comptes").select("numero, libelle, type").order("numero");
  const { data: ecrituresAnnee } = await supabaseAdmin
    .from("ecritures")
    .select("date_ecriture, libelle, piece_type, ecritures_lignes (compte_numero, debit, credit)")
    .gte("date_ecriture", `${annee}-01-01`)
    .lte("date_ecriture", `${annee}-12-31`)
    .order("date_ecriture", { ascending: true })
    .order("created_at", { ascending: true });
  const { data: ecrituresAnterieures } = await supabaseAdmin
    .from("ecritures")
    .select("date_ecriture, libelle, piece_type, ecritures_lignes (compte_numero, debit, credit)")
    .lt("date_ecriture", `${annee}-01-01`);
  const { data: exercice } = await supabaseAdmin
    .from("exercices").select("statut").eq("annee", parseInt(annee)).maybeSingle();

  const rap = construireRapport({
    comptes: (comptes ?? []) as any,
    ecrituresAnnee: (ecrituresAnnee ?? []) as any,
    ecrituresAnterieures: (ecrituresAnterieures ?? []) as any,
    exerciceCloture: exercice?.statut === "cloture",
  });

  const wb = XLSX.utils.book_new();

  const cr: any[][] = [["Compte de resultat", annee], [], ["Produits", ""]];
  for (const p of rap.produits) cr.push([`${p.numero} ${p.libelle}`, p.montant]);
  cr.push(["Total produits", rap.totalProduits], [], ["Charges", ""]);
  for (const c of rap.charges) cr.push([`${c.numero} ${c.libelle}`, c.montant]);
  cr.push(["Total charges", rap.totalCharges], [], ["Resultat de l exercice", rap.resultat]);
  const wsCR = XLSX.utils.aoa_to_sheet(cr);
  wsCR["!cols"] = [{ wch: 40 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsCR, "Compte de resultat");

  const bi: any[][] = [["Bilan", annee], ["(report a nouveau inclus)", ""], [], ["Actif", ""]];
  for (const a of rap.actifs) bi.push([`${a.numero} ${a.libelle}`, a.montant]);
  bi.push(["Total actif", rap.totalActif], [], ["Passif", ""]);
  for (const p of rap.passifs) bi.push([`${p.numero} ${p.libelle}`, p.montant]);
  if (!rap.exerciceCloture) bi.push(["Resultat de l exercice", rap.resultatAuBilan]);
  bi.push(["Total passif", rap.totalPassif]);
  const wsBI = XLSX.utils.aoa_to_sheet(bi);
  wsBI["!cols"] = [{ wch: 40 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsBI, "Bilan");

  const ba: any[][] = [["Compte", "Libelle", "Debit", "Credit", "Solde"]];
  for (const b of rap.balance) ba.push([b.numero, b.libelle, b.debit, b.credit, b.solde]);
  ba.push(["", "TOTAUX", rap.totalDebit, rap.totalCredit, Math.round((rap.totalDebit - rap.totalCredit) * 100) / 100]);
  const wsBA = XLSX.utils.aoa_to_sheet(ba);
  wsBA["!cols"] = [{ wch: 10 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsBA, "Balance");

  const gl: any[][] = [["Compte", "Date", "Ecriture", "Debit", "Credit", "Solde"]];
  for (const g of rap.grandLivre) {
    gl.push([`${g.numero} ${g.libelle}`, "", "", "", "", ""]);
    if (g.ouverture !== 0) gl.push(["", "", "A nouveau (report)", "", "", g.ouverture]);
    for (const m of g.mvts) {
      gl.push(["", m.date, m.libelle, m.debit || "", m.credit || "", m.solde]);
    }
  }
  const wsGL = XLSX.utils.aoa_to_sheet(gl);
  wsGL["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 34 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsGL, "Grand-livre");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rapports-comptables-${annee}.xlsx"`,
    },
  });
}
