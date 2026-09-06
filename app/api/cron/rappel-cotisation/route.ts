import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { envoyerEmailRappelCotisation, type VarianteRappelCotisation } from "@/src/lib/email";
import { getCoordonneesPaiement } from "@/src/lib/coordonneesPaiement";
import { ajouterJoursISO } from "@/src/lib/cotisationPeriode";
import { aujourdhuiISO } from "@/src/lib/dates";

/**
 * Rappel de cotisation échue — exécuté TOUS LES JOURS (cf. vercel.json).
 *
 * Deux envois possibles par cotisation, et deux seulement :
 *  1. le LENDEMAIN de l'échéance      (date_fin = hier)              → "echue"
 *  2. 30 JOURS APRÈS l'échéance       (date_fin = aujourd'hui - 30j) → "rappel"
 *
 * Aucun envoi avant l'échéance, aucun envoi ensuite. Sont exclus : les clients
 * inactifs ou exemptés, et ceux qui ont DÉJÀ une cotisation suivante enregistrée
 * (payée ou en attente).
 */
const JOURS_RAPPEL = 30;

type ClientRappel = {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  actif: boolean | null;
  cotisation_exemptee: boolean | null;
};

type CotisationEchue = {
  client_id: string;
  date_fin: string;
  clients: ClientRappel | null;
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const aujourdhui = aujourdhuiISO();
  const echeances: { date_fin: string; variante: VarianteRappelCotisation }[] = [
    { date_fin: ajouterJoursISO(aujourdhui, -1), variante: "echue" },
    { date_fin: ajouterJoursISO(aujourdhui, -JOURS_RAPPEL), variante: "rappel" },
  ];

  // Montant et coordonnées de paiement depuis les paramètres
  const { data: parametres } = await supabaseAdmin
    .from("parametres")
    .select("cle, valeur")
    .in("cle", ["cotisation_montant"]);

  const montant = parseFloat(
    parametres?.find((p) => p.cle === "cotisation_montant")?.valeur ?? "200"
  );
  const coords = await getCoordonneesPaiement(supabaseAdmin);

  let nbEnvoyes = 0;
  const erreurs: string[] = [];
  const detail: Record<string, number> = { echue: 0, rappel: 0 };

  for (const { date_fin, variante } of echeances) {
    // Cotisations payées dont la validité s'est terminée CE jour-là.
    const { data: cotisations } = await supabaseAdmin
      .from("cotisations_membres")
      .select("client_id, date_fin, clients (id, prenom, nom, email, actif, cotisation_exemptee)")
      .eq("statut", "payee")
      .eq("date_fin", date_fin);

    const lignes = (cotisations ?? []) as unknown as CotisationEchue[];
    if (lignes.length === 0) continue;

    // Une cotisation SUIVANTE existe-t-elle déjà (renouvellement enregistré) ?
    const clientIds = [...new Set(lignes.map((c) => c.client_id).filter(Boolean))];
    const { data: suivantes } = await supabaseAdmin
      .from("cotisations_membres")
      .select("client_id")
      .in("client_id", clientIds)
      .gt("date_fin", date_fin);
    const dejaRenouveles = new Set(
      ((suivantes ?? []) as { client_id: string }[]).map((c) => c.client_id)
    );

    for (const ligne of lignes) {
      const client = ligne.clients;
      if (!client) continue;
      if (dejaRenouveles.has(ligne.client_id)) continue;
      if (client.actif === false) continue;
      if (client.cotisation_exemptee) continue;
      if (!client.email) continue;

      try {
        await envoyerEmailRappelCotisation({
          email: client.email,
          prenom: client.prenom || "Client",
          nom: client.nom || "",
          date_fin: ligne.date_fin,
          montant,
          iban: coords.iban,
          titulaire: coords.titulaire,
          variante,
        });
        nbEnvoyes++;
        detail[variante]++;
      } catch (e: unknown) {
        erreurs.push(`${client.email} (${variante}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    date: aujourdhui,
    envoyes: nbEnvoyes,
    detail,
    erreurs,
  });
}
