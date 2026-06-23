import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import { getEmployeRhActuel } from "@/src/lib/employeActuel";
import Link from "next/link";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export default async function MesFichesSalairePage() {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role, email").eq("id", user.id).single();
  if (!["admin", "employe"].includes(profile?.role)) redirect("/");

  const employe = await getEmployeRhActuel(supabase, user.id, profile?.email);
  if (!employe) redirect("/employes/mon-espace");

  const { data: fiches } = await supabase
    .from("fiches_salaire")
    .select("*")
    .eq("employe_id", employe.id)
    .order("annee", { ascending: false })
    .order("mois", { ascending: false });

  const annees = [...new Set(fiches?.map((f: any) => f.annee) ?? [])].sort((a, b) => b - a);

  const marine = "#1B2B5E";
  const sousTexte = "rgba(27,43,94,0.6)";
  const bordure = "1px solid rgba(27,43,94,0.12)";

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">
        <EnTete
          titre="📊 Mes fiches de salaire"
          action={<Bouton href="/employes/mon-espace" variante="secondaire">← Retour</Bouton>}
        />

        {annees.length > 0 && (
          <div style={{ marginBottom: "24px" }}>
            <Carte>
              <h2 style={{ fontWeight: 700, color: marine, margin: "0 0 12px" }}>📋 Certificats de salaire</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                {annees.map((annee: number) => (
                  <Bouton key={annee} href={`/employes/fiches-salaire/certificat?annee=${annee}`} variante="secondaire" icone="📋">
                    Certificat {annee}
                  </Bouton>
                ))}
              </div>
            </Carte>
          </div>
        )}

        <Carte>
          <h2 style={{ fontWeight: 700, color: marine, margin: "0 0 16px" }}>Fiches mensuelles</h2>
          {(!fiches || fiches.length === 0) ? (
            <EtatVide icone="📄" titre="Aucune fiche de salaire" message="Tes fiches de salaire apparaîtront ici dès qu'elles seront émises." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {fiches.map((f: any) => (
                <Link key={f.id} href={`/employes/fiches-salaire/${f.id}`}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: bordure, borderRadius: "14px", padding: "16px", textDecoration: "none" }}>
                  <div>
                    <p style={{ fontWeight: 700, color: marine, margin: 0 }}>{MOIS[f.mois - 1]} {f.annee}</p>
                    <p style={{ fontSize: "14px", color: sousTexte, margin: "2px 0 0" }}>Brut : CHF {Number(f.salaire_brut).toFixed(2)}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontWeight: 700, fontSize: "18px", color: "#4AAEA0", margin: 0 }}>CHF {Number(f.salaire_net).toFixed(2)}</p>
                    <p style={{ fontSize: "12px", color: sousTexte, margin: 0 }}>Net</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Carte>
      </div>
    </main>
  );
}
