import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";

async function estAdmin(supabase: any): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  if (!(await estAdmin(supabase))) {
    return NextResponse.json({ error: "Acces reserve a l administration." }, { status: 403 });
  }

  let body: { date?: string; libelle?: string; lignes?: { compte: string; debit: number; credit: number }[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Requete invalide." }, { status: 400 }); }

  const { date, libelle, lignes } = body;
  if (!date || !libelle || !lignes || lignes.length < 2) {
    return NextResponse.json({ error: "Date, libelle et au moins deux lignes requis." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("passer_ecriture", {
    p_date: date,
    p_libelle: libelle,
    p_piece_type: "manuelle",
    p_piece_id: null,
    p_lignes: lignes,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ecriture_id: data });
}
