import Link from "next/link";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import FiltresReservations from "./FiltresReservations";
import RechercheReservation from "./RechercheReservation";
import ListeReservations from "./ListeReservations";
import FiltrePeriodeReservations from "./FiltrePeriodeReservations";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import { clientsMembresAJour } from "@/src/lib/membre";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import BandeauReservationsPersonnel from "./BandeauReservationsPersonnel";
import { idsFichesInternes, compterReservationsPersonnelAVoir } from "@/src/lib/reservationsPersonnelAdmin";
import FiltrePersonnel from "./FiltrePersonnel";
import {
  TYPES_SEJOUR,
  infoTypeSejour,
  typeSejour,
} from "@/src/lib/typeSejour";
import { formatDateFR } from "@/src/lib/dates";

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    paiement?: string; recherche?: string; periode?: string; personnel?: string;
    type?: string; nonfactures?: string; debut?: string; fin?: string;
  }>;
}) {
  await exigerAccesAdmin();
  const perms = await getProfilePerms();
  const supabase = supabaseAdmin;
  const params = await searchParams;
  const paiement = params.paiement || "tous";
  const recherche = params.recherche || "";
  const filtrePersonnel = params.personnel === "1";
  // Les compteurs « Accueils non facturés » mènent ici. Un type précis, ou
  // les trois à la fois, sur les bornes de la période d'où l'on vient.
  const typeDemande = TYPES_SEJOUR.some((t) => t.valeur === params.type)
    ? typeSejour(params.type)
    : null;
  const filtreNonFactures = params.nonfactures === "1";
  const borneDebut = /^\d{4}-\d{2}-\d{2}$/.test(params.debut ?? "") ? params.debut! : null;
  const borneFin = /^\d{4}-\d{2}-\d{2}$/.test(params.fin ?? "") ? params.fin! : null;
  const idsInternes = await idsFichesInternes();
  const nbPersonnelAVoir = await compterReservationsPersonnelAVoir();
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

  // Filtre par type de séjour. « Non facturés » = les trois types qui ne
  // comptent pas dans l'activité ; la liste des exclus vient de TYPES_SEJOUR,
  // pas d'une énumération recopiée.
  if (typeDemande) {
    query = query.eq("type_sejour", typeDemande);
  } else if (filtreNonFactures) {
    const exclus = TYPES_SEJOUR.filter((t) => !t.compteDansActivite).map((t) => t.valeur);
    query = query.in("type_sejour", exclus);
  }
  if (borneDebut) query = query.gte("date_debut", borneDebut);
  if (borneFin) query = query.lte("date_debut", borneFin);

  // Filtre « Personnel » : uniquement les réservations des fiches internes.
  if (filtrePersonnel) {
    query = idsInternes.length > 0
      ? query.in("client_id", idsInternes)
      : query.eq("client_id", "00000000-0000-0000-0000-000000000000");
  }

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

        {/* Le filtre « Personnel » : un filtre, pas une entrée de menu. */}
        <FiltrePersonnel actif={filtrePersonnel} aVoir={nbPersonnelAVoir} />

        {filtrePersonnel && (
          <BandeauReservationsPersonnel
            nbAVoir={(reservations ?? []).filter((r: any) => !r.vue_admin_le).length}
          />
        )}

        {/* D'où l'on vient : le compteur cliqué se rappelle à l'écran, avec
            un moyen de revenir à la liste entière. */}
        {(typeDemande || filtreNonFactures) && (
          <div className="mb-4 rounded-[18px] p-4 flex flex-wrap items-center gap-3"
            style={{
              backgroundColor: typeDemande ? infoTypeSejour(typeDemande).fond : "#F4EAC9",
              border: "1px solid rgba(27,43,94,0.12)",
            }}>
            <span className="font-semibold text-sm"
              style={{ color: typeDemande ? infoTypeSejour(typeDemande).couleur : "#6E5410" }}>
              {typeDemande
                ? `${infoTypeSejour(typeDemande).pastille} — ${infoTypeSejour(typeDemande).aide}`
                : "Accueils non facturés : personnel, urgence et abandon. Ils occupent un box sans entrer dans le chiffre d'affaires."}
            </span>
            {(borneDebut || borneFin) && (
              <span className="text-xs" style={{ color: "rgba(27,43,94,0.6)" }}>
                Séjours commençant {borneDebut ? `du ${formatDateFR(borneDebut)}` : ""}
                {borneFin ? ` au ${formatDateFR(borneFin)}` : ""}.
              </span>
            )}
            <Link href="/reservations" className="text-xs font-semibold underline" style={{ color: "#1B2B5E" }}>
              Voir toutes les réservations
            </Link>
          </div>
        )}

        <p style={{ color: "rgba(27,43,94,0.6)", fontSize: 14, margin: "0 0 16px", fontWeight: 600 }}>
          {reservations?.length ?? 0} réservation(s)
          {filtrePersonnel && " du personnel"}
          {typeDemande && ` — ${infoTypeSejour(typeDemande).libelle}`}
          {!typeDemande && filtreNonFactures && " non facturée(s)"}
        </p>

        <ListeReservations
          reservations={reservations ?? []}
          permEncaissements={perms.perm_encaissements}
        />

      </div>
    </main>
  );
}
