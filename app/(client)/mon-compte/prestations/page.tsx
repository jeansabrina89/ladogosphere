import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { aujourdhuiISO, formatDateFR } from "@/src/lib/dates";
import {
  MENTION_GARDE,
  catalogueVisible,
  cleSemaine,
  datesDe,
  decalerJour,
  jourDe,
} from "@/src/lib/prestationsLogique";
import { lireReglagesPrestations, tachesDuClient } from "@/src/lib/prestationsDb";
import { bornesDuMois, libelleMois } from "@/src/lib/factureLocataireLogique";
import CommandeLocataire from "./CommandeLocataire";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.6)";

/**
 * « Mes prestations », réservé aux locataires de box.
 *
 * La vérification est faite ICI, côté serveur, AVANT de lire quoi que ce soit :
 * un client de la pension est redirigé sans qu'aucune prestation, aucun tarif
 * et aucune formule ne soit chargé. Cacher à l'affichage ne suffirait pas —
 * les prix partiraient quand même dans le corps de la réponse.
 */
export default async function MesPrestationsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: fiche } = await supabaseAdmin
    .from("clients")
    .select("id, prenom, locataire_box, box_loue")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // La porte. Rien de ce qui suit n'est lu si elle est fermée.
  if (!fiche || !catalogueVisible(fiche)) redirect("/mon-compte");

  const jour = aujourdhuiISO();
  const finSemaine = decalerJour(jour, 6);
  const mois = jour.slice(0, 7);
  const { debut, fin } = bornesDuMois(mois);

  const [taches, reglages, { data: abo }] = await Promise.all([
    tachesDuClient(fiche.id, debut, fin),
    lireReglagesPrestations(),
    supabaseAdmin
      .from("abonnements_prestations")
      .select("id, prix_mensuel_fige, date_debut, jours_personnalises, formules (nom, description)")
      .eq("client_id", fiche.id)
      .eq("statut", "actif")
      .order("date_debut", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const { data: catalogue } = reglages.commandeLocataire
    ? await supabaseAdmin
        .from("prestations")
        .select("id, nom, description, unite, prix")
        .eq("actif", true)
        .order("ordre")
    : { data: [] };

  const semaine = taches.filter((t) => t.date >= jour && t.date <= finSemaine);
  const parJour = new Map<string, typeof taches>();
  for (const d of datesDe(jour, finSemaine)) parJour.set(d, []);
  for (const t of semaine) parJour.get(t.date)?.push(t);

  const faites = taches.filter((t) => t.statut === "faite");
  const formule = (abo?.formules as unknown as { nom?: string; description?: string } | null) ?? null;

  return (
    <main className="min-h-screen px-4 py-6 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", minWidth: 0 }}>
        <h1 style={{
          fontFamily: "Georgia, 'Times New Roman', serif", color: MARINE,
          fontSize: 26, fontWeight: 700, margin: "0 0 4px",
        }}>
          🧹 Mes prestations
        </h1>
        <p style={{ color: SOUS, fontSize: 14, margin: "0 0 20px" }}>
          Box {fiche.box_loue ?? "—"} · {libelleMois(mois)}
        </p>

        {/* Sa formule. */}
        <section style={{
          background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
          borderRadius: 16, padding: 16, marginBottom: 16,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: MARINE, margin: "0 0 6px" }}>
            Ma formule
          </h2>
          {abo ? (
            <>
              <p style={{ margin: 0, fontWeight: 700, color: MARINE, fontSize: 16 }}>
                {formule?.nom ?? "Forfait"} — {Number(abo.prix_mensuel_fige ?? 0).toFixed(2)} CHF / mois
              </p>
              {formule?.description && (
                <p style={{ color: SOUS, fontSize: 13, margin: "4px 0 0" }}>{formule.description}</p>
              )}
              <p style={{ color: SOUS, fontSize: 12, margin: "6px 0 0" }}>
                Depuis le {formatDateFR(String(abo.date_debut))} ·{" "}
                {reglages.forfaitEcheance === "avance" ? "payé d'avance" : "facturé à terme échu"} ·{" "}
                absences {reglages.absenceDeduite ? "déduites" : "non déduites"}
              </p>
            </>
          ) : (
            <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>
              Aucune formule en cours. Parlez-en à la pension.
            </p>
          )}
        </section>

        {/* Sa semaine. */}
        <section style={{ marginBottom: 16, minWidth: 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: MARINE, margin: "0 0 8px" }}>
            Ma semaine
          </h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {[...parJour.entries()].map(([date, lignes]) => (
              <li key={date} style={{
                background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
                borderRadius: 14, padding: 12, minWidth: 0,
              }}>
                <p style={{
                  margin: 0, fontSize: 13, fontWeight: 700, color: MARINE,
                  textTransform: "capitalize",
                }}>
                  {jourDe(date)} {formatDateFR(date)}
                </p>
                {lignes.length === 0 ? (
                  <p style={{ color: SOUS, fontSize: 13, margin: "4px 0 0" }}>Rien de prévu.</p>
                ) : (
                  <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "grid", gap: 4 }}>
                    {lignes.map((t) => (
                      <li key={t.id} style={{
                        fontSize: 14, color: MARINE, overflowWrap: "anywhere",
                        opacity: t.statut === "annulee" ? 0.5 : 1,
                        textDecoration: t.statut === "annulee" ? "line-through" : "none",
                      }}>
                        {t.garde ? "🏠 " : "• "}{t.prestation}
                        {t.heure_prevue && <span style={{ color: SOUS }}> — {t.heure_prevue.slice(0, 5)}</span>}
                        {t.statut === "faite" && <span style={{ color: "#1F6E5B", fontWeight: 700 }}> ✓</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {semaine.some((t) => t.garde) && (
            <p style={{ color: "#6E5410", fontSize: 12, margin: "8px 0 0" }}>
              🏠 {MENTION_GARDE}
            </p>
          )}
        </section>

        {/* Ce qui a été fait. */}
        <section style={{ marginBottom: 16, minWidth: 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: MARINE, margin: "0 0 8px" }}>
            Ce qui a été fait ce mois-ci
          </h2>
          {faites.length === 0 ? (
            <p style={{ color: SOUS, fontSize: 14 }}>Rien encore.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
              {faites.map((t) => (
                <li key={t.id} style={{ fontSize: 14, color: MARINE, overflowWrap: "anywhere" }}>
                  {formatDateFR(t.date)} — {t.prestation}
                  {t.origine !== "forfait" && (
                    <span style={{ color: SOUS }}> · {t.prix_fige.toFixed(2)} CHF</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <CommandeLocataire
          clientId={fiche.id}
          abonnementId={abo?.id ?? null}
          semaineProchaine={cleSemaine(decalerJour(jour, 7))}
          prestations={((catalogue ?? []) as unknown as {
            id: string; nom: string; description: string | null; unite: string; prix: number | string;
          }[]).map((p) => ({ ...p, prix: Number(p.prix) }))}
          commandeOuverte={reglages.commandeLocataire}
        />
      </div>
    </main>
  );
}
