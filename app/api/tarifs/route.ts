import { NextRequest, NextResponse } from "next/server";
import { lireCorpsJson } from "@/src/lib/corpsRequete";
import { createClient } from "@/src/utils/supabase/server";
import { exigerAdmin, garderRoute } from "@/src/lib/garde";

/**
 * Les tarifs de l'année et le montant de l'adhésion.
 *
 * Réservé à l'admin, comme l'écran Tarifs (exigerAdminPage) et comme la RLS de
 * `tarifs` et `parametres` : il n'existe pas de permission d'employé sur les
 * prix de base. L'identité de l'entreprise (IBAN, titulaire, adresse) ne
 * passe plus par ici : elle a sa propre route, /api/entite/coordonnees.
 */
export async function PUT(req: NextRequest) {
  const g = await garderRoute(exigerAdmin("tarifs"));
  if (g.refus) return g.refus;

  const lecture = await lireCorpsJson(req);
  if (!lecture.ok) return lecture.reponse;
  const { updates, cotisation } = lecture.corps;

  if (!Array.isArray(updates)) {
    return NextResponse.json({ error: "Tarifs manquants." }, { status: 400 });
  }
  const montant = Number(cotisation);
  if (!Number.isFinite(montant) || montant < 0) {
    return NextResponse.json({ error: "Montant d'adhésion invalide." }, { status: 400 });
  }

  const supabase = await createClient();

  // Mettre à jour les tarifs
  for (const { id, prix } of updates as { id: string; prix: number }[]) {
    await supabase.from("tarifs").update({ prix }).eq("id", id);
  }

  // Mettre à jour le montant de la cotisation
  await supabase.from("parametres")
    .update({ valeur: montant.toString(), updated_at: new Date().toISOString() })
    .eq("cle", "cotisation_montant");

  // La TVA a son écran et sa table (parametres_tva) : Réglages → TVA. Elle ne
  // se règle plus ici, et surtout plus dans la table clé/valeur — un régime
  // s'historise, il ne s'écrase pas.

  return NextResponse.json({ ok: true });
}
