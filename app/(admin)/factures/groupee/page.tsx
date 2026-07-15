import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import { resteAPayer } from "@/src/lib/montants";
import FactureGroupeeClient from "./FactureGroupeeClient";

export const dynamic = "force-dynamic";

export default async function FactureGroupeePage() {
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
      id, numero, client_id, type_reservation, date_debut, date_fin,
      statut, statut_paiement, montant_final, montant_calcule, montant_paye, ajustement_manuel,
      clients (id, prenom, nom),
      reservation_chiens (chiens (nom))
    `
    )
    .in("statut", ["validee", "terminee"])
    .in("statut_paiement", ["impaye", "partiel"])
    .order("date_debut", { ascending: true });

  const resas = (resasRaw ?? []) as any[];

  const ids = resas.map((r) => r.id);
  const etatFacture: Record<string, { statut: string; numero: string | null }> = {};
  if (ids.length > 0) {
    const { data: liens } = await supabaseAdmin
      .from("facture_reservations")
      .select("reservation_id, factures!inner(numero, statut)")
      .in("reservation_id", ids)
      .eq("facture_annulee", false);
    for (const l of (liens ?? []) as any[]) {
      if (l.factures && l.factures.statut !== "annulee") {
        etatFacture[l.reservation_id] = {
          statut: l.factures.statut,
          numero: l.factures.numero,
        };
      }
    }
  }

  const parClient = new Map<string, any>();
  for (const r of resas) {
    const reste = resteAPayer(r);
    if (reste <= 0) continue;
    const cid = r.client_id as string;
    if (!parClient.has(cid)) {
      parClient.set(cid, {
        client_id: cid,
        nom: [r.clients?.prenom, r.clients?.nom].filter(Boolean).join(" ") || "Client",
        reservations: [],
      });
    }
    parClient.get(cid).reservations.push({
      id: r.id,
      numero: r.numero,
      type_reservation: r.type_reservation,
      date_debut: r.date_debut,
      date_fin: r.date_fin,
      chiens: (r.reservation_chiens ?? [])
        .map((rc: any) => rc.chiens?.nom)
        .filter(Boolean),
      reste,
      facture: etatFacture[r.id] ?? null,
    });
  }
  const clients = Array.from(parClient.values()).sort((a, b) =>
    a.nom.localeCompare(b.nom)
  );

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">
        <EnTete
          titre="🧾 Facture groupée"
          sousTitre="Sélectionnez un client, cochez ses réservations non réglées, puis générez une seule facture."
          action={
            <Bouton href="/factures" variante="secondaire">
              ← Factures
            </Bouton>
          }
        />
        <FactureGroupeeClient clients={clients} />
      </div>
    </main>
  );
}
