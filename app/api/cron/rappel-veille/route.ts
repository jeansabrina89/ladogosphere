import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { envoyerEmailRappelVeille, envoyerEmailPaiement } from "@/src/lib/email";
import { getCoordonneesPaiement } from "@/src/lib/coordonneesPaiement";
import { resteAPayer } from "@/src/lib/montants";

export async function GET(req: NextRequest) {
  // Vérification sécurité — token Vercel cron
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const aujourdHui = new Date().toISOString().split("T")[0];

  // ===== Tâche 1 : rappel la veille (SÉJOURS uniquement) =====
  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  const dateDemain = demain.toISOString().split("T")[0];

  const { data: reservations, error } = await supabaseAdmin
    .from("reservations")
    .select(`
      *,
      clients (prenom, email),
      reservation_chiens (
        chiens (nom)
      )
    `)
    .eq("date_debut", dateDemain)
    .eq("statut", "validee")
    .eq("type_reservation", "sejour");

  if (error) {
    console.error("Erreur cron rappel veille:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let nbVeille = 0;
  const erreursVeille: string[] = [];

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
      nbVeille++;
    } catch (e: any) {
      erreursVeille.push(`${email}: ${e.message}`);
    }
  }

  // ===== Tâche 2 : demande de paiement 14 jours AVANT le début (séjours impayés) =====
  const cible = new Date();
  cible.setDate(cible.getDate() + 14);
  const dateCible = cible.toISOString().split("T")[0];

  const { data: aFacturer, error: errPay } = await supabaseAdmin
    .from("reservations")
    .select(`
      *,
      clients (prenom, email)
    `)
    .eq("date_debut", dateCible)
    .eq("statut", "validee")
    .eq("type_reservation", "sejour")
    .neq("statut_paiement", "paye")
    .is("paiement_demande_le", null);

  let nbPaiement = 0;
  const erreursPaiement: string[] = [];

  if (errPay) {
    console.error("Erreur cron demande paiement:", errPay);
  } else if ((aFacturer ?? []).length > 0) {
    const coords = await getCoordonneesPaiement(supabaseAdmin);
    for (const res of aFacturer ?? []) {
      const email = res.clients?.email;
      const prenom = res.clients?.prenom || "Client";
      if (!email || res.offerte) continue;
      const montant = resteAPayer(res);
      if (montant <= 0) continue;

      try {
        await envoyerEmailPaiement({
          email,
          prenom,
          montant,
          date_debut: res.date_debut,
          date_fin: res.date_fin,
          type: res.type_reservation,
          iban: coords.iban,
          titulaire: coords.titulaire,
        });
        await supabaseAdmin
          .from("reservations")
          .update({ paiement_demande_le: aujourdHui })
          .eq("id", res.id);
        nbPaiement++;
      } catch (e: any) {
        erreursPaiement.push(`${email}: ${e.message}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    veille: { date: dateDemain, envoyes: nbVeille, erreurs: erreursVeille },
    paiement: { date: dateCible, envoyes: nbPaiement, erreurs: erreursPaiement },
  });
}
