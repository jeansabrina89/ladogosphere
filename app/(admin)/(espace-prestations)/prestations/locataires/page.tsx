import Link from "next/link";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import EnTete from "@/app/components/ui/EnTete";
import EtatVide from "@/app/components/ui/EtatVide";
import { aujourdhuiISO, formatDateFR } from "@/src/lib/dates";
import { listeLocataires } from "@/src/lib/prestationsDb";
import { MENTION_HORS_PENSION } from "@/src/lib/prestationsLogique";
import { bornesDuMois } from "@/src/lib/factureLocataireLogique";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.6)";

/**
 * Les locataires de box.
 *
 * Ce ne sont pas des clients de la pension : leur chien vit dans le box qu'ils
 * louent, et aucun d'eux ne doit d'adhésion.
 */
export default async function LocatairesPage() {
  await exigerAccesAdmin("perm_prestations");

  const jour = aujourdhuiISO();
  const mois = jour.slice(0, 7);
  const { debut, fin } = bornesDuMois(mois);
  const locataires = await listeLocataires();

  const [{ data: abos }, { data: taches }] = await Promise.all([
    supabaseAdmin
      .from("abonnements_prestations")
      .select("client_id, prix_mensuel_fige, formules (nom)")
      .eq("statut", "actif"),
    supabaseAdmin
      .from("taches_prestations")
      .select("client_id, statut, facturable, prix_fige, garde, date")
      .gte("date", debut)
      .lte("date", fin),
  ]);

  const formuleDe = new Map<string, { nom: string; prix: number }>();
  for (const a of (abos ?? []) as unknown as (Record<string, unknown> & {
    formules?: { nom?: string } | null;
  })[]) {
    formuleDe.set(String(a.client_id), {
      nom: a.formules?.nom ?? "Forfait",
      prix: Number(a.prix_mensuel_fige ?? 0),
    });
  }

  const actesDe = new Map<string, number>();
  const gardeAujourdhui = new Set<string>();
  for (const t of (taches ?? []) as unknown as Record<string, unknown>[]) {
    const cid = String(t.client_id);
    if (t.facturable === true && t.statut === "faite") {
      actesDe.set(cid, (actesDe.get(cid) ?? 0) + Number(t.prix_fige ?? 0));
    }
    if (t.garde === true && t.statut !== "annulee" && String(t.date) === jour) {
      gardeAujourdhui.add(cid);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", minWidth: 0 }}>
        <EnTete
          titre="🏠 Locataires de box"
          sousTitre={`${locataires.length} locataire(s) · montants du mois en cours`}
        />

        {locataires.length === 0 ? (
          <EtatVide
            titre="Aucun locataire de box"
            message="Cochez « locataire de box » sur une fiche client pour lui ouvrir le catalogue."
          />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {locataires.map((l) => {
              const forfait = formuleDe.get(l.id);
              const actes = actesDe.get(l.id) ?? 0;
              const total = (forfait?.prix ?? 0) + actes + (l.loyer_refacture ?? 0);
              return (
                <li key={l.id}>
                  <Link href={`/prestations/locataires/${l.id}`} style={{
                    display: "block", background: "#FFF", textDecoration: "none",
                    border: "1px solid rgba(27,43,94,.10)", borderRadius: 16,
                    padding: 14, minWidth: 0,
                  }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                      <span style={{ fontWeight: 700, color: MARINE, fontSize: 16, overflowWrap: "anywhere" }}>
                        {l.prenom} {l.nom}
                      </span>
                      <span style={{
                        fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                        background: "#E4E7F0", color: MARINE,
                      }}>
                        Box {l.box_loue ?? "—"}
                      </span>
                      {gardeAujourdhui.has(l.id) && (
                        <span style={{
                          fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                          background: "#F4EAC9", color: "#6E5410",
                        }}>
                          🏠 Garde en cours
                        </span>
                      )}
                      <span style={{ marginLeft: "auto", fontWeight: 700, color: MARINE, fontSize: 16 }}>
                        {total.toFixed(2)} CHF
                      </span>
                    </div>
                    <p style={{ color: SOUS, fontSize: 13, margin: "6px 0 0", overflowWrap: "anywhere" }}>
                      {forfait ? `${forfait.nom} — ${forfait.prix.toFixed(2)} CHF` : "Aucune formule"}
                      {actes > 0 && ` · ${actes.toFixed(2)} CHF à l'acte`}
                      {l.loyer_refacture !== null && ` · loyer refacturé ${l.loyer_refacture.toFixed(2)} CHF`}
                    </p>
                    {l.locataire_jusqu_au && (
                      <p style={{ color: "#A8453A", fontSize: 12, margin: "4px 0 0" }}>
                        Location jusqu&apos;au {formatDateFR(l.locataire_jusqu_au)}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <p style={{
          color: SOUS, fontSize: 12, marginTop: 20,
          borderTop: "1px solid rgba(27,43,94,.08)", paddingTop: 12,
        }}>
          {MENTION_HORS_PENSION} Un locataire de box ne paie aucune adhésion.
        </p>
      </div>
    </main>
  );
}
