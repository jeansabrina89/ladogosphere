import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatDateFR } from "@/src/lib/dates";
import { etatFacture, libelleEtatFacture, couleursEtatFacture } from "@/src/lib/factureStatut";

// Mes factures — le client ne voit QUE les siennes (le filtre est posé ici sur
// son client_id, et la RLS de `factures` dit la même chose).

const MARINE = "#1B2B5E";
const GRIS = "rgba(27,43,94,0.6)";
const chf = (n: number) => `${(Number(n) || 0).toFixed(2)} CHF`;

type FactureClient = {
  id: string; numero: string | null; type: string; statut: string;
  date_facture: string | null; date_echeance: string | null;
  montant_total: number | string; montant_restant: number | string;
};

export default async function MesFacturesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: client } = await supabaseAdmin
    .from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();

  const { data: brutes } = client
    ? await supabaseAdmin
        .from("factures")
        .select("id, numero, type, statut, date_facture, date_echeance, montant_total, montant_restant")
        .eq("client_id", client.id)
        .not("numero", "is", null)
        .order("date_facture", { ascending: false })
    : { data: [] };

  const factures = (brutes ?? []) as FactureClient[];
  const aujourdhui = new Date().toISOString().split("T")[0];
  const totalDu = factures
    .filter((f) => f.type !== "avoir" && f.statut !== "annulee" && f.statut !== "annulee_par_avoir")
    .reduce((s, f) => s + Math.max(Number(f.montant_restant) || 0, 0), 0);

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#F5F0E8", padding: "32px 20px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 30, fontWeight: 700, color: MARINE, margin: 0 }}>
              Mes factures
            </h1>
            {totalDu > 0 && (
              <p style={{ color: "#A8453A", fontWeight: 600, margin: "6px 0 0" }}>
                Reste à payer : {chf(totalDu)}
              </p>
            )}
          </div>
          <Link href="/mon-compte"
                style={{ padding: "10px 18px", borderRadius: 12, backgroundColor: "#EDE8DF", color: MARINE, fontWeight: 600, textDecoration: "none" }}>
            ← Mon compte
          </Link>
        </div>

        {factures.length === 0 ? (
          <div style={{ backgroundColor: "white", borderRadius: 18, padding: 40, textAlign: "center", color: GRIS }}>
            <p style={{ fontSize: 40, margin: "0 0 8px" }}>🧾</p>
            <p style={{ margin: 0 }}>Vous n&apos;avez pas encore de facture.</p>
          </div>
        ) : (
          <div style={{ backgroundColor: "white", borderRadius: 18, overflow: "hidden" }}>
            {factures.map((f, i) => {
              const etat = etatFacture(f, aujourdhui);
              const couleurs = couleursEtatFacture(etat);
              const reste = Number(f.montant_restant) || 0;
              return (
                <div key={f.id}
                     style={{
                       display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
                       padding: "16px 20px",
                       borderTop: i === 0 ? "none" : "1px solid rgba(27,43,94,0.08)",
                     }}>
                  <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                    <p style={{ fontWeight: 700, color: MARINE, margin: 0 }}>{f.numero}</p>
                    <p style={{ fontSize: 13, color: GRIS, margin: "2px 0 0" }}>
                      {f.date_facture ? formatDateFR(f.date_facture) : "—"}
                      {f.date_echeance && f.type !== "avoir"
                        ? ` · à payer jusqu'au ${formatDateFR(f.date_echeance)}`
                        : ""}
                    </p>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 110 }}>
                    <p style={{ fontWeight: 700, color: MARINE, margin: 0 }}>{chf(Number(f.montant_total))}</p>
                    {reste > 0 && (
                      <p style={{ fontSize: 13, color: "#A8453A", margin: "2px 0 0" }}>reste {chf(reste)}</p>
                    )}
                  </div>
                  <span style={{
                    backgroundColor: couleurs.fond, color: couleurs.texte,
                    borderRadius: 999, padding: "3px 12px", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap",
                  }}>
                    {libelleEtatFacture(etat)}
                  </span>
                  <a href={`/api/factures/${f.id}/pdf`} target="_blank" rel="noopener noreferrer"
                     style={{ padding: "8px 16px", borderRadius: 10, backgroundColor: MARINE, color: "white", fontWeight: 600, fontSize: 14, textDecoration: "none", whiteSpace: "nowrap" }}>
                    PDF
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
