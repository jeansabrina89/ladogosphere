import { createSupabaseServerClient } from "../../../../src/lib/supabase-server";
import { supabaseAdmin } from "../../../../src/lib/supabase-admin";
import Link from "next/link";
import { formatDate } from "../../../../src/lib/dates";
import { formatBoxLabel } from "../../../../src/lib/boxes";
import { getMouvementsAvoirReservation } from "../../../../src/lib/avoirs";
import BoutonPaiementClient from "../BoutonPaiementClient";

const LABELS_TYPE_AVOIR_RESERVATION: Record<string, string> = {
  utilisation: "Avoir utilisé",
  trop_percu: "Trop-perçu crédité en avoir",
  annulation_paiement: "Paiement annulé (crédité en avoir)",
};

function libelleType(t: string): string {
  if (t === "journee") return "Journée";
  if (t === "essai") return "Journée d'essai";
  if (t === "sejour") return "Séjour";
  return t || "—";
}

export default async function DetailReservationClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: res } = await supabase
    .from("reservations")
    .select(`*, boxes (numero, nom), reservation_chiens (chiens (nom)), reservation_extras (id, libelle, montant)`)
    .eq("id", id)
    .maybeSingle();

  if (!res) {
    return (
      <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
        <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-gray-600 mb-4">Réservation introuvable.</p>
          <Link href="/mon-compte/reservations" className="font-semibold" style={{ color: "#4AAEA0" }}>
            ← Retour à mes réservations
          </Link>
        </div>
      </main>
    );
  }

  const chiens = res.reservation_chiens?.map((rc: any) => rc.chiens?.nom).filter(Boolean) ?? [];
  const resteAPayer = (res.montant_final || 0) - (res.montant_paye || 0);

  const mouvementsAvoir = await getMouvementsAvoirReservation(supabase, res.client_id, id);

  const { data: ibanRow } = await supabaseAdmin.from("parametres").select("valeur").eq("cle", "iban").maybeSingle();
  const iban = ibanRow?.valeur ?? "";

  const peutPayer =
    (res.statut === "validee" || res.statut === "terminee") &&
    (!res.statut_paiement || res.statut_paiement === "impaye" || res.statut_paiement === "partiel") &&
    resteAPayer > 0;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm">
        <p className="text-sm text-gray-400 font-semibold">Réservation n°{res.numero}</p>
        <h1 className="text-3xl font-bold mb-6" style={{ color: "#1B2B5E" }}>
          🐶 {chiens.join(", ") || "—"}
        </h1>

        <div className="space-y-2 mb-6">
          <p><strong>Type :</strong> {libelleType(res.type_reservation)}</p>
          <p><strong>Dates :</strong> {formatDate(res.date_debut)} → {formatDate(res.date_fin)}</p>
          {(res.heure_arrivee || res.heure_depart) && (
            <p><strong>Horaires :</strong> {res.heure_arrivee ? String(res.heure_arrivee).slice(0, 5) : "—"} → {res.heure_depart ? String(res.heure_depart).slice(0, 5) : "—"}</p>
          )}
          <p><strong>Box :</strong> {formatBoxLabel(res.boxes)}</p>
          <p><strong>Statut :</strong> {
            res.statut === "validee" ? "✅ Validée" :
            res.statut === "en_attente" ? "⏳ En attente" :
            res.statut === "annulee" ? "❌ Annulée" :
            res.statut === "terminee" ? "🏁 Terminée" : res.statut
          }</p>
        </div>

        <div className="border-t pt-4 space-y-2 mb-6">
          <h2 className="text-xl font-bold mb-2" style={{ color: "#1B2B5E" }}>Paiement</h2>
          {res.reservation_extras && res.reservation_extras.length > 0 && (
            <div className="space-y-1 mb-2">
              <p className="font-semibold text-sm text-gray-500">Lignes supplémentaires :</p>
              {res.reservation_extras.map((extra: any) => (
                <p key={extra.id} className="flex justify-between text-sm pl-2">
                  <span>{extra.libelle}</span>
                  <span>{Number(extra.montant) > 0 ? "+" : ""}{Number(extra.montant).toFixed(2)} CHF</span>
                </p>
              ))}
            </div>
          )}
          <p><strong>Montant :</strong> {res.montant_final > 0 ? `${res.montant_final} CHF` : "—"}</p>
          <p><strong>Payé :</strong> {res.montant_paye || 0} CHF</p>
          {resteAPayer > 0 && res.statut !== "annulee" && (
            <p><strong>Reste à payer :</strong> {resteAPayer.toFixed(2)} CHF</p>
          )}
          <p><strong>Statut paiement :</strong> {
            res.statut_paiement === "paye" ? "💰 Payé" :
            res.statut_paiement === "partiel" ? "💰 Partiel" : "💰 Impayé"
          }</p>
        </div>

        {peutPayer && (
          <div className="border-t pt-4 mb-6">
            <BoutonPaiementClient
              reservation_id={res.id}
              numero={res.numero}
              iban={iban}
              montant_final={res.montant_final || 0}
              montant_paye={res.montant_paye || 0}
              statut_paiement={res.statut_paiement || "impaye"}
            />
          </div>
        )}

        {mouvementsAvoir.length > 0 && (
          <div className="border-t pt-4 space-y-2 mb-6">
            <h2 className="text-xl font-bold mb-2" style={{ color: "#1B2B5E" }}>👛 Avoir lié à cette réservation</h2>
            <div className="space-y-2">
              {mouvementsAvoir.map((m) => (
                <div key={m.id} className="flex justify-between items-center border rounded-xl p-3">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: "#1B2B5E" }}>
                      {LABELS_TYPE_AVOIR_RESERVATION[m.type] ?? m.type}
                    </p>
                    <p className="text-xs text-gray-500">
                      {m.motif ? `${m.motif} — ` : ""}{new Date(m.created_at).toLocaleDateString("fr-CH")}
                    </p>
                  </div>
                  <p className="font-bold text-sm" style={{ color: m.montant < 0 ? "#DC2626" : "#4AAEA0" }}>
                    {m.montant >= 0 ? "+" : ""}{m.montant.toFixed(2)} CHF
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t pt-4">
          <Link href="/mon-compte/reservations" className="font-semibold" style={{ color: "#4AAEA0" }}>
            ← Mes réservations
          </Link>
        </div>
      </div>
    </main>
  );
}