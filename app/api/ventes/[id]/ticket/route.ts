import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { exigerBoutiqueApi } from "@/src/lib/permissions";
import { genererTicket } from "@/src/lib/ticketDocument";

/**
 * Ticket de caisse au format 80 mm, servi tel quel pour l'impression.
 * Il se refabrique à l'identique à chaque fois : la vente ne bouge plus.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const garde = await exigerBoutiqueApi(supabase, "vente");
  if (garde) return garde;

  const { id } = await params;
  const ticket = await genererTicket(id);
  if (!ticket) return NextResponse.json({ error: "Vente introuvable." }, { status: 404 });

  return new NextResponse(new Uint8Array(ticket.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${ticket.infos.numero}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
