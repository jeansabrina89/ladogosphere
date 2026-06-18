import type { CSSProperties, ReactNode } from "react";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import Link from "next/link";
import { formatDateFR, formatHeure } from "@/src/lib/dates";
import { formatBoxLabel } from "@/src/lib/boxes";
import { getMouvementsAvoirReservation, getSoldeAvoir } from "@/src/lib/avoirs";
import { getCoordonneesPaiement } from "@/src/lib/coordonneesPaiement";
import { Wallet } from "lucide-react";
import BoutonPaiementClient from "../BoutonPaiementClient";

const MARINE = "#1B2B5E";
const SERIF = "Georgia,'Times New Roman',serif";

const sMain: CSSProperties = { minHeight: "100vh", backgroundColor: "#F5F0E8", padding: "32px 16px" };
const sWrap: CSSProperties = { maxWidth: 600, margin: "0 auto" };
const sTopnav: CSSProperties = { marginBottom: 16 };
const sTopnavA: CSSProperties = { color: "#1F6E5B", textDecoration: "none", fontWeight: 600, fontSize: 14 };
const sCarte: CSSProperties = { background: "#fff", border: "1px solid rgba(27,43,94,.12)", borderRadius: 18, padding: 22, marginBottom: 16 };
const sSecTitre: CSSProperties = { fontFamily: SERIF, fontSize: 19, fontWeight: 700, color: MARINE, margin: "0 0 12px" };
const sLigne: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "7px 0", borderBottom: "1px solid rgba(27,43,94,.06)" };
const sLabel: CSSProperties = { color: "rgba(27,43,94,.6)", fontSize: 14 };
const sVal: CSSProperties = { color: MARINE, fontWeight: 600, fontSize: 14, textAlign: "right" };
const sBadge: CSSProperties = { display: "inline-block", fontSize: 12.5, fontWeight: 700, padding: "5px 12px", borderRadius: 999 };

const LABELS_TYPE_AVOIR_RESERVATION: Record<string, string> = {
  utilisation: "Avoir utilisé",
  trop_percu: "Trop-perçu crédité en avoir",
  annulation_paiement: "Paiement annulé (crédité en avoir)",
};

function libelleType(t: string): string {
  if (t === "journee") return "Journée";
  if (t === "essai") return "Journée d'essai";
  if (t === "sejour") return "Séjour";
  return t || "—";
}

function badgeStatut(statut: string): { label: string; bg: string; color: string } {
  switch (statut) {
    case "validee": return { label: "✅ Validée", bg: "#DBEFEA", color: "#1F6E5B" };
    case "en_attente": return { label: "⏳ En attente", bg: "#F4EAC9", color: "#6E5410" };
    case "annulee": return { label: "❌ Annulée", bg: "#FBE2DE", color: "#A8453A" };
    case "terminee": return { label: "🏁 Terminée", bg: "#EDE8DF", color: "#1B2B5E" };
    default: return { label: statut || "—", bg: "#EDE8DF", color: "#1B2B5E" };
  }
}

function Ligne({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={sLigne}>
      <span style={sLabel}>{label}</span>
      <span style={sVal}>{children}</span>
    </div>
  );
}

function BadgePaiement({ statut }: { statut: string | null }) {
  const v =
    statut === "paye" ? { label: "💰 Payé", bg: "#DBEFEA", color: "#1F6E5B" } :
    statut === "partiel" ? { label: "💰 Partiel", bg: "#F4EAC9", color: "#6E5410" } :
    { label: "💰 Impayé", bg: "#FBE2DE", color: "#A8453A" };
  return <span style={{ ...sBadge, fontSize: 12, padding: "3px 10px", background: v.bg, color: v.color }}>{v.label}</span>;
}

export default async function DetailReservationClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: res } = await supabase
    .from("reservations")
    .select(`*, boxes (numero, nom), reservation_chiens (chiens (nom)), reservation_extras (id, libelle, montant)`)
    .eq("id", id)
    .maybeSingle();

  if (!res) {
    return (
      <main style={sMain}>
        <div style={sWrap}>
          <div style={{ ...sCarte, textAlign: "center" }}>
            <p style={{ color: "rgba(27,43,94,.6)", fontSize: 14, margin: "0 0 12px" }}>Réservation introuvable.</p>
            <Link href="/mon-compte/reservations" style={sTopnavA}>← Retour à mes réservations</Link>
          </div>
        </div>
      </main>
    );
  }

  const chiens = res.reservation_chiens?.map((rc: any) => rc.chiens?.nom).filter(Boolean) ?? [];
  const resteAPayer = (res.montant_final || 0) - (res.montant_paye || 0);

  const [mouvementsAvoir, coords, soldeAvoir] = await Promise.all([
    getMouvementsAvoirReservation(supabase, res.client_id, id),
    getCoordonneesPaiement(supabaseAdmin),
    getSoldeAvoir(supabaseAdmin, res.client_id),
  ]);

  const peutPayer =
    (res.statut === "validee" || res.statut === "terminee") &&
    (!res.statut_paiement || res.statut_paiement === "impaye" || res.statut_paiement === "partiel") &&
    resteAPayer > 0;

  const st = badgeStatut(res.statut);

  return (
    <main style={sMain}>
      <div style={sWrap}>
        <div style={sTopnav}>
          <Link href="/mon-compte/reservations" style={sTopnavA}>← Mes réservations</Link>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "rgba(27,43,94,.45)", letterSpacing: ".3px" }}>
            Réservation n°{res.numero}
          </p>
          <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: MARINE, margin: "2px 0 10px" }}>
            🐾 {chiens.join(", ") || "—"}
          </h1>
          <span style={{ ...sBadge, background: st.bg, color: st.color }}>{st.label}</span>
        </div>

        <div style={sCarte}>
          <p style={sSecTitre}>📋 Détails</p>
          <Ligne label="Type">{libelleType(res.type_reservation)}</Ligne>
          <Ligne label="Dates">{formatDateFR(res.date_debut)} → {formatDateFR(res.date_fin)}</Ligne>
          {(res.heure_arrivee || res.heure_depart) && (
            <Ligne label="Horaires">{formatHeure(res.heure_arrivee) || "—"} → {formatHeure(res.heure_depart) || "—"}</Ligne>
          )}
          <Ligne label="Box">{formatBoxLabel(res.boxes)}</Ligne>
        </div>

        <div style={sCarte}>
          <p style={sSecTitre}>💰 Paiement</p>
          {res.reservation_extras && res.reservation_extras.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "rgba(27,43,94,.5)" }}>Lignes supplémentaires</p>
              {res.reservation_extras.map((extra: any) => (
                <div key={extra.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "3px 0", color: MARINE }}>
                  <span>{extra.libelle}</span>
                  <span>{Number(extra.montant) > 0 ? "+" : ""}{Number(extra.montant).toFixed(2)} CHF</span>
                </div>
              ))}
            </div>
          )}
          <Ligne label="Montant">{Number(res.montant_final) > 0 ? `${Number(res.montant_final).toFixed(2)} CHF` : "—"}</Ligne>
          <Ligne label="Payé">{Number(res.montant_paye || 0).toFixed(2)} CHF</Ligne>
          {resteAPayer > 0 && res.statut !== "annulee" && (
            <Ligne label="Reste à payer"><span style={{ color: "#A8453A", fontWeight: 700 }}>{resteAPayer.toFixed(2)} CHF</span></Ligne>
          )}
          <Ligne label="Statut paiement"><BadgePaiement statut={res.statut_paiement} /></Ligne>
        </div>

        {peutPayer && (
          <div style={sCarte}>
            <BoutonPaiementClient
              reservation_id={res.id}
              numero={res.numero}
              iban={coords.iban}
              titulaire={coords.titulaire}
              montant_final={res.montant_final || 0}
              montant_paye={res.montant_paye || 0}
              statut_paiement={res.statut_paiement || "impaye"}
              soldeAvoir={soldeAvoir}
            />
          </div>
        )}

        {mouvementsAvoir.length > 0 && (
          <div style={sCarte}>
            <p style={{ ...sSecTitre, display: "flex", alignItems: "center", gap: 8 }}>
              <Wallet size={20} style={{ color: "#4AAEA0" }} />Avoir lié à cette réservation
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {mouvementsAvoir.map((m) => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid rgba(27,43,94,.1)", borderRadius: 12, padding: "10px 12px" }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 13.5, color: MARINE }}>
                      {LABELS_TYPE_AVOIR_RESERVATION[m.type] ?? m.type}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "rgba(27,43,94,.5)" }}>
                      {m.motif ? `${m.motif} — ` : ""}{formatDateFR(new Date(m.created_at))}
                    </p>
                  </div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: m.montant < 0 ? "#DC2626" : "#4AAEA0" }}>
                    {m.montant >= 0 ? "+" : ""}{m.montant.toFixed(2)} CHF
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
