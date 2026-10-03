import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { aujourdhuiISO, formatDateFR } from "@/src/lib/dates";
import { decalerJours } from "@/src/lib/journee";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import { Tuile, Raccourci, GrilleTuiles } from "@/app/components/ui/TuileChiffre";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";

/**
 * Accueil de l'espace Clients : ce qui attend une réponse.
 *
 * APP 73 — les réservations n'y sont plus : les demandes en attente et celles
 * du personnel sont parties à l'accueil Pension et dans « Aujourd'hui », les
 * chiens à valider en haut de /chiens. Restent les adhésions et les nouveaux
 * clients — la clientèle, et elle seule.
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
    { count: nouveaux },
    adhesionsRes,
  ] = await Promise.all([
    supabaseAdmin.from("clients").select("id", { count: "exact", head: true })
      .eq("actif", true).gte("created_at", `${debutMois}T00:00:00Z`),
    encaisse
      ? supabaseAdmin.from("cotisations_membres").select("id, date_fin")
          .eq("statut", "payee")
          .not("date_fin", "is", null)
          .lte("date_fin", dansUnMois)
          .gte("date_fin", jour)
          .order("date_fin")
      : Promise.resolve({ data: [] as { id: string; date_fin: string }[] }),
  ]);

  const adhesions = (adhesionsRes.data ?? []) as { id: string; date_fin: string }[];
  const prochaine = adhesions[0]?.date_fin;

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
            </div>
          }
        />

        <GrilleTuiles etiquette="Les chiffres de la clientèle">
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
            {encaisse && (
              <Raccourci href="/abonnements" titre="🎟️ Abonnements" note="Cartes de journées et soldes" />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
