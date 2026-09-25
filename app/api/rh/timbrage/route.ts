import { NextRequest, NextResponse } from "next/server";
import { lireCorpsJson } from "@/src/lib/corpsRequete";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerPersonnel, exigerPermissionApi } from "@/src/lib/apiAuth";
import { lireAppelant } from "@/src/lib/garde";

async function getMonEmployeId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("employes_rh").select("id").eq("profile_id", userId).maybeSingle();
  return data?.id ?? null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;

  const lecture = await lireCorpsJson(req);
  if (!lecture.ok) return lecture.reponse;
  const body = lecture.corps;
  const {
    employe_id, date,
    heure_debut_matin, heure_fin_matin,
    heure_debut_aprem, heure_fin_aprem,
    type_absence, note, valide_admin,
  } = body;

  const { data: { user } } = await supabase.auth.getUser();
  const role = (await lireAppelant(supabase))?.role ?? null;

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

  const lecture2 = await lireCorpsJson(req);
  if (!lecture2.ok) return lecture2.reponse;
  const { employe_id, date } = lecture2.corps;
  if (!employe_id || !date)
    return NextResponse.json({ error: "employe_id et date requis" }, { status: 400 });

  const { data: { user } } = await supabase.auth.getUser();
  const role = (await lireAppelant(supabase))?.role ?? null;

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

  const lecture3 = await lireCorpsJson(req);
  if (!lecture3.ok) return lecture3.reponse;
  const { employe_id, mois, valide_admin = true } = lecture3.corps;
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

  const appelant = await lireAppelant(supabase);
  const role = appelant?.role ?? null;

  if (role !== "admin") {
    // Valider un mois est un geste d'équipe : la permission est exigée, même
    // sur son propre mois. Elle ne l'était pas — le chemin « c'est moi »
    // sautait la garde entière, et un employé sans `perm_timbrage_equipe`
    // validait déjà ses propres heures.
    const permGarde = await exigerPermissionApi(supabase, "perm_timbrage_equipe");
    if (permGarde) return permGarde;

    // Et celui qui porte ce droit ne valide pas ce qu'il a lui-même saisi :
    // valider, c'est qu'un autre a regardé. L'administratrice le peut,
    // puisque personne au-dessus d'elle ne le ferait à sa place.
    // Décision de Sabrina, 24 septembre 2026.
    const { data: { user } } = await supabase.auth.getUser();
    const monId = user ? await getMonEmployeId(user.id) : null;
    if (monId && employe_id === monId) {
      return NextResponse.json(
        { error: "Un autre responsable doit valider vos propres heures." },
        { status: 403 },
      );
    }
  }

  // Qui valide, et quand. Le valideur vient de la SESSION, jamais du corps de
  // la requête : sinon la trace dirait ce que l'appelant veut qu'elle dise.
  // Dévalider efface les deux : une ligne repassée à « non validée » n'a plus
  // de valideur, et garder l'ancien laisserait croire qu'il l'a voulu ainsi.
  const trace = valide_admin
    ? { valide_par: appelant?.userId ?? null, valide_le: new Date().toISOString() }
    : { valide_par: null, valide_le: null };

  const { error } = await supabaseAdmin
    .from("timbrage")
    .update({ valide_admin, ...trace })
    .eq("employe_id", employe_id)
    .gte("date", dateDebut)
    .lte("date", dateFin);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
