import Link from "next/link";
import { supabase } from "../../../src/lib/supabase";
import BoutonAnnuler from "./BoutonAnnuler";
import CalculFacture from "./CalculFacture";
import BoutonValiderReservation from "../../components/BoutonValiderReservation";
import GestionPaiement from "./GestionPaiement";
import { formatDate } from "../../../src/lib/dates";

export default async function ReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: res } = await supabase
    .from("reservations")
    .select(`
      *,
      clients (id, prenom, nom, membre, telephone, email),
      boxes (numero),
      reservation_chiens (
        chiens (id, nom, race, poids, categorie_poids, sexe, sterilise)
      )
    `)
    .eq("id", id)
    .single();

  const { data: tarifs } = await supabase
    .from("tarifs")
    .select("categorie, membre, prix")
    .eq("actif", true);

  if (!res) return <div>Réservation introuvable</div>;

  const chiens = res.reservation_chiens?.map((rc: any) => rc.chiens).filter(Boolean) ?? [];
  const est_membre = res.clients?.membre ?? false;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto bg-white rounded-xl p-8 shadow-sm">

        <div className="flex justify-between items-start mb-6">
          <h1 className="text-4xl font-bold" style={{ color: "#1B2B5E" }}>📅 Réservation</h1>
          <div className="flex flex-col items-end gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
              res.statut === "validee" ? "bg-green-100 text-green-700" :
              res.statut === "en_attente" ? "bg-yellow-100 text-yellow-700" :
              res.statut === "annulee" ? "bg-red-100 text-red-700" :
              res.statut === "terminee" ? "bg-gray-100 text-gray-600" :
              "bg-gray-100 text-gray-600"
            }`}>
              {res.statut === "validee" ? "✅ Validée" :
               res.statut === "en_attente" ? "⏳ En attente" :
               res.statut === "annulee" ? "❌ Annulée" :
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
          </div>
        </div>

        {res.urgence && (
          <div className="bg-orange-100 text-orange-700 px-4 py-2 rounded-xl mb-6 font-semibold">
            🚨 Réservation urgence
          </div>
        )}

        {/* Client */}
        <div className="border-t pt-6 mb-6">
          <h2 className="text-2xl font-bold mb-4" style={{ color: "#1B2B5E" }}>👤 Client</h2>
          <p><strong>Nom :</strong> {res.clients?.prenom} {res.clients?.nom}
            {res.clients?.membre && <span className="ml-2 text-green-600">⭐ Membre</span>}
          </p>
          <p><strong>Email :</strong> {res.clients?.email}</p>
          <p><strong>Téléphone :</strong> {res.clients?.telephone || "—"}</p>
        </div>

        {/* Chiens */}
        <div className="border-t pt-6 mb-6">
          <h2 className="text-2xl font-bold mb-4" style={{ color: "#1B2B5E" }}>🐶 Chiens ({chiens.length})</h2>
          <div className="space-y-3">
            {chiens.map((chien: any) => (
              <Link key={chien.id} href={`/chiens/${chien.id}`}
                className="flex justify-between items-center border rounded-xl p-4 hover:bg-slate-50">
                <div>
                  <p className="font-bold" style={{ color: "#1B2B5E" }}>{chien.nom}</p>
                  <p className="text-sm text-gray-500">{chien.race || "—"}</p>
                </div>
                <div className="text-right text-sm">
                  <p>{chien.poids ? `${chien.poids} kg` : "—"}</p>
                  <p>{
                    chien.categorie_poids === "moins_15kg" ? "🟢 Petit" :
                    chien.categorie_poids === "15_30kg" ? "🟡 Moyen" :
                    chien.categorie_poids === "30_40kg" ? "🔴 Grand" : "—"
                  }</p>
                  <p>{chien.sexe === "M" ? "♂️" : "♀️"} {chien.sterilise ? "stér." : "entier"}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Détails */}
        <div className="border-t pt-6 mb-6">
          <h2 className="text-2xl font-bold mb-4" style={{ color: "#1B2B5E" }}>📋 Détails</h2>
          <p><strong>Type :</strong> {res.type_reservation === "journee" ? "Journée" : "Séjour"}</p>
          <p><strong>Box :</strong> {res.boxes?.numero ? `Box ${res.boxes.numero}` : "—"}</p>
          <p><strong>Date début :</strong> {formatDate(res.date_debut)}</p>
          <p><strong>Date fin :</strong> {formatDate(res.date_fin)}</p>
          <p><strong>Heure arrivée :</strong> {res.heure_arrivee || "—"}</p>
          <p><strong>Heure départ :</strong> {res.heure_depart || "—"}</p>
          {res.commentaire_admin && (
            <p><strong>Commentaire :</strong> {res.commentaire_admin}</p>
          )}
        </div>

        {/* Facturation */}
        <CalculFacture
          reservation={res}
          nb_chiens={chiens.length}
          est_membre={est_membre}
          tarifs={tarifs ?? []}
          montant_actuel={res.montant_final}
        />

        {/* Paiement */}
        <GestionPaiement
          reservation_id={res.id}
          montant_final={res.montant_final}
          statut_paiement={res.statut_paiement}
          montant_paye={res.montant_paye}
          date_paiement={res.date_paiement}
          mode_paiement={res.mode_paiement}
        />

        {/* Boutons */}
<div className="border-t pt-6 flex flex-wrap gap-4">

  <Link href={`/reservations/${res.id}/modifier`}
    className="px-4 py-2 rounded-xl font-semibold text-white"
    style={{ backgroundColor: "#4AAEA0" }}>
    ✏️ Modifier
  </Link>

  {res.statut === "en_attente" && (
    <BoutonValiderReservation
      id={res.id}
      chien_ids={chiens.map((c: any) => c.id)}
      date_debut={res.date_debut}
      date_fin={res.date_fin}
      box_id={res.box_id}
    />
  )}

  {res.statut !== "annulee" && (
    <BoutonAnnuler id={res.id} />
  )}

  <Link href={`/reservations/${res.id}/facture`}
    className="px-4 py-2 rounded-xl font-semibold text-white"
    style={{ backgroundColor: "#C9A84C" }}>
    🧾 Facture
  </Link>

  <Link href="/reservations"
    className="px-4 py-2 rounded-xl font-semibold"
    style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
    ← Retour à la liste
  </Link>

</div>

      </div>
    </main>
  );
}