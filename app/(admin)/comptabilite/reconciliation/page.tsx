import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatDateFR } from "@/src/lib/dates";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import { resynchroniserCompta } from "./actions";

export default async function ReconciliationPage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const { data: reservations } = await supabaseAdmin
    .from("reservations")
    .select("id, date_debut, date_fin, montant_final, montant_calcule, compta_erreur, compta_sync_at, clients (prenom, nom)")
    .eq("compta_synchronisee", false)
    .order("compta_sync_at", { ascending: false, nullsFirst: true });

  const rows = reservations ?? [];

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">
        <EnTete
          titre="🔄 Séjours à resynchroniser"
          sousTitre="Réservations dont l'écriture comptable a échoué ou n'a pas pu être passée"
          action={<Bouton href="/comptabilite" variante="secondaire">← Comptabilité</Bouton>}
        />

        <Carte>
          {rows.length === 0 ? (
            <EtatVide
              icone="✅"
              titre="Toutes les écritures sont synchronisées"
              message="Aucune réservation en attente de resynchronisation."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "#1B2B5E" }}>
                    <th className="px-4 py-3 text-left text-white font-semibold rounded-tl-lg">Client</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Dates</th>
                    <th className="px-4 py-3 text-right text-white font-semibold">Montant</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Erreur</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Dernière tentative</th>
                    <th className="px-4 py-3 text-center text-white font-semibold rounded-tr-lg">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any, idx: number) => (
                    <tr
                      key={r.id}
                      style={{
                        backgroundColor: idx % 2 === 0 ? "white" : "#FAFAFA",
                        borderBottom: "1px solid #E2E8F0",
                      }}
                    >
                      <td className="px-4 py-3 font-semibold" style={{ color: "#1B2B5E" }}>
                        {r.clients?.prenom} {r.clients?.nom}
                      </td>
                      <td className="px-4 py-3" style={{ color: "rgba(27,43,94,0.6)" }}>
                        {formatDateFR(r.date_debut)} → {formatDateFR(r.date_fin)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold" style={{ color: "#1B2B5E" }}>
                        {Number(r.montant_final ?? r.montant_calcule ?? 0).toFixed(2)} CHF
                      </td>
                      <td className="px-4 py-3 max-w-xs" style={{ color: "#DC2626", fontSize: "12px" }}>
                        {r.compta_erreur ?? "—"}
                      </td>
                      <td className="px-4 py-3" style={{ color: "rgba(27,43,94,0.5)", fontSize: "12px" }}>
                        {r.compta_sync_at
                          ? new Date(r.compta_sync_at).toLocaleString("fr-CH")
                          : "Jamais"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <form action={resynchroniserCompta.bind(null, r.id)}>
                          <button
                            type="submit"
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition"
                            style={{ backgroundColor: "#4AAEA0" }}
                          >
                            🔄 Resynchroniser
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs mt-3" style={{ color: "rgba(27,43,94,0.45)" }}>
                {rows.length} réservation(s) en attente
              </p>
            </div>
          )}
        </Carte>
      </div>
    </main>
  );
}
