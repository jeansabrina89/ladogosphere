import Link from "next/link";
import { exigerPersonnelPage } from "../../../src/lib/exigerPersonnelPage";
import { supabaseAdmin } from "../../../src/lib/supabase-admin";
import { getSoldeAvoir } from "../../../src/lib/avoirs";
import BoutonAnnuler from "./BoutonAnnuler";
import BoutonSupprimerDefinitif from "./BoutonSupprimerDefinitif";
import CalculFacture from "./CalculFacture";
import GestionPrix from "./GestionPrix";
import BoutonValiderReservation from "../../components/BoutonValiderReservation";
import BoutonEmail from "./BoutonEmail";
import GestionPaiement from "./GestionPaiement";
import { formatDate } from "../../../src/lib/dates";
import { formatBoxLabel } from "../../../src/lib/boxes";
import { getProfilePerms } from "../../../src/lib/getProfilePerms";

export default async function ReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerPersonnelPage();
  const perms = await getProfilePerms();
  const supabase = supabaseAdmin;
  const { id } = await params;

  const { data: res } = await supabase
    .from("reservations")
    .select(`
      *,
      clients (id, prenom, nom, membre, telephone, email),
      boxes (numero, nom),
      reservation_chiens (
        chiens (id, nom, race, poids, categorie_poids, sexe, sterilisation, doit_etre_isole)
      ),
      reservation_extras (id, libelle, montant, created_at)
    `)
    .eq("id", id)
    .single();

  const { data: tarifs } = await supabase
    .from("tarifs")
    .select("categorie, membre, prix")
    .eq("actif", true);

  if (!res) return <div>Réservation introuvable</div>;

  const chiens = res.reservation_chiens?.map((rc: any) => rc.chiens).filter(Boolean) ?? [];
  const chien_isole = chiens.some((c: any) => c.doit_etre_isole);
  const est_membre = res.clients?.membre ?? false;
  const anneeActuelle = new Date().getFullYear();

  // Chercher cotisation en attente pour ce client
  const { data: cotisation } = await supabase
    .from("cotisations_membres")
    .select("*")
    .eq("client_id", res.clients?.id)
    .eq("statut", "en_attente")
    .eq("annee", anneeActuelle)
    .maybeSingle();

  // Solde d'avoir du client (pour le paiement par avoir)
  const soldeAvoir = res.clients?.id ? await getSoldeAvoir(supabaseAdmin, res.clients.id) : 0;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto bg-white rounded-xl p-8 shadow-sm">

        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-4xl font-bold" style={{ color: "#1B2B5E" }}>📅 Réservation</h1>
            {res.numero && (
              <p className="text-lg font-semibold mt-1" style={{ color: "#4AAEA0" }}>
                N° {res.numero}
              </p>
            )}
          </div>
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

        {/* Alerte cotisation en attente */}
        {cotisation && (
          <div className="bg-yellow-50 border border-yellow-200 px-4 py-3 rounded-xl mb-6">
            <p className="text-yellow-800 font-semibold text-sm">
              ⭐ Ce client a une adhésion membre {anneeActuelle} en attente de paiement (CHF {Number(cotisation.montant).toFixed(2)}) — elle peut être incluse dans cette facture.
            </p>
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
                  <p>{chien.sexe === "M" ? "♂️" : "♀️"} {
                    chien.sterilisation === "oui" ? "stér." :
                    chien.sterilisation === "chimique" ? "castr. chim." : "entier"
                  }</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Détails */}
        <div className="border-t pt-6 mb-6">
          <h2 className="text-2xl font-bold mb-4" style={{ color: "#1B2B5E" }}>📋 Détails</h2>
          <p><strong>N° réservation :</strong> {res.numero || "—"}</p>
          <p><strong>Type :</strong> {
            res.type_reservation === "journee" ? "Journée" :
            res.type_reservation === "sejour" ? "Séjour" : "Journée d'essai"
          }</p>
          <p><strong>Box :</strong> {formatBoxLabel(res.boxes)}</p>
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
          chien_isole={chien_isole}
          est_membre={est_membre}
          tarifs={tarifs ?? []}
          montant_actuel={res.montant_final}
          cotisation_en_attente={!!cotisation}
          cotisation_id={cotisation?.id}
          cotisation_montant={cotisation ? Number(cotisation.montant) : undefined}
          perm_reservations_modifier={perms.perm_reservations_modifier}
        />

        {/* Prix retenu + lignes supplémentaires */}
        <GestionPrix
          reservation_id={res.id}
          statut={res.statut}
          montant_calcule={res.montant_calcule}
          ajustement_manuel={res.ajustement_manuel}
          montant_final={res.montant_final}
          extras={res.reservation_extras ?? []}
          perm_reservations_modifier={perms.perm_reservations_modifier}
        />

        {/* Paiement */}
        <GestionPaiement
          reservation_id={res.id}
          client_id={res.clients?.id}
          solde_avoir={soldeAvoir}
          montant_final={res.montant_final}
          statut_paiement={res.statut_paiement}
          montant_paye={res.montant_paye}
          date_paiement={res.date_paiement}
          mode_paiement={res.mode_paiement}
          perm_encaissements={perms.perm_encaissements}
        />

        {/* Boutons */}
        <div className="border-t pt-6 flex flex-wrap gap-4">

          {perms.perm_reservations_modifier && (
            <Link href={`/reservations/${res.id}/modifier`}
              className="px-4 py-2 rounded-xl font-semibold text-white"
              style={{ backgroundColor: "#4AAEA0" }}>
              ✏️ Modifier
            </Link>
          )}

          {res.statut === "en_attente" && (
            <BoutonValiderReservation id={res.id} />
          )}

          {res.statut_paiement !== "paye" && res.montant_final !== null && (
            <BoutonEmail
              type="paiement"
              reservation_id={res.id}
              label="💰 Demande de paiement"
              couleur="#C9A84C"
            />
          )}

          {res.type_reservation === "essai" && (
            <BoutonEmail
              type="satisfaction_essai"
              reservation_id={res.id}
              label="⭐ Email satisfaction"
              couleur="#4AAEA0"
            />
          )}

          {res.statut !== "annulee" && perms.perm_reservations_annuler && (
            <BoutonAnnuler id={res.id} />
          )}

          {res.statut === "annulee" && perms.isAdmin && (
            <BoutonSupprimerDefinitif id={res.id} />
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