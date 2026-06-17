import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerPersonnel, exigerPermissionApi } from "@/src/lib/apiAuth";

async function getProfileRole(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
  return data?.role ?? null;
}

async function getMonEmployeId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("employes_rh").select("id").eq("profile_id", userId).maybeSingle();
  return data?.id ?? null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;

  const body = await req.json();
  const {
    employe_id, date,
    heure_debut_matin, heure_fin_matin,
    heure_debut_aprem, heure_fin_aprem,
    type_absence, note, valide_admin,
  } = body;

  const { data: { user } } = await supabase.auth.getUser();
  const role = await getProfileRole(supabase, user!.id);

  if (role !== "admin") {
    const monId = await getMonEmployeId(user!.id);
    if (!monId || employe_id !== monId) {
      const permGarde = await exigerPermissionApi(supabase, "perm_timbrage_equipe");
      if (permGarde) return permGarde;
    }
  }

  const ligne: Record<string, unknown> = {
    employe_id, date,
    heure_debut_matin: heure_debut_matin ?? null,
    heure_fin_matin:   heure_fin_matin   ?? null,
    heure_debut_aprem: heure_debut_aprem ?? null,
    heure_fin_aprem:   heure_fin_aprem   ?? null,
    type_absence: type_absence ?? null,
    note: note ?? null,
  };
  // L'admin peut explicitement passer valide_admin ; les non-admins ne peuvent pas
  if (role === "admin" && valide_admin !== undefined) {
    ligne.valide_admin = valide_admin;
  }

  const { error } = await supabaseAdmin
    .from("timbrage").upsert(ligne, { onConflict: "employe_id,date" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;

  const { employe_id, date } = await req.json();
  if (!employe_id || !date)
    return NextResponse.json({ error: "employe_id et date requis" }, { status: 400 });

  const { data: { user } } = await supabase.auth.getUser();
  const role = await getProfileRole(supabase, user!.id);

  if (role !== "admin") {
    const monId = await getMonEmployeId(user!.id);
    if (!monId || employe_id !== monId) {
      const permGarde = await exigerPermissionApi(supabase, "perm_timbrage_equipe");
      if (permGarde) return permGarde;
    }
  }

  const { error } = await supabaseAdmin
    .from("timbrage").delete().eq("employe_id", employe_id).eq("date", date);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;

  const { employe_id, mois, valide_admin = true } = await req.json();
  if (!employe_id || !mois)
    return NextResponse.json({ error: "employe_id et mois requis" }, { status: 400 });

  const [anneeStr, moisStr] = String(mois).split("-");
  const annee  = parseInt(anneeStr);
  const moisNum = parseInt(moisStr);
  if (!annee || !moisNum || moisNum < 1 || moisNum > 12)
    return NextResponse.json({ error: "Format mois invalide (attendu YYYY-MM)" }, { status: 400 });

  const dateDebut = `${annee}-${String(moisNum).padStart(2, "0")}-01`;
  // new Date(annee, moisNum, 0) → dernier jour du mois moisNum
  const dateFin   = new Date(annee, moisNum, 0).toISOString().split("T")[0];

  const { data: { user } } = await supabase.auth.getUser();
  const role = await getProfileRole(supabase, user!.id);

  if (role !== "admin") {
    const monId = await getMonEmployeId(user!.id);
    if (!monId || employe_id !== monId) {
      const permGarde = await exigerPermissionApi(supabase, "perm_timbrage_equipe");
      if (permGarde) return permGarde;
    }
  }

  const { error } = await supabaseAdmin
    .from("timbrage")
    .update({ valide_admin })
    .eq("employe_id", employe_id)
    .gte("date", dateDebut)
    .lte("date", dateFin);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
