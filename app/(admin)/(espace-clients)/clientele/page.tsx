import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { aujourdhuiISO, formatDateFR } from "@/src/lib/dates";
import { decalerJours } from "@/src/lib/journee";
import { compterReservationsPersonnelAVoir } from "@/src/lib/reservationsPersonnelAdmin";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import { Tuile, Raccourci, GrilleTuiles } from "@/app/components/ui/TuileChiffre";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";

/**
 * Accueil de l'espace Clients : ce qui attend une réponse.
 *
 * Les tuiles réservées à l'encaissement (adhésions) ne sont pas seulement
 * masquées : elles ne sont pas calculées. Une donnée qu'on ne doit pas voir ne
 * doit pas partir de la base.
 */
export default async function ClientelePage() {
  const acces = await exigerAccesAdmin();
  const encaisse = acces.permissions.perm_encaissements === true;

  const jour = aujourdhuiISO();
  const debutMois = `${jour.slice(0, 7)}-01`;
  const dansUnMois = decalerJours(jour, 30);

  const [
    { count: enAttente },
    { count: nouveaux },
    { data: chiensNonValides },
    adhesionsRes,
    nbResaPersonnel,
  ] = await Promise.all([
    supabaseAdmin.from("reservations").select("id", { count: "exact", head: true })
      .eq("statut", "en_attente"),
    supabaseAdmin.from("clients").select("id", { count: "exact", head: true })
      .eq("actif", true).gte("created_at", `${debutMois}T00:00:00Z`),
    supabaseAdmin.from("chiens").select("id")
      .eq("actif", true)
      .in("statut_essai", ["programme", "seconde_journee"]),
    encaisse
      ? supabaseAdmin.from("cotisations_membres").select("id, date_fin")
          .eq("statut", "payee")
          .not("date_fin", "is", null)
          .lte("date_fin", dansUnMois)
          .gte("date_fin", jour)
          .order("date_fin")
      : Promise.resolve({ data: [] as { id: string; date_fin: string }[] }),
    compterReservationsPersonnelAVoir(),
  ]);

  const adhesions = (adhesionsRes.data ?? []) as { id: string; date_fin: string }[];
  const prochaine = adhesions[0]?.date_fin;
  const nonValides = (chiensNonValides ?? []).length;

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto" style={{ minWidth: 0 }}>
        <EnTete
          titre="👤 Clients"
          sousTitre={`La clientèle au ${formatDateFR(jour)}`}
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {acces.permissions.perm_clients_creer && (
                <Bouton href="/clients/nouveau" variante="principal">+ Client</Bouton>
              )}
              {acces.permissions.perm_reservations_creer && (
                <Bouton href="/reservations/nouvelle" variante="secondaire">+ Réservation</Bouton>
              )}
            </div>
          }
        />

        <GrilleTuiles etiquette="Les chiffres de la clientèle">
          <Tuile
            href="/reservations"
            titre="Demandes de réservation en attente"
            valeur={String(enAttente ?? 0)}
            detail={(enAttente ?? 0) > 0 ? "À valider ou à refuser" : "Tout est répondu"}
            couleur={(enAttente ?? 0) > 0 ? "#A8453A" : "#1F6E5B"}
            alerte={(enAttente ?? 0) > 0}
          />

          {/* Les réservations du personnel sont validées d'office : elles ne
              demandent pas une réponse, seulement un regard. */}
          <Tuile
            href="/reservations?personnel=1"
            titre="Réservations du personnel à voir"
            valeur={String(nbResaPersonnel)}
            detail={nbResaPersonnel > 0 ? "Pour information" : "Toutes vues"}
            couleur={nbResaPersonnel > 0 ? "#6E5410" : MARINE}
          />

          {encaisse && (
            <Tuile
              href="/adhesions"
              titre="Adhésions à échéance dans le mois"
              valeur={String(adhesions.length)}
              detail={prochaine ? `La première le ${formatDateFR(prochaine)}` : "Aucune à renouveler"}
              couleur={adhesions.length > 0 ? "#6E5410" : MARINE}
              alerte={adhesions.length > 0}
            />
          )}

          <Tuile
            href="/clients"
            titre="Nouveaux clients du mois"
            valeur={String(nouveaux ?? 0)}
            detail={`Depuis le ${formatDateFR(debutMois)}`}
          />

          <Tuile
            href="/chiens"
            titre="Chiens en attente de validation"
            valeur={String(nonValides)}
            detail={nonValides > 0 ? "Journée d'essai à faire ou à conclure" : "Tous les chiens sont conclus"}
            couleur={nonValides > 0 ? "#6E5410" : "#1F6E5B"}
          />
        </GrilleTuiles>

        <section style={{ marginTop: 28, minWidth: 0 }}>
          <h2 style={{
            fontFamily: "Georgia, 'Times New Roman', serif", color: MARINE,
            fontSize: 18, fontWeight: 700, margin: "0 0 12px",
          }}>
            Le reste de la clientèle
          </h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", minWidth: 0 }}>
            <Raccourci href="/clients" titre="👤 Clients" note="Fiches, contacts et adhésions" />
            <Raccourci href="/chiens" titre="🐶 Chiens" note="Fiches, ententes et journées d'essai" />
            <Raccourci href="/reservations" titre="📅 Réservations" note="Toutes les réservations, filtrables" />
            {encaisse && (
              <Raccourci href="/abonnements" titre="🎟️ Abonnements" note="Cartes de journées et soldes" />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
