import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatDateFR } from "@/src/lib/dates";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import BadgeStatut from "@/app/components/ui/BadgeStatut";

export default async function NonCloturesPage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const today = new Date().toISOString().split("T")[0];

  const { data: reservations } = await supabaseAdmin
    .from("reservations")
    .select("id, numero, date_debut, date_fin, statut, montant_final, montant_calcule, clients (prenom, nom)")
    .lt("date_fin", today)
    .neq("statut", "terminee")
    .neq("statut", "annulee")
    .neq("statut", "refusee")
    .order("date_fin", { ascending: false });

  const rows = reservations ?? [];

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">
        <EnTete
          titre="⚠️ Séjours terminés non clôturés"
          sousTitre="Réservations dont la date de fin est passée mais qui ne sont pas encore marquées terminées — le CA correspondant n'est pas reconnu en comptabilité"
          action={<Bouton href="/comptabilite" variante="secondaire">← Comptabilité</Bouton>}
        />

        <Carte>
          {rows.length === 0 ? (
            <EtatVide
              icone="✅"
              titre="Aucun séjour en attente de clôture"
              message="Tous les séjours passés sont correctement terminés."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "#1B2B5E" }}>
                    <th className="px-4 py-3 text-left text-white font-semibold rounded-tl-lg">N°</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Client</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Dates</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Statut</th>
                    <th className="px-4 py-3 text-right text-white font-semibold">Montant</th>
                    <th className="px-4 py-3 text-center text-white font-semibold rounded-tr-lg">Fiche</th>
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
                      <td className="px-4 py-3 font-semibold" style={{ color: "rgba(27,43,94,0.55)" }}>
                        #{r.numero ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-semibold" style={{ color: "#1B2B5E" }}>
                        {r.clients?.prenom} {r.clients?.nom}
                      </td>
                      <td className="px-4 py-3" style={{ color: "rgba(27,43,94,0.6)" }}>
                        {formatDateFR(r.date_debut)} → {formatDateFR(r.date_fin)}
                      </td>
                      <td className="px-4 py-3">
                        <BadgeStatut statut={r.statut} />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold" style={{ color: "#1B2B5E" }}>
                        {Number(r.montant_final ?? r.montant_calcule ?? 0).toFixed(2)} CHF
                      </td>
                      <td className="px-4 py-3 text-center">
                        <a
                          href={`/reservations/${r.id}`}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold inline-block"
                          style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}
                        >
                          Voir la fiche →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs mt-3" style={{ color: "rgba(27,43,94,0.45)" }}>
                {rows.length} réservation(s) — faire le check-out depuis la fiche pour clôturer
              </p>
            </div>
          )}
        </Carte>
      </div>
    </main>
  );
}
