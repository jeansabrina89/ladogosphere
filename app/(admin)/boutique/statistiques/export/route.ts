import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { exigerPermissionApi } from "@/src/lib/apiAuth";
import { aujourdhuiISO } from "@/src/lib/dates";
import { libelleCategorieArticle } from "@/src/lib/boutiqueLogique";
import { statistiquesBoutique } from "@/src/lib/statistiquesBoutique";
import { csvArticles, lireFiltresStatistiques, trier } from "@/src/lib/statistiquesBoutiqueLogique";

/** Export CSV de la table par article, avec les filtres de l'écran. */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_boutique_gestion");
  if (garde) return garde;

  const p = req.nextUrl.searchParams;
  const f = lireFiltresStatistiques({
    periode: p.get("periode") ?? undefined,
    du: p.get("du") ?? undefined,
    au: p.get("au") ?? undefined,
    canal: p.get("canal") ?? undefined,
    vendeuse: p.get("vendeuse") ?? undefined,
  }, aujourdhuiISO());

  const stats = await statistiquesBoutique({ du: f.du, au: f.au, canal: f.canal, vendeuse: f.vendeuse });
  const csv = csvArticles(trier(stats.articles, "caTtc", "desc"), libelleCategorieArticle);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="statistiques-boutique-${f.du}-${f.au}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
