import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import FormEcriture from "./FormEcriture";

export default async function JournalPage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const { data: comptes } = await supabaseAdmin
    .from("comptes").select("numero, libelle, type").eq("actif", true).order("numero");

  const { data: ecritures } = await supabaseAdmin
    .from("ecritures")
    .select("id, date_ecriture, libelle, piece_type, ecritures_lignes (compte_numero, debit, credit)")
    .order("date_ecriture", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  const libelleCompte = new Map((comptes ?? []).map((c: any) => [c.numero, c.libelle]));

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">
        <EnTete
          titre="📒 Journal comptable"
          sousTitre="Saisie et consultation des écritures"
          action={<Bouton href="/comptabilite" variante="secondaire">← Comptabilité</Bouton>}
        />

        <FormEcriture comptes={comptes ?? []} />

        <div className="mt-6">
          <Carte>
            <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>Dernières écritures</h2>
            {(!ecritures || ecritures.length === 0) ? (
              <p className="text-sm" style={{ color: "rgba(27,43,94,0.55)" }}>Aucune écriture pour l'instant.</p>
            ) : (
              <div className="space-y-4">
                {ecritures.map((e: any) => (
                  <div key={e.id} className="rounded-xl p-3" style={{ border: "1px solid rgba(27,43,94,0.12)" }}>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-semibold" style={{ color: "#1B2B5E" }}>{e.libelle}</span>
                      <span style={{ color: "rgba(27,43,94,0.55)" }}>{e.date_ecriture}</span>
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {(e.ecritures_lignes ?? []).map((l: any, i: number) => (
                          <tr key={i}>
                            <td className="py-0.5">{l.compte_numero} — {libelleCompte.get(l.compte_numero) ?? ""}</td>
                            <td className="py-0.5 text-right" style={{ width: 110 }}>{Number(l.debit) > 0 ? Number(l.debit).toFixed(2) : ""}</td>
                            <td className="py-0.5 text-right" style={{ width: 110 }}>{Number(l.credit) > 0 ? Number(l.credit).toFixed(2) : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </Carte>
        </div>
      </div>
    </main>
  );
}
