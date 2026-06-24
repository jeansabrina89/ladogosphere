import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import GestionModeles from "./GestionModeles";
import BoutonSupprimerFiche from "./BoutonSupprimerFiche";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";

const titreSection = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  color: "#1B2B5E",
  fontSize: "17px",
  fontWeight: 700,
  margin: "0 0 16px 0",
};

export default async function FichesSalairePage() {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const { data: modeles } = await supabase
    .from("modeles_deductions")
    .select("*")
    .order("ordre");

  const { data: fiches } = await supabase
    .from("fiches_salaire")
    .select("*, employes_rh(id, prenom, nom)")
    .order("annee", { ascending: false })
    .order("mois", { ascending: false });

  const { data: employes } = await supabase
    .from("employes_rh")
    .select("id, prenom, nom")
    .eq("actif", true)
    .order("nom");

  const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

  const anneeActuelle = new Date().getFullYear();

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">

        <EnTete
          titre="📊 Fiches de salaire"
          sousTitre="Génération et gestion des fiches de salaire"
          action={
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <Bouton href="/employes/fiches-salaire/creer" icone="➕">Nouvelle fiche</Bouton>
              <Bouton href="/employes" variante="secondaire">← Retour</Bouton>
            </div>
          }
        />

        <div className="space-y-6">

          {/* Certificats par employé */}
          <Carte accent="or">
            <h2 style={titreSection}>📋 Certificats de salaire {anneeActuelle}</h2>
            {employes && employes.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                {employes.map((emp: any) => (
                  <Bouton
                    key={emp.id}
                    variante="secondaire"
                    icone="📋"
                    href={`/employes/fiches-salaire/certificat?employe_id=${emp.id}&annee=${anneeActuelle}`}
                  >
                    {emp.prenom} {emp.nom}
                  </Bouton>
                ))}
              </div>
            ) : (
              <p style={{ color: "rgba(27,43,94,0.5)", fontSize: "14px", margin: 0 }}>
                Aucun employé actif.
              </p>
            )}
          </Carte>

          {/* Modèles de déductions */}
          <Carte>
            <h2 style={titreSection}>⚙️ Modèles de déductions</h2>
            <GestionModeles modeles={modeles ?? []} />
          </Carte>

          {/* Liste des fiches */}
          <Carte>
            <h2 style={titreSection}>📋 Fiches générées</h2>
            {!fiches || fiches.length === 0 ? (
              <EtatVide
                icone="📊"
                titre="Aucune fiche générée"
                message="Crée une première fiche de salaire pour la voir apparaître ici."
              />
            ) : (
              <div className="space-y-3">
                {fiches.map((f: any) => (
                  <div
                    key={f.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "12px",
                      border: "1px solid rgba(27,43,94,0.12)",
                      borderRadius: "14px",
                      padding: "16px",
                    }}
                  >
                    <div>
                      <p style={{ fontWeight: 700, color: "#1B2B5E", margin: 0 }}>
                        {f.employes_rh?.prenom} {f.employes_rh?.nom}
                      </p>
                      <p style={{ color: "rgba(27,43,94,0.55)", fontSize: "14px", margin: "2px 0 0 0" }}>
                        {MOIS[f.mois - 1]} {f.annee}
                      </p>
                    </div>
                    <div style={{ textAlign: "right", minWidth: "140px" }}>
                      <p style={{ fontWeight: 700, fontSize: "14px", color: "#4AAEA0", margin: 0 }}>
                        Brut : CHF {Number(f.salaire_brut).toFixed(2)}
                      </p>
                      <p style={{ fontWeight: 700, fontSize: "14px", color: "#1B2B5E", margin: "2px 0 0 0" }}>
                        Net : CHF {Number(f.salaire_net).toFixed(2)}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Bouton variante="secondaire" icone="👁️" href={`/employes/fiches-salaire/${f.id}`}>
                        Voir
                      </Bouton>
                      <BoutonSupprimerFiche id={f.id} />
                    </div>
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
