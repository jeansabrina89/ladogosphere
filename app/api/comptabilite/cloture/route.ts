import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Acces reserve a l administration." }, { status: 403 });

  let body: { annee?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Requete invalide." }, { status: 400 }); }
  const annee = Number(body.annee);
  if (!annee || !Number.isInteger(annee)) return NextResponse.json({ error: "Annee invalide." }, { status: 400 });

  const anneeCourante = new Date().getFullYear();
  if (annee >= anneeCourante) {
    return NextResponse.json({ error: "On ne peut cloturer qu un exercice ecoule (annee passee)." }, { status: 400 });
  }

  // Deja cloture ?
  const { data: exExist } = await supabaseAdmin.from("exercices").select("statut").eq("annee", annee).maybeSingle();
  if (exExist?.statut === "cloture") {
    return NextResponse.json({ error: `L exercice ${annee} est deja cloture.` }, { status: 400 });
  }

  // Cloture sequentielle : l annee precedente doit etre cloturee si elle contient des ecritures
  const { count: nbPrec } = await supabaseAdmin
    .from("ecritures")
    .select("id", { count: "exact", head: true })
    .gte("date_ecriture", `${annee - 1}-01-01`)
    .lte("date_ecriture", `${annee - 1}-12-31`);
  if ((nbPrec ?? 0) > 0) {
    const { data: exPrec } = await supabaseAdmin.from("exercices").select("statut").eq("annee", annee - 1).maybeSingle();
    if (exPrec?.statut !== "cloture") {
      return NextResponse.json({ error: `Cloture d abord l exercice ${annee - 1}.` }, { status: 400 });
    }
  }

  // Soldes des comptes de produits / charges de l annee (hors eventuelle ecriture de cloture)
  const { data: ecr } = await supabaseAdmin
    .from("ecritures")
    .select("piece_type, ecritures_lignes (compte_numero, debit, credit)")
    .gte("date_ecriture", `${annee}-01-01`)
    .lte("date_ecriture", `${annee}-12-31`);
  const { data: comptes } = await supabaseAdmin.from("comptes").select("numero, type");
  const typeDe = new Map((comptes ?? []).map((c: any) => [c.numero, c.type]));

  const pl = new Map<string, { debit: number; credit: number }>();
  for (const e of (ecr ?? []) as any[]) {
    if (e.piece_type === "cloture") continue;
    for (const l of (e.ecritures_lignes ?? []) as any[]) {
      const t = typeDe.get(l.compte_numero);
      if (t !== "produit" && t !== "charge") continue;
      if (!pl.has(l.compte_numero)) pl.set(l.compte_numero, { debit: 0, credit: 0 });
      const a = pl.get(l.compte_numero)!;
      a.debit += Number(l.debit) || 0;
      a.credit += Number(l.credit) || 0;
    }
  }

  const lignes: { compte: string; debit: number; credit: number }[] = [];
  let totalProduits = 0;
  let totalCharges = 0;
  for (const [numero, v] of pl) {
    const t = typeDe.get(numero);
    if (t === "produit") {
      const solde = r2(v.credit - v.debit);
      if (Math.abs(solde) < 0.005) continue;
      totalProduits = r2(totalProduits + solde);
      if (solde > 0) lignes.push({ compte: numero, debit: solde, credit: 0 });
      else lignes.push({ compte: numero, debit: 0, credit: -solde });
    } else if (t === "charge") {
      const solde = r2(v.debit - v.credit);
      if (Math.abs(solde) < 0.005) continue;
      totalCharges = r2(totalCharges + solde);
      if (solde > 0) lignes.push({ compte: numero, debit: 0, credit: solde });
      else lignes.push({ compte: numero, debit: -solde, credit: 0 });
    }
  }
  const resultat = r2(totalProduits - totalCharges);

  // Ligne d equilibre sur 2970 (report a nouveau) : benefice -> credit, perte -> debit
  if (Math.abs(resultat) >= 0.005) {
    if (resultat > 0) lignes.push({ compte: "2970", debit: 0, credit: resultat });
    else lignes.push({ compte: "2970", debit: -resultat, credit: 0 });
  }

  // Passer l ecriture de cloture (l annee est encore ouverte, le verrou ne bloque pas)
  if (lignes.length > 0) {
    const { error: errEcr } = await supabaseAdmin.rpc("passer_ecriture", {
      p_date: `${annee}-12-31`,
      p_libelle: `Cloture exercice ${annee}`,
      p_piece_type: "cloture",
      p_piece_id: null,
      p_lignes: lignes,
    });
    if (errEcr) return NextResponse.json({ error: errEcr.message }, { status: 400 });
  }

  // Marquer l exercice cloture -> le trigger verrouille toute ecriture future sur cette annee
  const { error: errEx } = await supabaseAdmin
    .from("exercices")
    .upsert(
      { annee, statut: "cloture", date_cloture: new Date().toISOString(), cloture_par: user.id, resultat },
      { onConflict: "annee" }
    );
  if (errEx) return NextResponse.json({ error: errEx.message }, { status: 400 });

  return NextResponse.json({ ok: true, resultat });
}
