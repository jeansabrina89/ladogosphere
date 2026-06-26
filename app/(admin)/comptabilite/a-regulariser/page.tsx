import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  sejour: "Séjour",
  journee: "Journée",
  garderie: "Garderie",
  essai: "Journée d'essai",
  reguliere: "Réservation régulière",
  ponctuelle: "Réservation ponctuelle",
};

function typeLabel(t: string | null) {
  if (!t) return "—";
  return TYPE_LABELS[t] ?? t;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function chf(n: number) {
  return n.toFixed(2) + " CHF";
}

function nomClient(clients: any): string {
  const c = Array.isArray(clients) ? clients[0] : clients;
  if (!c) return "Client";
  return [c.prenom, c.nom].filter(Boolean).join(" ") || "Client";
}

export default async function ARegulariserPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/");

  const { data: resas } = await supabaseAdmin
    .from("reservations")
    .select(
      "id, type_reservation, date_debut, date_fin, statut, offerte, montant_final, montant_calcule, montant_paye, clients (prenom, nom)"
    )
    .order("date_fin", { ascending: true });

  const today = new Date().toISOString().slice(0, 10);
  const liste = (resas ?? []) as any[];

  const aCloturer = liste.filter(
    (r) => r.date_fin && r.date_fin < today && r.statut === "validee"
  );

  const impayes = liste
    .filter((r) => {
      if (!r.date_fin || r.date_fin >= today) return false;
      if (r.offerte) return false;
      if (["annulee", "refusee", "en_attente"].includes(r.statut)) return false;
      const du = Number(r.montant_final ?? r.montant_calcule ?? 0);
      const paye = Number(r.montant_paye ?? 0);
      return paye < du - 0.001;
    })
    .map((r) => {
      const du = Number(r.montant_final ?? r.montant_calcule ?? 0);
      const paye = Number(r.montant_paye ?? 0);
      return { r, du, paye, solde: du - paye };
    });

  const th: CSSProperties = {
    textAlign: "left",
    fontSize: "12px",
    color: "#6B7280",
    fontWeight: 600,
    padding: "6px 8px",
    borderBottom: "1px solid #EDE8DF",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
  };
  const td: CSSProperties = {
    fontSize: "14px",
    color: "#1B2B5E",
    padding: "8px",
    borderBottom: "1px solid #F5F0E8",
  };
  const lien: CSSProperties = { color: "#2E8B7E", fontWeight: 600, textDecoration: "none" };

  return (
    <div style={{ padding: "24px", maxWidth: "900px", margin: "0 auto" }}>
      <EnTete
        titre="🧾 À régulariser"
        sousTitre="Séjours passés à clôturer (chiffre d'affaires en attente) et soldes impayés à relancer."
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <Carte accent="or">
          <h3 style={{ margin: "0 0 4px 0", color: "#1B2B5E", fontSize: "16px", fontWeight: 700 }}>
            À clôturer ({aCloturer.length})
          </h3>
          <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#6B7280" }}>
            Séjours dont la date est passée mais encore au statut « validé ». Tant qu'ils ne sont pas passés en « terminé », leur chiffre d'affaires n'est pas comptabilisé.
          </p>
          {aCloturer.length === 0 ? (
            <p style={{ margin: 0, color: "#9CA3AF", fontSize: "14px" }}>Rien à clôturer. 🎉</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Client</th>
                  <th style={th}>Type</th>
                  <th style={th}>Arrivée</th>
                  <th style={th}>Départ</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {aCloturer.map((r) => (
                  <tr key={r.id}>
                    <td style={td}>{nomClient(r.clients)}</td>
                    <td style={td}>{typeLabel(r.type_reservation)}</td>
                    <td style={td}>{formatDate(r.date_debut)}</td>
                    <td style={td}>{formatDate(r.date_fin)}</td>
                    <td style={td}>
                      <a href={`/reservations/${r.id}`} style={lien}>Ouvrir →</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Carte>

        <Carte accent="rose">
          <h3 style={{ margin: "0 0 4px 0", color: "#1B2B5E", fontSize: "16px", fontWeight: 700 }}>
            Impayés ({impayes.length})
          </h3>
          <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#6B7280" }}>
            Séjours passés (hors offerts) dont le montant payé est inférieur au montant dû.
          </p>
          {impayes.length === 0 ? (
            <p style={{ margin: 0, color: "#9CA3AF", fontSize: "14px" }}>Aucun impayé. 🎉</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Client</th>
                  <th style={th}>Départ</th>
                  <th style={th}>Dû</th>
                  <th style={th}>Payé</th>
                  <th style={th}>Solde</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {impayes.map(({ r, du, paye, solde }) => (
                  <tr key={r.id}>
                    <td style={td}>{nomClient(r.clients)}</td>
                    <td style={td}>{formatDate(r.date_fin)}</td>
                    <td style={td}>{chf(du)}</td>
                    <td style={td}>{chf(paye)}</td>
                    <td style={{ ...td, fontWeight: 700, color: "#E8847A" }}>{chf(solde)}</td>
                    <td style={td}>
                      <a href={`/reservations/${r.id}`} style={lien}>Ouvrir →</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Carte>
      </div>
    </div>
  );
}
