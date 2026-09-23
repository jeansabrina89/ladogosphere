import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { envoyerEmailRappelCotisation, type VarianteRappelCotisation } from "@/src/lib/email";
import { getCoordonneesPaiement } from "@/src/lib/coordonneesPaiement";
import { ajouterJoursISO } from "@/src/lib/cotisationPeriode";
import { aujourdhuiISO } from "@/src/lib/dates";
import { envoyerFactureParEmail } from "@/src/lib/factureDocument";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { verifierCron } from "@/src/lib/cron";
import {
  STATUTS_EMISE_OUVERTE,
  facturesAEnvoyerCeMatin,
  type FactureCandidate,
} from "@/src/lib/facturesOuvertesLogique";

/**
 * Le passage du matin — exécuté TOUS LES JOURS à 7 h UTC (cf. vercel.json).
 *
 * Il s'appelait `rappel-cotisation` tant qu'il ne faisait que ça. Il porte
 * désormais deux tâches, et d'autres viendront : le nom dit quand il passe,
 * pas ce qu'il fait ce jour-là.
 *
 * 1. ADHÉSIONS ÉCHUES. Deux envois possibles par adhésion, et deux seulement :
 *    le LENDEMAIN de l'échéance (« echue ») et 30 JOURS APRÈS (« rappel »).
 *    Sont exclus les clients inactifs ou exemptés, et ceux qui ont DÉJÀ une
 *    adhésion suivante enregistrée (payée ou en attente).
 *
 * 2. FACTURES OUVERTES. Une facture émise hier ou avant, encore impayée,
 *    jamais arrivée chez le client et non exclue, part avec son PDF. C'est
 *    aussi ce qui rattrape un envoi manuel tombé en erreur.
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

type AdhesionEchue = {
  client_id: string;
  date_fin: string;
  clients: ClientRappel | null;
};

export async function GET(req: NextRequest) {
  const refus = verifierCron(req, "quotidien-matin");
  if (refus) return refus;

  const aujourdhui = aujourdhuiISO();

  const adhesions = await rappelerAdhesionsEchues(aujourdhui);
  const factures = await envoyerFacturesOuvertes(aujourdhui);

  return NextResponse.json({ ok: true, date: aujourdhui, adhesions, factures });
}

// ── 1. Adhésions échues ─────────────────────────────────────────────────────

async function rappelerAdhesionsEchues(aujourdhui: string) {
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

  let envoyes = 0;
  const erreurs: string[] = [];
  const detail: Record<string, number> = { echue: 0, rappel: 0 };

  for (const { date_fin, variante } of echeances) {
    // Adhésions payées dont la validité s'est terminée CE jour-là.
    const { data: cotisations } = await supabaseAdmin
      .from("cotisations_membres")
      .select("client_id, date_fin, clients (id, prenom, nom, email, actif, cotisation_exemptee)")
      .eq("statut", "payee")
      .eq("date_fin", date_fin);

    const lignes = (cotisations ?? []) as unknown as AdhesionEchue[];
    if (lignes.length === 0) continue;

    // Une adhésion SUIVANTE existe-t-elle déjà (renouvellement enregistré) ?
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
        envoyes++;
        detail[variante]++;
      } catch (e: unknown) {
        erreurs.push(`${client.email} (${variante}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return { envoyes, detail, erreurs };
}

// ── 2. Factures ouvertes ────────────────────────────────────────────────────

async function envoyerFacturesOuvertes(aujourdhui: string) {
  // La base écarte le gros ; la règle, elle, vit dans facturesOuvertesLogique
  // et c'est elle qui tranche, date d'émission comprise.
  const { data, error } = await supabaseAdmin
    .from("factures")
    .select(
      "id, type, numero, statut, montant_restant, email_envoye_le, envoi_auto_exclu, " +
      "emise_le, date_facture, clients (email)"
    )
    .neq("type", "avoir")
    .not("numero", "is", null)
    .in("statut", [...STATUTS_EMISE_OUVERTE])
    .gt("montant_restant", 0)
    .is("email_envoye_le", null)
    .eq("envoi_auto_exclu", false);

  if (error) {
    return { envoyees: 0, erreurs: [`lecture des factures : ${error.message}`] };
  }

  const candidates: FactureCandidate[] = ((data ?? []) as unknown as (
    Omit<FactureCandidate, "email_client"> & { clients: { email: string | null } | null }
  )[]).map(({ clients, ...f }) => ({ ...f, email_client: clients?.email ?? null }));

  let envoyees = 0;
  const erreurs: string[] = [];

  for (const f of facturesAEnvoyerCeMatin(candidates, aujourdhui)) {
    // `envoyerFactureParEmail` pose `email_envoye_le` et trace l'envoi réussi.
    const res = await envoyerFactureParEmail(f.id, null, { via: "envoi_du_matin" });
    if (!res.error) {
      envoyees++;
      continue;
    }
    erreurs.push(`${f.numero} (${f.email_client}) : ${res.error}`);
    // L'échec aussi laisse sa trace : sans elle, une facture qui ne part jamais
    // ne se verrait nulle part. Elle sera retentée demain.
    await tracerEvenement({
      entite: "facture",
      entiteId: f.id,
      evenement: "envoi_echec",
      apres: { destinataire: f.email_client, via: "envoi_du_matin", erreur: res.error },
    });
  }

  return { envoyees, erreurs };
}
