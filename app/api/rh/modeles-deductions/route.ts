import { NextRequest, NextResponse } from "next/server";
import { lireCorpsJson } from "@/src/lib/corpsRequete";
import { createClient } from "@/src/utils/supabase/server";
import { exigerPersonnel } from "@/src/lib/apiAuth";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;
  const lecture = await lireCorpsJson(req);
  if (!lecture.ok) return lecture.reponse;
  const body = lecture.corps;
  const { data: modele, error } = await supabase
    .from("modeles_deductions").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ modele });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;
  const lecture2 = await lireCorpsJson(req);
  if (!lecture2.ok) return lecture2.reponse;
  const { id, ...body } = lecture2.corps;
  const { error } = await supabase
    .from("modeles_deductions").update(body).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;
  const id = req.nextUrl.searchParams.get("id");
  const { error } = await supabase
    .from("modeles_deductions").delete().eq("id", id!);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}