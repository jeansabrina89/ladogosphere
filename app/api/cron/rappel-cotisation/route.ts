import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { envoyerEmailRappelCotisation } from "@/src/lib/email";
import { getCoordonneesPaiement } from "@/src/lib/coordonneesPaiement";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const anneeActuelle = new Date().getFullYear();
  const anneeProchaine = anneeActuelle + 1;

  // Récupérer montant et coordonnées de paiement depuis les paramètres
  const { data: parametres } = await supabaseAdmin
    .from("parametres")
    .select("cle, valeur")
    .in("cle", ["cotisation_montant"]);

  const montant = parseFloat(
    parametres?.find(p => p.cle === "cotisation_montant")?.valeur ?? "180"
  );
  const coords = await getCoordonneesPaiement(supabaseAdmin);

  // Tous les membres actifs
  const { data: membres } = await supabaseAdmin
    .from("clients")
    .select("id, prenom, nom, email")
    .eq("membre", true)
    .eq("actif", true)
    .eq("cotisation_exemptee", false);

  // Ceux qui n'ont pas encore renouvelé pour l'année prochaine
  const { data: cotisationsExistantes } = await supabaseAdmin
    .from("cotisations_membres")
    .select("client_id")
    .eq("annee", anneeProchaine);

  const clientsDejaRenouveles = new Set(
    cotisationsExistantes?.map(c => c.client_id) ?? []
  );

  let nbEnvoyes = 0;
  const erreurs: string[] = [];

  for (const membre of membres ?? []) {
    if (clientsDejaRenouveles.has(membre.id)) continue;
    if (!membre.email) continue;

    try {
      await envoyerEmailRappelCotisation({
        email: membre.email,
        prenom: membre.prenom || "Client",
        nom: membre.nom || "",
        annee: anneeActuelle,
        montant,
        iban: coords.iban,
        titulaire: coords.titulaire,
      });
      nbEnvoyes++;
    } catch (e: any) {
      erreurs.push(`${membre.email}: ${e.message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    annee: anneeActuelle,
    envoyes: nbEnvoyes,
    erreurs,
  });
}