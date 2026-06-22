import { exigerPersonnelPage } from "@/src/lib/exigerPersonnelPage";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import FiltresReservations from "./FiltresReservations";
import RechercheReservation from "./RechercheReservation";
import SelectionFactureGroupee from "./SelectionFactureGroupee";
import FiltrePeriodeReservations from "./FiltrePeriodeReservations";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import { clientsMembresAJour } from "@/src/lib/membre";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ paiement?: string; recherche?: string; periode?: string }>;
}) {
  await exigerPersonnelPage();
  const perms = await getProfilePerms();
  const supabase = supabaseAdmin;
  const params = await searchParams;
  const paiement = params.paiement || "tous";
  const recherche = params.recherche || "";
  const periodeSet = new Set((params.periode ?? "").split(",").filter(Boolean));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Zurich" });

  let query = supabase
    .from("reservations")
    .select(`
      *,
      clients (prenom, nom, membre),
      boxes (numero, nom),
      reservation_chiens (
        chiens (id, nom, race, categorie_poids)
      )
    `);

  if (recherche) {
    const numero = parseInt(recherche);
    if (!isNaN(numero)) {
      query = query.eq("numero", numero);
    }
    query = query
      .order("date_debut", { ascending: false })
      .order("created_at", { ascending: false });
  } else {
    query = query
      .order("date_debut", { ascending: false })
      .order("created_at", { ascending: false });

    if (paiement !== "tous") {
      query = query.eq("statut_paiement", paiement);
    }

    if (periodeSet.size > 0) {
      const conditions: string[] = [];
      if (periodeSet.has("a_venir"))  conditions.push(`and(date_debut.gt.${today},statut.neq.annulee)`);
      if (periodeSet.has("en_cours")) conditions.push(`and(date_debut.lte.${today},date_fin.gte.${today},statut.neq.annulee)`);
      if (periodeSet.has("passees"))  conditions.push(`and(date_fin.lt.${today},statut.neq.annulee)`);
      if (periodeSet.has("annulee"))  conditions.push(`statut.eq.annulee`);
      if (periodeSet.has("a_payer"))  conditions.push(`and(statut.neq.annulee,statut_paiement.in.(impaye,partiel))`);
      if (conditions.length > 0) query = query.or(conditions.join(","));
    }
  }

  const { data: reservations } = await query;
  const idsAJourFacture = await clientsMembresAJour(supabase, ((reservations ?? []) as any[]).map((r) => r.client_id));
  for (const r of (reservations ?? []) as any[]) { if (r.clients) r.clients.aJour = idsAJourFacture.has(r.client_id); }

  return (
    <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">

        <EnTete
          titre="📅 Réservations"
          sousTitre="Liste de toutes les réservations"
          action={
            perms.perm_reservations_creer ? (
              <Bouton variante="principal" href="/reservations/nouvelle">Nouvelle réservation</Bouton>
            ) : undefined
          }
        />

        <RechercheReservation valeurInitiale={recherche} />

        {!recherche && <FiltrePeriodeReservations />}
        {!recherche && <FiltresReservations />}

        <p style={{ color: "rgba(27,43,94,0.6)", fontSize: 14, margin: "0 0 16px", fontWeight: 600 }}>
          {reservations?.length ?? 0} réservation(s)
        </p>

        <SelectionFactureGroupee
          reservations={reservations ?? []}
          permEncaissements={perms.perm_encaissements}
        />

      </div>
    </main>
  );
}
