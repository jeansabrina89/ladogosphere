import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { exigerPermissionApi } from "@/src/lib/apiAuth";
import {
  appliquerCheckin,
  appliquerCheckout,
  annulerCheckin,
  annulerCheckout,
  MESSAGE_RESULTAT_ESSAI_REQUIS,
  MESSAGE_FACTURE_NON_EMISE,
} from "@/src/lib/checkinCheckout";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  // Pointer une arrivée ou un départ — et donc saisir le résultat d'une journée
  // d'essai — relève de perm_checkin, pour l'admin comme pour l'employé.
  const garde = await exigerPermissionApi(supabase, "perm_checkin");
  if (garde) return garde;
  const { data: { user } } = await supabase.auth.getUser();
  const { id } = await params;
  const body = await req.json();
  const action = body.action as string | undefined;

  let resultat: { error?: string };
  switch (action) {
    case "checkin":
      resultat = await appliquerCheckin(id);
      break;
    case "checkout":
      resultat = await appliquerCheckout(id, {
        resultat: typeof body.resultat === "string" ? body.resultat : null,
        note: typeof body.note === "string" ? body.note : null,
        profilId: user?.id ?? null,
      });
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
    // Refus métier (résultat d'essai manquant, facture non émise) : 400, pas 500.
    const refusMetier =
      resultat.error === MESSAGE_RESULTAT_ESSAI_REQUIS ||
      resultat.error.startsWith(MESSAGE_FACTURE_NON_EMISE);
    const statut = refusMetier ? 400 : 500;
    return NextResponse.json({ error: resultat.error }, { status: statut });
  }

  return NextResponse.json({ ok: true });
}
