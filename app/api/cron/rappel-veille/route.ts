import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../src/utils/supabase/server";
import { envoyerEmailRappelVeille } from "../../../../src/lib/email";

export async function GET(req: NextRequest) {
  // Vérification sécurité — token Vercel cron
  const supabase = await createClient();
  // Vérification sécurité — token Vercel cron
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  const dateDemain = demain.toISOString().split("T")[0];

  // Récupérer toutes les réservations validées du lendemain
  const { data: reservations, error } = await supabase
    .from("reservations")
    .select(`
      *,
      clients (prenom, email),
      reservation_chiens (
        chiens (nom)
      )
    `)
    .eq("date_debut", dateDemain)
    .eq("statut", "validee");

  if (error) {
    console.error("Erreur cron rappel:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let nbEnvoyes = 0;
  const erreurs: string[] = [];

  for (const res of reservations ?? []) {
    const email = res.clients?.email;
    const prenom = res.clients?.prenom || "Client";
    const chiens = res.reservation_chiens?.map((rc: any) => rc.chiens?.nom).filter(Boolean);
    const nom_chien = chiens?.join(", ") || "votre chien";

    if (!email) continue;

    try {
      await envoyerEmailRappelVeille({
        email,
        prenom,
        nom_chien,
        date_debut: res.date_debut,
        heure_arrivee: res.heure_arrivee,
        type: res.type_reservation,
      });
      nbEnvoyes++;
    } catch (e: any) {
      erreurs.push(`${email}: ${e.message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    date: dateDemain,
    envoyes: nbEnvoyes,
    erreurs,
  });
}