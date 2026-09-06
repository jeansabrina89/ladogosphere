import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { exigerPersonnel } from "@/src/lib/apiAuth";
import { suggererBox } from "@/src/lib/suggestionBox";

/**
 * Suggestion d'un box pour une réservation. La logique vit dans
 * src/lib/suggestionBox.ts afin d'être réutilisable sans HTTP (réservations du
 * personnel). Les box internes en sont exclus : ils ne sont jamais proposés
 * pour un client.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;

  const { chien_ids, date_debut, date_fin, heure_arrivee, heure_depart, type_reservation } =
    await req.json();

  const resultat = await suggererBox({
    chien_ids, date_debut, date_fin, heure_arrivee, heure_depart, type_reservation,
  });

  return NextResponse.json(resultat);
}
