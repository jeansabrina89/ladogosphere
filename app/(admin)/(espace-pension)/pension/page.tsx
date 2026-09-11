import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { aujourdhuiISO, formatDateFR } from "@/src/lib/dates";
import { decalerJours } from "@/src/lib/journee";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import { Tuile, Raccourci, GrilleTuiles } from "@/app/components/ui/TuileChiffre";
import {
  comptesNonFactures,
  infoTypeSejour,
} from "@/src/lib/typeSejour";
import { resumeParcBox, parcBox } from "@/src/lib/usageBox";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const HORIZON = 7;

/** Les périodes offertes pour les accueils non facturés. */
const PERIODES = [
  { jours: 30, libelle: "30 jours" },
  { jours: 90, libelle: "90 jours" },
  { jours: 365, libelle: "12 mois" },
];
const PERIODE_PAR_DEFAUT = 30;

/**
 * Accueil de l'espace Pension : les chiffres qui déclenchent une action, et
 * rien d'autre. Chaque tuile mène à l'écran filtré correspondant.
 */
export default async function PensionPage({
  searchParams,
}: {
  searchParams: Promise<{ jours?: string }>;
}) {
  await exigerAccesAdmin();

  const params = await searchParams;
  const joursPeriode =
    PERIODES.find((p) => String(p.jours) === params.jours)?.jours ?? PERIODE_PAR_DEFAUT;

  const jour = aujourdhuiISO();
  const limite = decalerJours(jour, HORIZON);
  const debutPeriode = decalerJours(jour, -joursPeriode);

  const [
    { data: boxesActifs },
    { data: occupations },
    { data: indispos },
    { count: nbArrivees },
    { count: nbDeparts },
    { data: essais },
    { data: sejoursPeriode },
    { data: tousBoxes },
  ] = await Promise.all([
    supabaseAdmin.from("boxes").select("id").eq("actif", true),
    // Un box est occupé aujourd'hui si un séjour le couvre aujourd'hui.
    supabaseAdmin.from("occupation_boxes").select("box_id")
      .lte("date_debut", jour).gte("date_fin", jour),
    supabaseAdmin.from("box_indisponibilites").select("box_id, motif, date_fin")
      .lte("date_debut", jour).gte("date_fin", jour),
    supabaseAdmin.from("checkin_checkout").select("id", { count: "exact", head: true })
      .gte("date_arrivee_prevue", `${jour}T00:00:00Z`)
      .lte("date_arrivee_prevue", `${limite}T23:59:59Z`),
    supabaseAdmin.from("checkin_checkout").select("id", { count: "exact", head: true })
      .gte("date_depart_prevu", `${jour}T00:00:00Z`)
      .lte("date_depart_prevu", `${limite}T23:59:59Z`),
    supabaseAdmin.from("reservations").select("id, date_debut")
      .eq("type_reservation", "essai")
      .not("statut", "in", "(annulee,refusee)")
      .gte("date_debut", jour).lte("date_debut", limite)
      .order("date_debut"),
    // Les accueils de la période, tous types confondus : les trois compteurs
    // se déduisent du même filtre que le chiffre d'affaires, pris à l'envers.
    supabaseAdmin.from("reservations").select("type_sejour")
      .not("statut", "in", "(annulee,refusee)")
      .gte("date_debut", debutPeriode).lte("date_debut", jour),
    // Le parc de box : combien accueillent réellement de la clientèle.
    supabaseAdmin.from("boxes").select("actif, usage_box"),
  ]);

  const total = (boxesActifs ?? []).length;
  const occupes = new Set((occupations ?? []).map((o) => o.box_id as string)).size;
  const indisponibles = new Set((indispos ?? []).map((i) => i.box_id as string)).size;
  const libres = Math.max(total - occupes - indisponibles, 0);
  const nbEssais = (essais ?? []).length;
  const prochainEssai = (essais ?? [])[0]?.date_debut as string | undefined;
  const nonFactures = comptesNonFactures(sejoursPeriode ?? []);
  const parc = parcBox(tousBoxes ?? []);
  const lienType = (type: string) =>
    `/reservations?type=${type}&debut=${debutPeriode}&fin=${jour}`;

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto" style={{ minWidth: 0 }}>
        <EnTete
          titre="🐾 Pension"
          sousTitre={`La maison au ${formatDateFR(jour)}`}
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href="/chiens-du-jour" variante="principal">🐾 Chiens du jour</Bouton>
              <Bouton href="/checkin" variante="secondaire">✅ Check-in</Bouton>
            </div>
          }
        />

        <GrilleTuiles etiquette="Les chiffres de la pension">
          <Tuile
            href="/planning"
            titre="Box occupés"
            valeur={`${occupes} / ${total}`}
            detail={`${libres > 0 ? `${libres} libre${libres > 1 ? "s" : ""}` : "Complet"} · ${resumeParcBox(parc)}`}
            couleur={libres === 0 ? "#A8453A" : MARINE}
            alerte={libres === 0}
          />

          <Tuile
            href="/chiens-du-jour"
            titre={`Arrivées des ${HORIZON} prochains jours`}
            valeur={String(nbArrivees ?? 0)}
            detail={`Jusqu'au ${formatDateFR(limite)}`}
          />

          <Tuile
            href="/chiens-du-jour"
            titre={`Départs des ${HORIZON} prochains jours`}
            valeur={String(nbDeparts ?? 0)}
            detail={`Jusqu'au ${formatDateFR(limite)}`}
          />

          <Tuile
            href="/calendrier-essais"
            titre="Journées d'essai de la semaine"
            valeur={String(nbEssais)}
            detail={prochainEssai ? `La prochaine le ${formatDateFR(prochainEssai)}` : "Aucune prévue"}
          />

          <Tuile
            href="/boxes"
            titre="Box indisponibles"
            valeur={String(indisponibles)}
            detail={indisponibles > 0 ? "Travaux, quarantaine ou réservé" : "Tous les box sont utilisables"}
            couleur={indisponibles > 0 ? "#A8453A" : "#1F6E5B"}
            alerte={indisponibles > 0}
          />
        </GrilleTuiles>

        {/* Accueils non facturés : la charge de travail que le chiffre
            d'affaires ne raconte pas. Ces trois compteurs se lisent À CÔTÉ du
            CA — jamais dedans, jamais additionnés. */}
        <section style={{ marginTop: 28, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <h2 style={{
              fontFamily: "Georgia, 'Times New Roman', serif", color: MARINE,
              fontSize: 18, fontWeight: 700, margin: 0,
            }}>
              Accueils non facturés
            </h2>
            <div style={{ display: "flex", gap: 6 }}>
              {PERIODES.map((per) => (
                <a key={per.jours} href={`/pension?jours=${per.jours}`}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
                    textDecoration: "none",
                    backgroundColor: per.jours === joursPeriode ? MARINE : "#EDE8DF",
                    color: per.jours === joursPeriode ? "white" : MARINE,
                  }}>
                  {per.libelle}
                </a>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 13, color: "rgba(27,43,94,0.6)", margin: "0 0 12px" }}>
            Des séjours qui occupent un box sans entrer dans le chiffre d&apos;affaires.
            Du {formatDateFR(debutPeriode)} au {formatDateFR(jour)}.
          </p>
          <GrilleTuiles etiquette="Accueils non facturés">
            {(["personnel", "urgence", "abandon"] as const).map((type) => (
              <Tuile
                key={type}
                href={lienType(type)}
                titre={infoTypeSejour(type).pastille}
                valeur={String(nonFactures[type])}
                detail={infoTypeSejour(type).aide}
                couleur={infoTypeSejour(type).couleur}
              />
            ))}
          </GrilleTuiles>
        </section>

        <section style={{ marginTop: 28, minWidth: 0 }}>
          <h2 style={{
            fontFamily: "Georgia, 'Times New Roman', serif", color: MARINE,
            fontSize: 18, fontWeight: 700, margin: "0 0 12px",
          }}>
            Le reste de la pension
          </h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", minWidth: 0 }}>
            <Raccourci href="/reservations" titre="📅 Réservations" note="Toutes les réservations, filtrables" />
            <Raccourci href="/planning" titre="🗂️ Planning" note="Vue semaine et mois des box" />
            <Raccourci href="/boxes" titre="🏠 Box" note="Capacités et indisponibilités" />
            <Raccourci href="/calendrier-essais" titre="🚫 Essais fermés" note="Les dates où l'on n'accueille pas d'essai" />
          </div>
        </section>
      </div>
    </main>
  );
}
