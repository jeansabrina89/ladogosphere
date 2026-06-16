import Link from "next/link";
import { exigerPersonnelPage } from "../../src/lib/exigerPersonnelPage";
import { supabaseAdmin } from "../../src/lib/supabase-admin";
import { aujourdhuiISO } from "../../src/lib/dates";
import FiltresReservations from "./FiltresReservations";
import RechercheReservation from "./RechercheReservation";
import SelectionFactureGroupee from "./SelectionFactureGroupee";
import FiltrePeriodeReservations from "./FiltrePeriodeReservations";
import { appliquerPeriodeEtTri } from "../../src/lib/reservationsFiltres";
import { getProfilePerms } from "../../src/lib/getProfilePerms";

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filtre?: string; paiement?: string; recherche?: string; periode?: string }>;
}) {
  await exigerPersonnelPage();
  const perms = await getProfilePerms();
  const supabase = supabaseAdmin;
  const params = await searchParams;
  const filtre = params.filtre || "toutes";
  const paiement = params.paiement || "tous";
  const recherche = params.recherche || "";
  const aujourd_hui = aujourdhuiISO();
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
    query = query.order("date_debut", { ascending: false }).order("created_at", { ascending: false });
  } else {
    query = appliquerPeriodeEtTri(query, filtre || "toutes", aujourd_hui);
    if (paiement !== "tous") {
      query = query.eq("statut_paiement", paiement);
    }
    if (periodeSet.size > 0) {
      const conditions: string[] = [];
      if (periodeSet.has("a_venir"))  conditions.push(`and(date_debut.gt.${today},statut.neq.annulee)`);
      if (periodeSet.has("en_cours")) conditions.push(`and(date_debut.lte.${today},date_fin.gte.${today},statut.neq.annulee)`);
      if (periodeSet.has("passees"))  conditions.push(`and(date_fin.lt.${today},statut.neq.annulee)`);
      if (periodeSet.has("annulee"))  conditions.push(`statut.eq.annulee`);
      if (conditions.length > 0) query = query.or(conditions.join(","));
    }
  }

  const { data: reservations } = await query;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-7xl mx-auto">

        <h1 className="text-4xl font-bold mb-2" style={{ color: "#1B2B5E" }}>📅 Réservations</h1>
        <p className="text-gray-600 mb-6">Liste de toutes les réservations</p>

        {perms.perm_reservations_creer && (
          <div className="mb-6">
            <Link href="/reservations/nouvelle"
              className="px-4 py-2 rounded-xl font-semibold text-white"
              style={{ backgroundColor: "#4AAEA0" }}>
              ➕ Nouvelle réservation
            </Link>
          </div>
        )}

        <RechercheReservation valeurInitiale={recherche} />

        {!recherche && <FiltresReservations />}
        {!recherche && <FiltrePeriodeReservations />}

        <p className="font-semibold mb-4" style={{ color: "#1B2B5E" }}>
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