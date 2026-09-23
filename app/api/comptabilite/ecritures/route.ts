import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerAdmin, garderRoute } from "@/src/lib/garde";
import { tracerEvenement } from "@/src/lib/journalEvenements";


export async function POST(req: NextRequest) {
  const g = await garderRoute(exigerAdmin("ecriture_manuelle"));
  if (g.refus) return g.refus;
  const auteurId = g.appelant.userId;

  let body: {
    date?: string;
    libelle?: string;
    motif?: string;
    lignes?: { compte: string; debit: number; credit: number }[];
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }); }

  const { date, libelle, lignes } = body;
  const motif = (body.motif ?? "").trim() || null;
  if (!date || !libelle || !lignes || lignes.length < 2) {
    return NextResponse.json({ error: "Date, libellé et au moins deux lignes requis." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("passer_ecriture", {
    p_date: date,
    p_libelle: libelle,
    p_piece_type: "manuelle",
    p_piece_id: null,
    p_lignes: lignes,
    p_created_by: auteurId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Une écriture saisie à la main dit POURQUOI elle existe : le grand-livre
  // porte les montants, le journal porte la raison.
  await tracerEvenement({
    entite: "ecriture",
    entiteId: data as string,
    evenement: "ecriture_manuelle",
    apres: { date, libelle, lignes },
    motif,
    userId: auteurId,
  });

  return NextResponse.json({ ecriture_id: data });
}
