import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import EnTete from "@/app/components/ui/EnTete";
import { aujourdhuiISO, formatDateFR } from "@/src/lib/dates";
import {
  ficheLocataire,
  loyerPayeDuMois,
  tachesDuClient,
} from "@/src/lib/prestationsDb";
import {
  MENTION_HORS_PENSION,
  cleSemaine,
  decalerJour,
} from "@/src/lib/prestationsLogique";
import { bornesDuMois, libelleMois, proratLoyer } from "@/src/lib/factureLocataireLogique";
import FicheLocataireForms, { type LignePerso } from "./FicheLocataire";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.6)";

/**
 * La fiche d'un locataire : son box, sa formule, ses jours, son historique et
 * le montant du mois en cours.
 *
 * Le loyer payé à la propriétaire s'affiche À CÔTÉ du loyer refacturé. Les deux
 * peuvent différer — frais, arrondi, décision commerciale — et l'écart doit se
 * voir sans avoir à le chercher.
 */
export default async function FicheLocatairePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const acces = await exigerAccesAdmin("perm_prestations");
  const { id } = await params;

  const fiche = await ficheLocataire(id);
  if (!fiche) notFound();

  const { client, abonnement } = fiche;
  const jour = aujourdhuiISO();
  const mois = jour.slice(0, 7);
  const { debut, fin } = bornesDuMois(mois);

  const [taches, loyerPaye, { data: lignesFormule }, { data: formules }, { data: prestations }, { data: chiens }] =
    await Promise.all([
      tachesDuClient(id, debut, fin),
      loyerPayeDuMois(client.box_loue as string | null, debut, fin),
      abonnement
        ? supabaseAdmin
            .from("formules_lignes")
            .select("prestation_id, jours, prestations (nom)")
            .eq("formule_id", abonnement.formule_id)
            .order("ordre")
        : Promise.resolve({ data: [] }),
      supabaseAdmin.from("formules").select("id, nom, prix_mensuel").eq("actif", true).order("ordre"),
      supabaseAdmin.from("prestations").select("id, nom, unite, prix").eq("actif", true).order("ordre"),
      supabaseAdmin.from("chiens").select("id, nom").eq("client_id", id).eq("actif", true).order("nom"),
    ]);

  const forfait = abonnement
    ? {
        nom: (abonnement.formules as unknown as { nom?: string } | null)?.nom ?? "Forfait",
        prix: Number(abonnement.prix_mensuel_fige ?? 0),
      }
    : null;
  const actes = taches
    .filter((t) => t.facturable && t.statut === "faite")
    .reduce((s, t) => s + t.prix_fige, 0);
  const loyer = client.loyer_refacture === null ? null : Number(client.loyer_refacture);
  const prorat = loyer
    ? proratLoyer({
        mois,
        depuis: client.locataire_depuis as string | null,
        jusquAu: client.locataire_jusqu_au as string | null,
      })
    : null;
  const loyerDuMois = loyer && prorat
    ? Math.round((prorat.complet ? loyer : (loyer * prorat.jours) / prorat.joursDuMois) * 100) / 100
    : 0;
  const total = (forfait?.prix ?? 0) + actes + loyerDuMois;

  const gardeEnCours = taches.some((t) => t.garde && t.statut !== "annulee" && t.date === jour);
  const semaineProchaine = cleSemaine(decalerJour(jour, 7));
  const peutModifier = acces.isAdmin || acces.permissions.perm_encaissements === true;

  const lignesPerso: LignePerso[] = ((lignesFormule ?? []) as unknown as (Record<string, unknown> & {
    prestations?: { nom?: string } | null;
  })[]).map((l) => ({
    prestation_id: String(l.prestation_id),
    nom: l.prestations?.nom ?? "—",
    jours: (l.jours as string[] | null) ?? null,
  }));

  const chiffre = (n: number) => `${n.toFixed(2)} CHF`;

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", minWidth: 0 }}>
        <EnTete
          titre={`🏠 ${client.prenom ?? ""} ${client.nom ?? ""}`.trim()}
          sousTitre={`Box ${client.box_loue ?? "—"} · locataire de box`}
        />

        {gardeEnCours && (
          <p style={{
            background: "#F4EAC9", border: "1px solid #C9A84C", color: "#6E5410",
            borderRadius: 14, padding: "10px 12px", fontSize: 14, fontWeight: 600,
            margin: "0 0 16px",
          }}>
            🏠 Garde complète en cours aujourd&apos;hui. Le chien reste dans son box et la pension en
            répond 24 h.
          </p>
        )}

        {/* Les chiffres du mois. */}
        <div className="grid gap-3" style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20,
        }}>
          {[
            { titre: `Forfait — ${libelleMois(mois)}`, valeur: chiffre(forfait?.prix ?? 0), note: forfait?.nom ?? "Aucune formule" },
            { titre: "Prestations à l'acte", valeur: chiffre(actes), note: `${taches.filter((t) => t.facturable && t.statut === "faite").length} faite(s)` },
            { titre: "Loyer refacturé", valeur: loyer === null ? "— à saisir —" : chiffre(loyerDuMois), note: prorat && !prorat.complet ? `${prorat.jours} jour(s) sur ${prorat.joursDuMois}` : "mois entier" },
            { titre: "Total du mois", valeur: chiffre(total), note: "hors ajustements" },
          ].map((c) => (
            <div key={c.titre} style={{
              background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
              borderRadius: 16, padding: 14, minWidth: 0,
            }}>
              <p style={{ color: SOUS, fontSize: 12, margin: 0 }}>{c.titre}</p>
              <p style={{ color: MARINE, fontSize: 20, fontWeight: 700, margin: "4px 0 0", overflowWrap: "anywhere" }}>
                {c.valeur}
              </p>
              <p style={{ color: SOUS, fontSize: 12, margin: "2px 0 0" }}>{c.note}</p>
            </div>
          ))}
        </div>

        {/* Le loyer payé et le loyer refacturé, côte à côte : l'écart se voit. */}
        {(loyer !== null || loyerPaye > 0) && (
          <section style={{
            background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
            borderRadius: 16, padding: 16, marginBottom: 20,
          }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: MARINE, margin: "0 0 8px" }}>
              Le loyer du box, des deux côtés
            </h2>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <div>
                <p style={{ color: SOUS, fontSize: 12, margin: 0 }}>Payé à la propriétaire (6000)</p>
                <p style={{ color: MARINE, fontSize: 18, fontWeight: 700, margin: "2px 0 0" }}>
                  {chiffre(loyerPaye)}
                </p>
              </div>
              <div>
                <p style={{ color: SOUS, fontSize: 12, margin: 0 }}>Refacturé au locataire (3021)</p>
                <p style={{ color: MARINE, fontSize: 18, fontWeight: 700, margin: "2px 0 0" }}>
                  {loyer === null ? "— à saisir —" : chiffre(loyerDuMois)}
                </p>
              </div>
              <div>
                <p style={{ color: SOUS, fontSize: 12, margin: 0 }}>Écart</p>
                <p style={{
                  fontSize: 18, fontWeight: 700, margin: "2px 0 0",
                  color: Math.abs(loyerDuMois - loyerPaye) < 0.005 ? "#1F6E5B" : "#C9A84C",
                }}>
                  {chiffre(loyerDuMois - loyerPaye)}
                </p>
              </div>
            </div>
            <p style={{ color: SOUS, fontSize: 12, margin: "10px 0 0" }}>
              Le montant refacturé est saisi, jamais calculé depuis la dépense : les deux peuvent
              différer. Il ne dépend d&apos;aucune tâche et n&apos;est jamais déduit pour absence — il
              court tant que le locataire occupe le box.
              {client.locataire_jusqu_au && ` Il s'arrête le ${formatDateFR(client.locataire_jusqu_au as string)}.`}
            </p>
          </section>
        )}

        <FicheLocataireForms
          client={{
            id: String(client.id),
            prenom: (client.prenom as string | null) ?? null,
            nom: (client.nom as string | null) ?? null,
            box_loue: (client.box_loue as string | null) ?? null,
            loyer_refacture: loyer,
            locataire_depuis: (client.locataire_depuis as string | null) ?? null,
            locataire_jusqu_au: (client.locataire_jusqu_au as string | null) ?? null,
          }}
          abonnementId={abonnement?.id ?? null}
          lignesFormule={lignesPerso}
          semaineProchaine={semaineProchaine}
          formules={((formules ?? []) as unknown as { id: string; nom: string; prix_mensuel: number | string }[])
            .map((f) => ({ ...f, prix_mensuel: Number(f.prix_mensuel) }))}
          prestations={((prestations ?? []) as unknown as { id: string; nom: string; unite: string; prix: number | string }[])
            .map((p) => ({ ...p, prix: Number(p.prix) }))}
          chiens={(chiens ?? []) as { id: string; nom: string }[]}
          peutModifier={peutModifier}
        />

        {/* L'historique du mois. */}
        <section style={{ marginTop: 20, minWidth: 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: MARINE, margin: "0 0 8px" }}>
            Ses prestations — {libelleMois(mois)}
          </h2>
          {taches.length === 0 ? (
            <p style={{ color: SOUS, fontSize: 14 }}>Aucune prestation ce mois-ci.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
              {taches.map((t) => (
                <li key={t.id} style={{
                  background: "#FFF", border: "1px solid rgba(27,43,94,.10)",
                  borderLeft: t.garde ? "4px solid #C9A84C" : "1px solid rgba(27,43,94,.10)",
                  borderRadius: 12, padding: "10px 12px", fontSize: 14, minWidth: 0,
                  opacity: t.statut === "annulee" ? 0.55 : 1,
                }}>
                  <span style={{ color: SOUS }}>{formatDateFR(t.date)}</span>
                  {" · "}
                  <span style={{
                    fontWeight: 600, color: MARINE, overflowWrap: "anywhere",
                    textDecoration: t.statut === "annulee" ? "line-through" : "none",
                  }}>
                    {t.garde ? "🏠 " : ""}{t.prestation}
                  </span>
                  {" · "}
                  <span style={{ color: SOUS }}>
                    {t.origine === "forfait" ? "au forfait" : `${t.prix_fige.toFixed(2)} CHF`}
                  </span>
                  {t.statut === "faite" && <span style={{ color: "#1F6E5B", fontWeight: 700 }}> ✓ faite</span>}
                  {t.statut === "annulee" && (
                    <span style={{ color: "#A8453A" }}> — annulée : {t.motif_annulation}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p style={{
          color: SOUS, fontSize: 12, marginTop: 20,
          borderTop: "1px solid rgba(27,43,94,.08)", paddingTop: 12,
        }}>
          {MENTION_HORS_PENSION} Ce locataire ne doit aucune adhésion.{" "}
          <Link href="/prestations/facturer" style={{ color: MARINE, fontWeight: 600 }}>
            Facturer le mois
          </Link>
        </p>
      </div>
    </main>
  );
}
