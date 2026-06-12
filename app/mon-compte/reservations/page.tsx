import { createSupabaseServerClient } from "../../../src/lib/supabase-server";
import { createClient } from "../../../src/utils/supabase/server";
import { supabaseAdmin } from "../../../src/lib/supabase-admin";
import Link from "next/link";
import { formatDate } from "../../../src/lib/dates";
import { formatBoxLabel } from "../../../src/lib/boxes";
import BoutonPaiementClient from "./BoutonPaiementClient";
import FiltresPeriode from "./FiltresPeriode";
import { appliquerPeriodeEtTri, aujourdhuiISO } from "../../../src/lib/reservationsFiltres";

function libelleType(t: string): string {
  if (t === "journee") return "Journée";
  if (t === "essai") return "Journée d'essai";
  if (t === "sejour") return "Séjour";
  return t || "—";
}

export default async function MesReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filtre?: string }>;
}) {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  const params = await searchParams;
  const filtre = params.filtre || "toutes";

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!client) return <div>Profil introuvable</div>;

  const aujourd_hui = aujourdhuiISO();
  let query = supabase
    .from("reservations")
    .select(`*, boxes (numero, nom), reservation_chiens (chiens (nom))`)
    .eq("client_id", client.id);
  query = appliquerPeriodeEtTri(query, filtre || "toutes", aujourd_hui);
  const { data: reservations } = await query;

  // IBAN lu côté serveur (table parametres réservée à l'admin)
  const { data: ibanRow } = await supabaseAdmin
    .from("parametres")
    .select("valeur")
    .eq("cle", "iban")
    .maybeSingle();
  const iban = ibanRow?.valeur ?? "";

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold" style={{ color: "#1B2B5E" }}>
            📅 Mes réservations
          </h1>
          <Link href="/mon-compte/reservations/nouvelle"
            className="px-4 py-2 rounded-lg font-semibold text-white text-sm"
            style={{ backgroundColor: "#4AAEA0" }}>
            ➕ Nouvelle demande
          </Link>
        </div>

        <FiltresPeriode />

        <div className="space-y-4">
          {reservations?.length === 0 && (
            <p className="text-gray-400">Aucune réservation dans cette catégorie.</p>
          )}
          {reservations?.map((res: any) => {
            const chiens = res.reservation_chiens?.map((rc: any) => rc.chiens?.nom).filter(Boolean) ?? [];
            const resteAPayer = (res.montant_final || 0) - (res.montant_paye || 0);
            const peutPayer =
              (res.statut === "validee" || res.statut === "terminee") &&
              (!res.statut_paiement || res.statut_paiement === "impaye" || res.statut_paiement === "partiel") &&
              resteAPayer > 0;

            return (
              <div key={res.id} className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-gray-400 font-semibold">Réservation n°{res.numero}</p>
                    <p className="font-bold text-lg" style={{ color: "#1B2B5E" }}>
                      🐶 {chiens.join(", ") || "—"}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      📅 {formatDate(res.date_debut)} → {formatDate(res.date_fin)}
                    </p>
                    <p className="text-sm text-gray-500">
                      🏠 {formatBoxLabel(res.boxes)} · {libelleType(res.type_reservation)}
                    </p>
                    {res.montant_final > 0 && (
                      <p className="text-sm font-semibold mt-1" style={{ color: "#4AAEA0" }}>
                        💰 {res.montant_final} CHF
                        {res.statut_paiement === "partiel" && res.montant_paye > 0 && (
                          <span className="text-gray-400 font-normal ml-1">
                            (payé : {res.montant_paye} CHF · reste : {resteAPayer.toFixed(2)} CHF)
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      res.statut === "validee" ? "bg-green-100 text-green-700" :
                      res.statut === "en_attente" ? "bg-yellow-100 text-yellow-700" :
                      res.statut === "annulee" ? "bg-red-100 text-red-700" :
                      res.statut === "refusee" ? "bg-red-100 text-red-700" :
                      res.statut === "terminee" ? "bg-gray-100 text-gray-600" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {res.statut === "validee" ? "✅ Validée" :
                       res.statut === "en_attente" ? "⏳ En attente" :
                       res.statut === "annulee" ? "❌ Annulée" :
                       res.statut === "refusee" ? "❌ Refusée" :
                       res.statut === "terminee" ? "🏁 Terminée" : res.statut}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      res.statut_paiement === "paye" ? "bg-green-100 text-green-700" :
                      res.statut_paiement === "partiel" ? "bg-orange-100 text-orange-700" :
                      "bg-red-100 text-red-700"
                    }`}>
                      {res.statut_paiement === "paye" ? "💰 Payé" :
                       res.statut_paiement === "partiel" ? "💰 Partiel" :
                       "💰 Impayé"}
                    </span>
                    {peutPayer && (
                      <BoutonPaiementClient
                        reservation_id={res.id}
                        numero={res.numero}
                        iban={iban}
                        montant_final={res.montant_final || 0}
                        montant_paye={res.montant_paye || 0}
                        statut_paiement={res.statut_paiement || "impaye"}
                      />
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t">
                  <Link href={`/mon-compte/reservations/${res.id}`}
                    className="text-sm font-semibold" style={{ color: "#4AAEA0" }}>
                    Voir le détail →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6">
          <Link href="/mon-compte"
            className="text-sm font-semibold"
            style={{ color: "#4AAEA0" }}>
            ← Retour à mon compte
          </Link>
        </div>

      </div>
    </main>
  );
}