import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest) {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return new NextResponse("Non autorise", { status: 401 });
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return new NextResponse("Acces refuse", { status: 403 });

  const { searchParams } = new URL(req.url);
  const mois = searchParams.get("mois");
  const annee = searchParams.get("annee") ?? String(new Date().getFullYear());
  const debut = mois ? `${annee}-${mois.padStart(2, "0")}-01` : `${annee}-01-01`;
  const fin = mois ? new Date(parseInt(annee), parseInt(mois), 0).toISOString().split("T")[0] : `${annee}-12-31`;

  const { data: comptes } = await supabaseAdmin.from("comptes").select("numero, libelle");
  const libelleCompte = new Map((comptes ?? []).map((c: any) => [c.numero, c.libelle]));

  const { data: ecritures } = await supabaseAdmin
    .from("ecritures")
    .select("date_ecriture, libelle, ecritures_lignes (compte_numero, debit, credit)")
    .gte("date_ecriture", debut)
    .lte("date_ecriture", fin)
    .order("date_ecriture", { ascending: true })
    .order("created_at", { ascending: true });

  type Ligne = {
    "Date": string; "Ecriture": string; "Compte": string; "Libelle compte": string;
    "Debit": number | string; "Credit": number | string;
  };
  const lignes: Ligne[] = [];
  let totalDebit = 0, totalCredit = 0;
  for (const e of (ecritures ?? []) as any[]) {
    for (const l of (e.ecritures_lignes ?? []) as any[]) {
      const d = Number(l.debit) || 0;
      const c = Number(l.credit) || 0;
      totalDebit += d; totalCredit += c;
      lignes.push({
        "Date": e.date_ecriture,
        "Ecriture": e.libelle,
        "Compte": l.compte_numero,
        "Libelle compte": libelleCompte.get(l.compte_numero) ?? "",
        "Debit": d ? Math.round(d * 100) / 100 : "",
        "Credit": c ? Math.round(c * 100) / 100 : "",
      });
    }
  }
  lignes.push({
    "Date": "", "Ecriture": "TOTAL", "Compte": "", "Libelle compte": "",
    "Debit": Math.round(totalDebit * 100) / 100,
    "Credit": Math.round(totalCredit * 100) / 100,
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(lignes);
  ws["!cols"] = [{ wch: 12 }, { wch: 34 }, { wch: 10 }, { wch: 26 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, "Journal comptable");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const nomFichier = mois
    ? `journal-comptable-${annee}-${mois.padStart(2, "0")}.xlsx`
    : `journal-comptable-${annee}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomFichier}"`,
    },
  });
}
