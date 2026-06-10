import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../src/utils/supabase/server";
import { envoyerEmailRappelCotisation } from "../../../../src/lib/email";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const anneeActuelle = new Date().getFullYear();
  const anneeProchaine = anneeActuelle + 1;

  // Récupérer montant et IBAN depuis les paramètres
  const { data: parametres } = await supabase
    .from("parametres")
    .select("cle, valeur")
    .in("cle", ["cotisation_montant", "iban"]);

  const montant = parseFloat(
    parametres?.find(p => p.cle === "cotisation_montant")?.valeur ?? "180"
  );
  const iban = parametres?.find(p => p.cle === "iban")?.valeur ?? "CH00 0000 0000 0000 0000 0";

  // Tous les membres actifs
  const { data: membres } = await supabase
    .from("clients")
    .select("id, prenom, nom, email")
    .eq("membre", true)
    .eq("actif", true)
    .eq("cotisation_exemptee", false);

  // Ceux qui n'ont pas encore renouvelé pour l'année prochaine
  const { data: cotisationsExistantes } = await supabase
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
        iban,
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