import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { exigerPersonnel } from "@/src/lib/apiAuth";
import {
  appliquerCheckin,
  appliquerCheckout,
  annulerCheckin,
  annulerCheckout,
} from "@/src/lib/checkinCheckout";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;
  const { id } = await params;
  const body = await req.json();
  const action = body.action as string | undefined;

  let resultat: { error?: string };
  switch (action) {
    case "checkin":
      resultat = await appliquerCheckin(id);
      break;
    case "checkout":
      resultat = await appliquerCheckout(id);
      break;
    case "annuler_checkin":
      resultat = await annulerCheckin(id);
      break;
    case "annuler_checkout":
      resultat = await annulerCheckout(id);
      break;
    default:
      return NextResponse.json(
        { error: `Action inconnue : "${action}"` },
        { status: 400 }
      );
  }

  if (resultat.error) {
    return NextResponse.json({ error: resultat.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
