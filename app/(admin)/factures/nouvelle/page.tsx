import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import AssistantFacture from "./AssistantFacture";
import { montantDuReservation } from "@/src/lib/montants";

type ResaImpayee = {
  id: string; numero: number | null; client_id: string;
  date_debut: string; date_fin: string; type_reservation: string;
  montant_final: number | string | null; montant_calcule: number | string | null;
  ajustement_manuel: number | string | null; montant_paye: number | string | null;
};

export default async function NouvelleFacturePage() {
  await exigerAccesAdmin("perm_encaissements");

  const { data: clients } = await supabaseAdmin
    .from("clients")
    .select("id, prenom, nom, adresse")
    .eq("actif", true)
    .order("nom");

  // Réservations non soldées qui ne sont pas déjà sur une facture émise.
  const { data: resasBrutes } = await supabaseAdmin
    .from("reservations")
    .select(`
      id, numero, client_id, date_debut, date_fin, type_reservation,
      montant_final, montant_calcule, ajustement_manuel, montant_paye
    `)
    .in("statut", ["validee", "terminee"])
    .neq("statut_paiement", "paye")
    .order("date_debut", { ascending: false })
    .limit(300);

  const resas = (resasBrutes ?? []) as ResaImpayee[];

  // Une réservation déjà portée par une facture émise doit être signalée.
  const { data: liens } = await supabaseAdmin
    .from("facture_lignes")
    .select("reservation_id, factures!inner(numero, statut)")
    .not("reservation_id", "is", null)
    .not("factures.numero", "is", null);

  const dejaFacturees = new Map<string, string>();
  for (const l of (liens ?? []) as { reservation_id: string; factures: unknown }[]) {
    const f = Array.isArray(l.factures) ? l.factures[0] : l.factures;
    const facture = f as { numero?: string; statut?: string } | null;
    if (facture?.numero && facture.statut !== "annulee" && facture.statut !== "annulee_par_avoir") {
      dejaFacturees.set(l.reservation_id, facture.numero);
    }
  }

  const reservations = resas.map((r) => ({
    id: r.id,
    client_id: r.client_id,
    numero: r.numero,
    date_debut: r.date_debut,
    date_fin: r.date_fin,
    type_reservation: r.type_reservation,
    reste: Math.max(0, montantDuReservation(r) - Number(r.montant_paye ?? 0)),
    dejaFacturee: dejaFacturees.get(r.id) ?? null,
  })).filter((r) => r.reste > 0 || r.dejaFacturee);

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">
        <EnTete
          titre="🧾 Nouvelle facture"
          sousTitre="Lignes libres, réservations impayées, ou les deux."
          action={<Bouton href="/factures" variante="secondaire">← Factures</Bouton>}
        />
        <AssistantFacture
          clients={(clients ?? []) as { id: string; prenom: string; nom: string; adresse: string | null }[]}
          reservations={reservations}
        />
      </div>
    </main>
  );
}
