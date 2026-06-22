import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import type { CSSProperties } from "react";
import Link from "next/link";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import BoutonSupprimerEmploye from "./BoutonSupprimerEmploye";
import { BoutonCreerAcces, BoutonReinitialiserMdp } from "./BoutonAccesEmploye";

const pill = (bg: string, fg: string): CSSProperties => ({
  display: "inline-block", backgroundColor: bg, color: fg,
  borderRadius: "999px", padding: "2px 10px", fontSize: "13px",
  fontWeight: 500, lineHeight: "20px", whiteSpace: "nowrap",
});

const lienAction: CSSProperties = {
  padding: "8px 14px", borderRadius: "12px", fontSize: "13px",
  fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap",
};

export default async function EmployesPage() {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const { data: employesRh } = await supabase
    .from("employes_rh")
    .select("*")
    .order("actif", { ascending: false })
    .order("taux_travail", { ascending: false })
    .order("nom", { ascending: true });

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("role", ["admin", "employe"]);

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">

        <EnTete
          titre="👥 Équipe"
          sousTitre="Gestion des comptes et module RH"
          action={
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <Bouton href="/employes/nouveau-rh" variante="principal" icone="➕">Ajouter un employé</Bouton>
              <Bouton href="/employes/fiches-salaire" variante="secondaire" icone="📊">Fiches de salaire</Bouton>
            </div>
          }
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {employesRh?.map((emp: any) => {
            const profil = profiles?.find(p => p.id === emp.profile_id) ?? profiles?.find(p => p.email === emp.email);
            const salaireBrut = (emp.salaire_base * emp.taux_travail / 100).toFixed(2);
            const joursParSemaine = Math.round(emp.taux_travail / 100 * 5);
            const joursVacances = Math.round(20 * emp.taux_travail / 100);

            return (
              <Carte key={emp.id} accent={emp.actif ? "teal" : "aucun"}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: "240px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <p style={{ fontSize: "18px", fontWeight: 700, color: "#1B2B5E", margin: 0 }}>
                        {emp.prenom} {emp.nom}
                      </p>
                      {profil?.role === "admin" && <span style={pill("#E4E7F1", "#2A3B6B")}>Admin</span>}
                      <span style={pill(emp.actif ? "#DBEFEA" : "#EDE8DF", emp.actif ? "#1F6E5B" : "rgba(27,43,94,0.6)")}>
                        {emp.actif ? "Actif" : "Inactif"}
                      </span>
                      {!profil && <span style={pill("#FBE2DE", "#A8453A")}>Sans compte</span>}
                    </div>
                    <p style={{ color: "rgba(27,43,94,0.6)", fontSize: "14px", margin: "4px 0 0" }}>{emp.email}</p>

                    <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
                      <span style={pill("#E4E7F1", "#2A3B6B")}>{emp.taux_travail}% — {joursParSemaine}j/semaine</span>
                      <span style={pill("#DBEFEA", "#1F6E5B")}>💰 {salaireBrut} CHF/mois</span>
                      <span style={pill("#F4EAC9", "#6E5410")}>🏖️ {joursVacances}j vacances/an</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <Link href={`/employes/${emp.id}/modifier`} style={{ ...lienAction, backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>✏️ Modifier</Link>
                    {emp.profile_id && <BoutonReinitialiserMdp profilId={emp.profile_id} />}
                    <Link href={`/employes/timbrage?employe=${emp.id}`} style={{ ...lienAction, backgroundColor: "#4AAEA0", color: "#FFFFFF" }}>⏱️ Heures</Link>
                    <Link href={`/employes/fiches-salaire/creer?employe_id=${emp.id}`} style={{ ...lienAction, backgroundColor: "#E8847A", color: "#FFFFFF" }}>📊 Fiche</Link>
                    {!emp.profile_id && <BoutonCreerAcces ficheId={emp.id} />}
                    <BoutonSupprimerEmploye id={emp.id} nom={`${emp.prenom} ${emp.nom}`} />
                  </div>
                </div>

                {profil && profil.role === "employe" && (
                  <div style={{ marginTop: "16px", borderTop: "1px solid rgba(27,43,94,0.08)", paddingTop: "16px" }}>
                    <p style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "rgba(27,43,94,0.6)" }}>Permissions :</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {[
                        { key: "perm_checkin", label: "Check-in/out" },
                        { key: "perm_reservations_creer", label: "Créer résa" },
                        { key: "perm_reservations_modifier", label: "Modifier résa" },
                        { key: "perm_reservations_annuler", label: "Annuler résa" },
                        { key: "perm_clients_creer", label: "Créer clients" },
                        { key: "perm_clients_modifier", label: "Modifier clients" },
                        { key: "perm_chiens_modifier", label: "Modifier chiens" },
                        { key: "perm_planning", label: "Planning" },
                        { key: "perm_tarifs_urgence", label: "Tarifs urgence" },
                      ].map(({ key, label }) => (
                        <span key={key} style={pill(profil[key] ? "#DBEFEA" : "#EDE8DF", profil[key] ? "#1F6E5B" : "rgba(27,43,94,0.6)")}>
                          {profil[key] ? "✅" : "○"} {label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Carte>
            );
          })}
        </div>

      </div>
    </main>
  );
}
