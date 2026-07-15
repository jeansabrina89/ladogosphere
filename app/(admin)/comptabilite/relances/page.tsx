import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import { resteAPayer } from "@/src/lib/montants";
import { niveauRelanceDu } from "@/src/lib/relances";
import RelancesClient from "./RelancesClient";

export const dynamic = "force-dynamic";

export default async function RelancesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, perm_encaissements")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin" && !profile?.perm_encaissements) redirect("/");

  const { data: resasRaw } = await supabaseAdmin
    .from("reservations")
    .select(
      `
      id, numero, type_reservation, date_debut, date_fin,
      statut, statut_paiement, offerte, relance_niveau, relance_le,
      montant_final, montant_calcule, montant_paye, ajustement_manuel,
      clients (id, prenom, nom, email)
    `
    )
    .eq("type_reservation", "sejour")
    .in("statut", ["validee", "terminee"])
    .neq("statut_paiement", "paye")
    .order("date_fin", { ascending: true });

  const today = new Date();
  const candidats = ((resasRaw ?? []) as any[])
    .map((r) => ({ r, reste: resteAPayer(r), niveau: niveauRelanceDu(r.date_fin, today) }))
    .filter(
      ({ r, reste, niveau }) =>
        !r.offerte && reste > 0 && niveau > 0 && niveau > Number(r.relance_niveau ?? 0)
    )
    .map(({ r, reste, niveau }) => ({
      id: r.id,
      numero: r.numero,
      nom: [r.clients?.prenom, r.clients?.nom].filter(Boolean).join(" ") || "Client",
      email: r.clients?.email ?? null,
      date_debut: r.date_debut,
      date_fin: r.date_fin,
      reste,
      niveau,
      relance_niveau: Number(r.relance_niveau ?? 0),
      relance_le: r.relance_le,
    }));

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">
        <EnTete
          titre="🔔 Relances à envoyer"
          sousTitre="Séjours impayés arrivés à échéance. Rien ne part sans votre validation."
          action={
            <Bouton href="/comptabilite" variante="secondaire">
              ← Comptabilité
            </Bouton>
          }
        />
        <RelancesClient candidats={candidats} />
      </div>
    </main>
  );
}
