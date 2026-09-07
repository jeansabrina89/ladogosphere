import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { exigerPermissionApi } from "@/src/lib/apiAuth";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { libelleCategorie, libelleMode } from "@/src/lib/depensesLogique";
import * as XLSX from "xlsx";

/** Export du journal des dépenses, avec les mêmes filtres que la liste. */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_depenses");
  if (garde) return garde;

  const { searchParams } = new URL(req.url);
  const du = (searchParams.get("du") ?? "").trim();
  const au = (searchParams.get("au") ?? "").trim();
  const compte = (searchParams.get("compte") ?? "").trim();
  const fournisseur = (searchParams.get("fournisseur") ?? "").trim();

  let requete = supabaseAdmin
    .from("depenses")
    .select(`
      numero, date_depense, libelle, montant, compte_charge, mode_paiement,
      date_paiement, statut, exercice, fournisseurs (nom)
    `)
    .order("date_depense", { ascending: true });
  if (du) requete = requete.gte("date_depense", du);
  if (au) requete = requete.lte("date_depense", au);
  if (compte) requete = requete.eq("compte_charge", compte);

  const { data } = await requete;

  const lignes = (data ?? [])
    .map((d) => ({
      d,
      nomFournisseur: (d.fournisseurs as unknown as { nom: string } | null)?.nom ?? "",
    }))
    .filter(({ nomFournisseur }) => !fournisseur || nomFournisseur === fournisseur)
    .map(({ d, nomFournisseur }) => ({
      "Numéro": d.numero ?? "brouillon",
      "Date": d.date_depense,
      "Fournisseur": nomFournisseur,
      "Libellé": d.libelle,
      "Catégorie": libelleCategorie(d.compte_charge),
      "Compte": d.compte_charge,
      "Montant": Number(d.montant),
      "Payé par": libelleMode(d.mode_paiement),
      "Réglée le": d.date_paiement ?? "",
      "Statut": d.statut,
      "Exercice": d.exercice ?? "",
    }));

  const total = lignes.reduce((s, l) => s + Number(l["Montant"]), 0);
  if (lignes.length > 0) {
    lignes.push({
      "Numéro": "", "Date": "", "Fournisseur": "", "Libellé": "TOTAL",
      "Catégorie": "", "Compte": "", "Montant": Math.round(total * 100) / 100,
      "Payé par": "", "Réglée le": "", "Statut": "", "Exercice": "",
    });
  }

  const feuille = XLSX.utils.json_to_sheet(lignes);
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, "Dépenses");
  const buffer = XLSX.write(classeur, { type: "buffer", bookType: "xlsx" });

  const suffixe = du || au ? `-${du || "debut"}_${au || "fin"}` : "";
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="depenses${suffixe}.xlsx"`,
    },
  });
}
