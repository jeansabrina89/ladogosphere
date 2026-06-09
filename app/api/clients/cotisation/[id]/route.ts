import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../../src/lib/supabase";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { date_paiement } = await req.json();

  const { error } = await supabase
    .from("cotisations_membres")
    .update({
      statut: "payee",
      mode_paiement: "virement",
      date_paiement: date_paiement || new Date().toISOString().split("T")[0],
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}