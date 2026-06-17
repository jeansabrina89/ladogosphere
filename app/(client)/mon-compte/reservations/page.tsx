import type { CSSProperties } from "react";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import Link from "next/link";
import { formatDateFR } from "@/src/lib/dates";
import { formatBoxLabel } from "@/src/lib/boxes";
import BoutonPaiementClient from "./BoutonPaiementClient";
import FiltresPeriode from "./FiltresPeriode";
import { aujourdhuiISO } from "@/src/lib/reservationsFiltres";
import { getCoordonneesPaiement } from "@/src/lib/coordonneesPaiement";
import { getSoldeAvoir } from "@/src/lib/avoirs";

const SERIF = "Georgia,'Times New Roman',serif";
const sWrap: CSSProperties = { maxWidth: 640, margin: "0 auto", padding: "8px 0 40px" };
const sTopnav: CSSProperties = { marginBottom: 16 };
const sTopnavA: CSSProperties = { color: "#1F6E5B", textDecoration: "none", fontWeight: 600, fontSize: 14 };
const sH1: CSSProperties = { fontFamily: SERIF, fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: "#1B2B5E" };
const sEnteteP: CSSProperties = { margin: 0, color: "rgba(27,43,94,.6)", fontSize: 14 };
const sBtnPrincipal: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", background: "#2E8B7E", color: "#fff", border: "none", borderRadius: 14, padding: "15px 18px", fontSize: 16, fontWeight: 700, margin: "14px 0 18px", textDecoration: "none" };
const sCarte: CSSProperties = { background: "#fff", border: "1px solid rgba(27,43,94,.12)", borderRadius: 18, padding: 18, marginBottom: 14 };
const sCarteHaut: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 };
const sNum: CSSProperties = { fontSize: 11.5, color: "rgba(27,43,94,.45)", fontWeight: 700, margin: 0 };
const sChiens: CSSProperties = { fontWeight: 700, fontSize: 17, margin: "2px 0 0", color: "#1B2B5E" };
const sBadges: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 };
const sBadgeBase: CSSProperties = { display: "inline-block", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" };
const sLigne: CSSProperties = { fontSize: 14, color: "rgba(27,43,94,.6)", margin: "8px 0 0" };
const sMontant: CSSProperties = { fontSize: 14.5, fontWeight: 700, color: "#1F6E5B", margin: "8px 0 0" };
const sMontantDetail: CSSProperties = { color: "rgba(27,43,94,.45)", fontWeight: 400, fontSize: 12.5 };
const sBas: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(27,43,94,.12)" };
const sLienDetail: CSSProperties = { color: "#1F6E5B", textDecoration: "none", fontWeight: 600, fontSize: 14 };
const sVide: CSSProperties = { background: "#fff", border: "1px dashed rgba(27,43,94,.12)", borderRadius: 20, padding: "34px 24px", textAlign: "center" };
const sVideIc: CSSProperties = { fontSize: 46 };
const sVideH2: CSSProperties = { fontFamily: SERIF, fontSize: 20, margin: "10px 0 6px", color: "#1B2B5E" };
const sVideP: CSSProperties = { margin: "0 0 18px", fontSize: 14, color: "rgba(27,43,94,.6)" };
const sBtnVide: CSSProperties = { ...sBtnPrincipal, margin: "0 auto", maxWidth: 280 };

function libelleType(t: string): string {
  if (t === "journee") return "Journée";
  if (t === "essai") return "Journée d'essai";
  if (t === "sejour") return "Séjour";
  return t || "—";
}

function badgeStatut(statut: string): { label: string; style: CSSProperties } {
  switch (statut) {
    case "validee": return { label: "✅ Validée", style: { background: "#DBEFEA", color: "#1F6E5B" } };
    case "en_attente": return { label: "⏳ En attente", style: { background: "#F4EAC9", color: "#6E5410" } };
    case "annulee": return { label: "❌ Annulée", style: { background: "#FBE2DE", color: "#A8453A" } };
    case "refusee": return { label: "❌ Refusée", style: { background: "#FBE2DE", color: "#A8453A" } };
    case "terminee": return { label: "🏁 Terminée", style: { background: "#EDE8DF", color: "rgba(27,43,94,.6)" } };
    default: return { label: statut || "—", style: { background: "#EDE8DF", color: "rgba(27,43,94,.6)" } };
  }
}

function badgePaiement(sp: string | null | undefined): { label: string; style: CSSProperties } {
  if (sp === "paye") return { label: "💰 Payé", style: { background: "#DBEFEA", color: "#1F6E5B" } };
  if (sp === "partiel") return { label: "💰 Partiel", style: { background: "#F4EAC9", color: "#6E5410" } };
  return { label: "💰 Impayé", style: { background: "#FBE2DE", color: "#A8453A" } };
}

export default async function MesReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ vues?: string }>;
}) {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  const params = await searchParams;

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!client) return <div style={{ padding: 24 }}>Profil introuvable</div>;

  const { data: reservationsData } = await supabase
    .from("reservations")
    .select(`*, boxes (numero, nom), reservation_chiens (chiens (nom))`)
    .eq("client_id", client.id)
    .order("date_debut", { ascending: false });

  const [coords, soldeAvoir] = await Promise.all([
    getCoordonneesPaiement(supabaseAdmin),
    getSoldeAvoir(supabaseAdmin, client.id),
  ]);

  const aujourd_hui = aujourdhuiISO();
  const estAnnulee = (r: any) => r.statut === "annulee" || r.statut === "refusee";
  const reste = (r: any) => (r.montant_final || 0) - (r.montant_paye || 0);
  const peutPayer = (r: any) =>
    (r.statut === "validee" || r.statut === "terminee") &&
    (!r.statut_paiement || r.statut_paiement === "impaye" || r.statut_paiement === "partiel") &&
    reste(r) > 0;

  const predicats: Record<string, (r: any) => boolean> = {
    futures: (r) => !estAnnulee(r) && r.date_debut > aujourd_hui,
    en_cours: (r) => !estAnnulee(r) && r.date_debut <= aujourd_hui && r.date_fin >= aujourd_hui,
    passees: (r) => !estAnnulee(r) && r.date_fin < aujourd_hui,
    annulees: (r) => estAnnulee(r),
    a_payer: (r) => peutPayer(r),
  };

  const vues = (params.vues || "").split(",").filter(Boolean).filter((v) => v in predicats);

  let liste = (reservationsData ?? []) as any[];
  if (vues.length > 0) liste = liste.filter((r) => vues.some((v) => predicats[v](r)));

  const parDebutDesc = (a: any, b: any) => (a.date_debut < b.date_debut ? 1 : a.date_debut > b.date_debut ? -1 : 0);
  const parDebutAsc = (a: any, b: any) => (a.date_debut < b.date_debut ? -1 : a.date_debut > b.date_debut ? 1 : 0);
  const parFinDesc = (a: any, b: any) => (a.date_fin < b.date_fin ? 1 : a.date_fin > b.date_fin ? -1 : 0);
  if (vues.length === 1 && (vues[0] === "futures" || vues[0] === "en_cours")) liste = [...liste].sort(parDebutAsc);
  else if (vues.length === 1 && vues[0] === "passees") liste = [...liste].sort(parFinDesc);
  else liste = [...liste].sort(parDebutDesc);

  return (
    <div style={sWrap}>
      <div style={sTopnav}>
        <Link href="/mon-compte" style={sTopnavA}>← Mon compte</Link>
      </div>

      <div>
        <h1 style={sH1}>📅 Mes réservations</h1>
        <p style={sEnteteP}>Tes demandes et séjours.</p>
      </div>

      <Link href="/mon-compte/reservations/nouvelle" style={sBtnPrincipal}>➕ Nouvelle demande</Link>

      <FiltresPeriode />

      {liste.length === 0 ? (
        <div style={sVide}>
          <div style={sVideIc}>📅</div>
          <h2 style={sVideH2}>Aucune réservation ici</h2>
          <p style={sVideP}>Aucune réservation ne correspond à ta sélection.</p>
          <Link href="/mon-compte/reservations/nouvelle" style={sBtnVide}>➕ Faire une demande</Link>
        </div>
      ) : (
        liste.map((res: any) => {
          const chiens = res.reservation_chiens?.map((rc: any) => rc.chiens?.nom).filter(Boolean) ?? [];
          const resteAPayer = reste(res);
          const montrerPayer = peutPayer(res);
          const bs = badgeStatut(res.statut);
          const bp = badgePaiement(res.statut_paiement);
          return (
            <div key={res.id} style={sCarte}>
              <div style={sCarteHaut}>
                <div style={{ minWidth: 0 }}>
                  <p style={sNum}>Réservation N°{res.numero}</p>
                  <p style={sChiens}>🐶 {chiens.join(", ") || "—"}</p>
                </div>
                <div style={sBadges}>
                  <span style={{ ...sBadgeBase, ...bs.style }}>{bs.label}</span>
                  <span style={{ ...sBadgeBase, ...bp.style }}>{bp.label}</span>
                </div>
              </div>
              <p style={sLigne}>📅 {formatDateFR(res.date_debut)} → {formatDateFR(res.date_fin)}</p>
              <p style={sLigne}>🏠 {formatBoxLabel(res.boxes)} · {libelleType(res.type_reservation)}</p>
              {res.montant_final > 0 ? (
                <p style={sMontant}>
                  💰 {Number(res.montant_final).toFixed(2)} CHF
                  {res.statut_paiement === "partiel" && res.montant_paye > 0 ? (
                    <span style={sMontantDetail}> (payé : {Number(res.montant_paye).toFixed(2)} · reste : {resteAPayer.toFixed(2)} CHF)</span>
                  ) : null}
                </p>
              ) : null}
              <div style={sBas}>
                <Link href={`/mon-compte/reservations/${res.id}`} style={sLienDetail}>Voir le détail →</Link>
                {montrerPayer ? (
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
                ) : null}
              </div>
            </div>
          );
        })
      )}

      <div style={{ marginTop: 24 }}>
        <Link href="/mon-compte" style={sTopnavA}>← Retour à mon compte</Link>
      </div>
    </div>
  );
}
