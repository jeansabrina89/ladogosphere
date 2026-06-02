import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../../src/lib/supabase";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { statut_paiement, montant_paye, date_paiement, mode_paiement } = await req.json();

  const { error } = await supabase
    .from("reservations")
    .update({ statut_paiement, montant_paye, date_paiement, mode_paiement })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}