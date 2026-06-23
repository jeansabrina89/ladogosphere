import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import * as XLSX from "xlsx";

const r2 = (n: number) => Math.round(n * 100) / 100;

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
  const { data: ecritures } = await supabaseAdmin
    .from("ecritures")
    .select("date_ecriture, libelle, ecritures_lignes (compte_numero, debit, credit)")
    .gte("date_ecriture", `${annee}-01-01`)
    .lte("date_ecriture", `${annee}-12-31`)
    .order("date_ecriture", { ascending: true })
    .order("created_at", { ascending: true });

  const meta = new Map((comptes ?? []).map((c: any) => [c.numero, { libelle: c.libelle, type: c.type }]));

  type L = { compte: string; date: string; libelle: string; debit: number; credit: number };
  const lignes: L[] = [];
  for (const e of (ecritures ?? []) as any[]) {
    for (const l of (e.ecritures_lignes ?? []) as any[]) {
      lignes.push({ compte: l.compte_numero, date: e.date_ecriture, libelle: e.libelle, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 });
    }
  }
  const parCompte = new Map<string, { debit: number; credit: number; lignes: L[] }>();
  for (const l of lignes) {
    if (!parCompte.has(l.compte)) parCompte.set(l.compte, { debit: 0, credit: 0, lignes: [] });
    const a = parCompte.get(l.compte)!; a.debit += l.debit; a.credit += l.credit; a.lignes.push(l);
  }
  const balance = [...parCompte.entries()].map(([numero, v]) => ({
    numero, libelle: meta.get(numero)?.libelle ?? "", type: meta.get(numero)?.type ?? "",
    debit: r2(v.debit), credit: r2(v.credit), solde: r2(v.debit - v.credit),
  })).sort((a, b) => a.numero.localeCompare(b.numero));

  const totalDebit = r2(balance.reduce((s, b) => s + b.debit, 0));
  const totalCredit = r2(balance.reduce((s, b) => s + b.credit, 0));
  const produits = balance.filter(b => b.type === "produit").map(b => ({ ...b, montant: r2(b.credit - b.debit) }));
  const charges = balance.filter(b => b.type === "charge").map(b => ({ ...b, montant: r2(b.debit - b.credit) }));
  const totalProduits = r2(produits.reduce((s, p) => s + p.montant, 0));
  const totalCharges = r2(charges.reduce((s, c) => s + c.montant, 0));
  const resultat = r2(totalProduits - totalCharges);
  const actifs = balance.filter(b => b.type === "actif").map(b => ({ ...b, montant: r2(b.debit - b.credit) }));
  const passifs = balance.filter(b => b.type === "passif").map(b => ({ ...b, montant: r2(b.credit - b.debit) }));
  const totalActif = r2(actifs.reduce((s, a) => s + a.montant, 0));
  const totalPassif = r2(passifs.reduce((s, p) => s + p.montant, 0) + resultat);

  const wb = XLSX.utils.book_new();

  const cr: any[][] = [["Compte de resultat", annee], [], ["Produits", ""]];
  for (const p of produits) cr.push([`${p.numero} ${p.libelle}`, p.montant]);
  cr.push(["Total produits", totalProduits], [], ["Charges", ""]);
  for (const c of charges) cr.push([`${c.numero} ${c.libelle}`, c.montant]);
  cr.push(["Total charges", totalCharges], [], ["Resultat de l exercice", resultat]);
  const wsCR = XLSX.utils.aoa_to_sheet(cr);
  wsCR["!cols"] = [{ wch: 40 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsCR, "Compte de resultat");

  const bi: any[][] = [["Bilan", annee], [], ["Actif", ""]];
  for (const a of actifs) bi.push([`${a.numero} ${a.libelle}`, a.montant]);
  bi.push(["Total actif", totalActif], [], ["Passif", ""]);
  for (const p of passifs) bi.push([`${p.numero} ${p.libelle}`, p.montant]);
  bi.push(["Resultat de l exercice", resultat], ["Total passif", totalPassif]);
  const wsBI = XLSX.utils.aoa_to_sheet(bi);
  wsBI["!cols"] = [{ wch: 40 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsBI, "Bilan");

  const ba: any[][] = [["Compte", "Libelle", "Debit", "Credit", "Solde"]];
  for (const b of balance) ba.push([b.numero, b.libelle, b.debit, b.credit, b.solde]);
  ba.push(["", "TOTAUX", totalDebit, totalCredit, r2(totalDebit - totalCredit)]);
  const wsBA = XLSX.utils.aoa_to_sheet(ba);
  wsBA["!cols"] = [{ wch: 10 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsBA, "Balance");

  const gl: any[][] = [["Compte", "Date", "Ecriture", "Debit", "Credit", "Solde"]];
  for (const b of balance) {
    let solde = 0;
    gl.push([`${b.numero} ${b.libelle}`, "", "", "", "", ""]);
    for (const m of (parCompte.get(b.numero)?.lignes ?? [])) {
      solde = r2(solde + m.debit - m.credit);
      gl.push(["", m.date, m.libelle, m.debit || "", m.credit || "", solde]);
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
