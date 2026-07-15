import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatDateFR } from "@/src/lib/dates";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import BadgeStatut from "@/app/components/ui/BadgeStatut";
import FiltresFactures from "./FiltresFactures";

const chf = (n: number) => `${(Number(n) || 0).toFixed(2)} CHF`;

function categorieFacture(statut: string): "reglees" | "annulees" | "attente" {
  if (statut === "acquittee") return "reglees";
  if (statut === "annulee") return "annulees";
  return "attente";
}
function statutBadge(statut: string): string {
  if (statut === "acquittee") return "acquittee";
  if (statut === "annulee") return "annulee";
  return "en_attente";
}

export default async function FacturesListePage({
  searchParams,
}: {
  searchParams: Promise<{ vues?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("role, perm_encaissements").eq("id", user.id).single();
  if (profile?.role !== "admin" && !profile?.perm_encaissements) redirect("/");

  const params = await searchParams;
  const selection = new Set((params.vues || "").split(",").filter(Boolean));

  const { data: facturesRaw } = await supabaseAdmin
    .from("factures")
    .select("id, numero, date_facture, montant_total, montant_restant, statut, clients (prenom, nom)")
    .order("date_facture", { ascending: false })
    .order("created_at", { ascending: false });

  const toutes = (facturesRaw ?? []) as any[];
  const factures = selection.size === 0 ? toutes : toutes.filter((f) => selection.has(categorieFacture(f.statut)));
  const nbAttente = toutes.filter((f) => categorieFacture(f.statut) === "attente").length;

  const marine = "#1B2B5E";
  const sousTexte = "rgba(27,43,94,0.55)";
  const bordure = "1px solid rgba(27,43,94,0.12)";

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">
        <EnTete
          titre="🧾 Factures"
          sousTitre={`${toutes.length} facture${toutes.length > 1 ? "s" : ""} · ${nbAttente} en attente`}
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href="/factures/groupee" variante="principal">🧾 Facture groupée</Bouton>
              <Bouton href="/comptabilite" variante="secondaire">← Comptabilité</Bouton>
            </div>
          }
        />

        <FiltresFactures />

        {factures.length === 0 ? (
          <Carte>
            <div className="p-2">
              <EtatVide icone="🧾" titre="Aucune facture" message="Aucune facture ne correspond a ce filtre." />
            </div>
          </Carte>
        ) : (
          <Carte>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: sousTexte }}>
                    <th className="text-left py-2 px-4 font-semibold">N°</th>
                    <th className="text-left py-2 px-4 font-semibold">Date</th>
                    <th className="text-left py-2 px-4 font-semibold">Client</th>
                    <th className="text-right py-2 px-4 font-semibold">Montant</th>
                    <th className="text-right py-2 px-4 font-semibold">Reste</th>
                    <th className="text-left py-2 px-4 font-semibold">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {factures.map((f) => {
                    const c = f.clients as any;
                    const reste = Number(f.montant_restant) || 0;
                    return (
                      <tr key={f.id} style={{ borderTop: bordure }}>
                        <td className="py-2 px-4">
                          <a href={`/factures/${f.id}`} className="font-semibold" style={{ color: marine }}>{f.numero}</a>
                        </td>
                        <td className="py-2 px-4" style={{ color: sousTexte }}>{f.date_facture ? formatDateFR(f.date_facture) : "—"}</td>
                        <td className="py-2 px-4" style={{ color: marine }}>{c ? `${c.prenom} ${c.nom}` : "—"}</td>
                        <td className="py-2 px-4 text-right" style={{ color: marine }}>{chf(f.montant_total)}</td>
                        <td className="py-2 px-4 text-right" style={{ color: reste > 0 ? "#A8453A" : sousTexte }}>{reste > 0 ? chf(reste) : "—"}</td>
                        <td className="py-2 px-4"><BadgeStatut statut={statutBadge(f.statut)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Carte>
        )}
      </div>
    </main>
  );
}
