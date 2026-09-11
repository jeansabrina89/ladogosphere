import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { aujourdhuiISO, formatDateFR } from "@/src/lib/dates";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import { regenererTous, tachesEntre } from "@/src/lib/prestationsDb";
import {
  MENTION_HORS_PENSION,
  datesDe,
  decalerJour,
  jourDe,
} from "@/src/lib/prestationsLogique";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.6)";

/**
 * La semaine des prestations.
 *
 * Les gardes complètes y sont marquées distinctement : c'est le seul cas où la
 * pension répond d'un chien 24 h sans qu'il occupe un box de la pension, et
 * l'équipe doit le savoir d'un coup d'œil.
 */
export default async function PlanningPrestationsPage({
  searchParams,
}: {
  searchParams: Promise<{ debut?: string }>;
}) {
  await exigerAccesAdmin("perm_prestations");
  const params = await searchParams;
  const jour = aujourdhuiISO();

  await regenererTous(jour);

  const depart = /^\d{4}-\d{2}-\d{2}$/.test(params.debut ?? "") ? params.debut! : jour;
  const fin = decalerJour(depart, 6);
  const taches = await tachesEntre(depart, fin);

  const parJour = new Map<string, typeof taches>();
  for (const d of datesDe(depart, fin)) parJour.set(d, []);
  for (const t of taches) parJour.get(t.date)?.push(t);

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", minWidth: 0 }}>
        <EnTete
          titre="🗂️ Planning des prestations"
          sousTitre={`Du ${formatDateFR(depart)} au ${formatDateFR(fin)}`}
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href={`/prestations/planning?debut=${decalerJour(depart, -7)}`} variante="secondaire">← Semaine précédente</Bouton>
              <Bouton href={`/prestations/planning?debut=${decalerJour(depart, 7)}`} variante="secondaire">Semaine suivante →</Bouton>
            </div>
          }
        />

        {/* Une colonne par jour sur grand écran, empilées sur mobile : un
            planning ne se lit pas en faisant défiler latéralement. */}
        <div className="grid gap-3" style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", minWidth: 0,
        }}>
          {[...parJour.entries()].map(([date, lignes]) => (
            <section key={date} style={{
              background: "#FFFFFF", border: "1px solid rgba(27,43,94,.10)",
              borderRadius: 16, padding: 12, minWidth: 0,
            }}>
              <h2 style={{
                margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: MARINE,
                textTransform: "capitalize",
              }}>
                {jourDe(date)} {date.slice(8, 10)}.{date.slice(5, 7)}
                {date === jour && (
                  <span style={{
                    marginLeft: 8, fontSize: 11, padding: "2px 8px", borderRadius: 999,
                    background: "#1B2B5E", color: "#FFF",
                  }}>
                    aujourd&apos;hui
                  </span>
                )}
              </h2>

              {lignes.length === 0 ? (
                <p style={{ color: SOUS, fontSize: 13, margin: 0 }}>—</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                  {lignes.map((t) => (
                    <li key={t.id} style={{
                      fontSize: 13, padding: "8px 10px", borderRadius: 10, minWidth: 0,
                      background: t.garde ? "#F4EAC9" : "#F5F0E8",
                      borderLeft: t.garde ? "3px solid #C9A84C" : "3px solid transparent",
                      opacity: t.statut === "annulee" ? 0.5 : 1,
                      textDecoration: t.statut === "annulee" ? "line-through" : "none",
                    }}>
                      <span style={{ fontWeight: 700, color: MARINE, overflowWrap: "anywhere" }}>
                        {t.garde ? "🏠 " : ""}{t.prestation}
                      </span>
                      <br />
                      <span style={{ color: SOUS, overflowWrap: "anywhere" }}>
                        {t.heure_prevue ? `${t.heure_prevue.slice(0, 5)} · ` : ""}
                        Box {t.box ?? "—"} · {t.chien ?? "—"}
                      </span>
                      {t.statut === "faite" && (
                        <span style={{ color: "#1F6E5B", fontWeight: 700 }}> ✓</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <p style={{
          color: SOUS, fontSize: 12, marginTop: 20,
          borderTop: "1px solid rgba(27,43,94,.08)", paddingTop: 12,
        }}>
          🏠 Les blocs dorés sont des gardes complètes. {MENTION_HORS_PENSION}
        </p>
      </div>
    </main>
  );
}
