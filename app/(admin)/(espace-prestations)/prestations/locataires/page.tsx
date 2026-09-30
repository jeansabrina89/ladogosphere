import Link from "next/link";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import EnTete from "@/app/components/ui/EnTete";
import EtatVide from "@/app/components/ui/EtatVide";
import { aujourdhuiISO, formatDateFR } from "@/src/lib/dates";
import { derniereFactureMensuelleParClient, listeLocataires } from "@/src/lib/prestationsDb";
import { MENTION_HORS_PENSION } from "@/src/lib/prestationsLogique";
import { bornesDuMois } from "@/src/lib/factureLocataireLogique";
import {
  AIDE_BOX_REFACTURES,
  TITRE_BOX_PRIVE,
  TITRE_BOX_REFACTURES,
  VIDE_BOX_PRIVE,
  VIDE_BOX_REFACTURES,
  repartirBox,
} from "@/src/lib/boxPriveLogique";
import AjouterLocataire from "./AjouterLocataire";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.6)";
const BORDURE = "1px solid rgba(27,43,94,.10)";

/**
 * Les clients box privé, et les box refacturés.
 *
 * ── DEUX RELATIONS QU'ON APPELAIT PAREIL ──────────────────────────────────
 *
 * Huit box du chenil se louent directement à la propriétaire. Sabrina ne
 * refacture aucun loyer à ces clients : elle leur vend des prestations. Ce sont
 * les CLIENTS BOX PRIVÉ, et aucun d'eux ne doit d'adhésion.
 *
 * Un seul box, aujourd'hui, a son loyer refacturé par Sabrina : il y a un
 * montant mensuel, une période, un prorata. C'est un BOX REFACTURÉ, et ce n'est
 * pas la même chose.
 *
 * Les deux vivaient dans la même liste, sous le même mot, et l'un des deux
 * portait un champ « loyer » que l'autre n'aurait jamais dû voir. Un champ
 * qu'on ne devrait pas remplir finit par l'être.
 *
 * La répartition ne demande AUCUNE colonne de plus : le montant est la
 * distinction (`src/lib/boxPriveLogique.ts`).
 */
export default async function LocatairesPage() {
  await exigerAccesAdmin("perm_prestations");

  const jour = aujourdhuiISO();
  const mois = jour.slice(0, 7);
  const { debut, fin } = bornesDuMois(mois);
  const locataires = await listeLocataires();
  const { prives, refactures } = repartirBox(locataires);

  const [{ data: abos }, { data: taches }, { data: chiens }, derniereFacture] = await Promise.all([
    supabaseAdmin
      .from("abonnements_prestations")
      .select("client_id, prix_mensuel_fige, formules (nom)")
      .eq("statut", "actif"),
    supabaseAdmin
      .from("taches_prestations")
      .select("client_id, statut, facturable, prix_fige, garde, date")
      .gte("date", debut)
      .lte("date", fin),
    // Les chiens des clients box privé : c'est une colonne de leur tableau.
    supabaseAdmin
      .from("chiens")
      .select("nom, client_id")
      .in("client_id", prives.map((p) => p.id).concat("00000000-0000-0000-0000-000000000000")),
    derniereFactureMensuelleParClient(refactures.map((r) => r.id)),
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

  const chiensDe = new Map<string, string[]>();
  for (const c of ((chiens ?? []) as { nom: string | null; client_id: string }[])) {
    const liste = chiensDe.get(c.client_id) ?? [];
    if (c.nom) liste.push(c.nom);
    chiensDe.set(c.client_id, liste);
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

  const carte: React.CSSProperties = {
    display: "block", background: "#FFF", textDecoration: "none",
    border: BORDURE, borderRadius: 16, padding: 14, minWidth: 0,
  };
  const pastille: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
    background: "#E4E7F0", color: MARINE,
  };
  const titreSection: React.CSSProperties = {
    fontFamily: "Georgia, 'Times New Roman', serif", color: MARINE,
    fontSize: 18, fontWeight: 700, margin: "0 0 8px",
  };

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", minWidth: 0 }}>
        <EnTete
          titre="🏠 Box du chenil"
          sousTitre={`${prives.length} client(s) box privé · ${refactures.length} box refacturé(s) · montants du mois en cours`}
        />

        {/*
          Deux boutons, et c'est le cœur du lot : le formulaire qui s'ouvre
          derrière n'est PAS le même. « Client box privé » ne montre aucun champ
          loyer et n'en écrit jamais ; « Box refacturé » l'exige.
        */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <AjouterLocataire sorte="prive" />
          <AjouterLocataire sorte="refacture" />
        </div>

        {/* ── Les clients box privé ───────────────────────────────────── */}
        <section style={{ marginBottom: 28 }}>
          <h2 style={titreSection}>{TITRE_BOX_PRIVE}</h2>

          {prives.length === 0 ? (
            <EtatVide
              titre={VIDE_BOX_PRIVE}
              message="Ajoutez un client box privé : cherchez le client, puis cochez « Client box privé » sur sa fiche."
            />
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
              {prives.map((l) => {
                const forfait = formuleDe.get(l.id);
                const actes = actesDe.get(l.id) ?? 0;
                const total = (forfait?.prix ?? 0) + actes;
                const sesChiens = chiensDe.get(l.id) ?? [];
                return (
                  <li key={l.id}>
                    <Link href={`/prestations/locataires/${l.id}`} style={carte}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                        <span style={{ fontWeight: 700, color: MARINE, fontSize: 16, overflowWrap: "anywhere" }}>
                          {l.prenom} {l.nom}
                        </span>
                        <span style={pastille}>Box {l.box_loue ?? "—"}</span>
                        {gardeAujourdhui.has(l.id) && (
                          <span style={{ ...pastille, background: "#F4EAC9", color: "#6E5410", fontWeight: 700 }}>
                            🏠 Garde en cours
                          </span>
                        )}
                        <span style={{ marginLeft: "auto", fontWeight: 700, color: MARINE, fontSize: 16 }}>
                          {total.toFixed(2)} CHF
                        </span>
                      </div>
                      <p style={{ color: SOUS, fontSize: 13, margin: "6px 0 0", overflowWrap: "anywhere" }}>
                        {sesChiens.length > 0 ? `🐶 ${sesChiens.join(", ")} · ` : ""}
                        {forfait ? `${forfait.nom} — ${forfait.prix.toFixed(2)} CHF` : "Aucune formule"}
                        {actes > 0 && ` · ${actes.toFixed(2)} CHF à l'acte`}
                        {l.locataire_depuis && ` · depuis le ${formatDateFR(l.locataire_depuis)}`}
                      </p>
                      {l.locataire_jusqu_au && (
                        <p style={{ color: "#A8453A", fontSize: 12, margin: "4px 0 0" }}>
                          Jusqu&apos;au {formatDateFR(l.locataire_jusqu_au)}
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── Les box refacturés ──────────────────────────────────────── */}
        <section>
          <h2 style={titreSection}>{TITRE_BOX_REFACTURES}</h2>
          <p style={{ color: SOUS, fontSize: 13, margin: "0 0 10px" }}>{AIDE_BOX_REFACTURES}</p>

          {refactures.length === 0 ? (
            <EtatVide
              titre={VIDE_BOX_REFACTURES}
              message="Un box refacturé porte un loyer mensuel, facturé au client en plus de ses prestations."
            />
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
              {refactures.map((l) => {
                const forfait = formuleDe.get(l.id);
                const actes = actesDe.get(l.id) ?? 0;
                const loyer = Number(l.loyer_refacture ?? 0);
                const total = (forfait?.prix ?? 0) + actes + loyer;
                return (
                  <li key={l.id}>
                    <Link href={`/prestations/locataires/${l.id}`} style={carte}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                        <span style={{ fontWeight: 700, color: MARINE, fontSize: 16, overflowWrap: "anywhere" }}>
                          {l.prenom} {l.nom}
                        </span>
                        <span style={pastille}>Box {l.box_loue ?? "—"}</span>
                        <span style={{ ...pastille, background: "#DBEFEA", color: "#1F6E5B", fontWeight: 700 }}>
                          🧾 {loyer.toFixed(2)} CHF / mois
                        </span>
                        <span style={{ marginLeft: "auto", fontWeight: 700, color: MARINE, fontSize: 16 }}>
                          {total.toFixed(2)} CHF
                        </span>
                      </div>
                      <p style={{ color: SOUS, fontSize: 13, margin: "6px 0 0", overflowWrap: "anywhere" }}>
                        {l.locataire_depuis ? `Depuis le ${formatDateFR(l.locataire_depuis)}` : "Depuis —"}
                        {l.locataire_jusqu_au && ` · jusqu'au ${formatDateFR(l.locataire_jusqu_au)}`}
                        {` · dernière facture mensuelle : ${derniereFacture.get(l.id) ?? "—"}`}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p style={{
          color: SOUS, fontSize: 12, marginTop: 20,
          borderTop: "1px solid rgba(27,43,94,.08)", paddingTop: 12,
        }}>
          {MENTION_HORS_PENSION} Un client box privé ne paie aucune adhésion.
        </p>
      </div>
    </main>
  );
}
