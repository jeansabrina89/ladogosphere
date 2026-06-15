import Link from "next/link";
import { exigerPersonnelPage } from "../../../src/lib/exigerPersonnelPage";
import { supabaseAdmin } from "../../../src/lib/supabase-admin";
import { getMouvementsAvoir, calculerSoldeAvoir } from "../../../src/lib/avoirs";
import BoutonArchiverClient from "./BoutonArchiverClient";
import BoutonSupprimerClient from "./BoutonSupprimerClient";
import BoutonCotisation from "./BoutonCotisation";
import GestionAvoir from "./GestionAvoir";
import { getProfilePerms } from "../../../src/lib/getProfilePerms";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigerPersonnelPage();
  const perms = await getProfilePerms();
  const supabase = supabaseAdmin;

  const { data: client } = await supabase
    .from("clients")
    .select(`*, chiens (id, nom, race, poids, categorie_poids, sexe, sterilisation)`)
    .eq("id", id)
    .single();

  if (!client) return <div>Client introuvable</div>;

  const anneeActuelle = new Date().getFullYear();

  // Cotisations existantes
  const { data: cotisations } = await supabase
    .from("cotisations_membres")
    .select("*")
    .eq("client_id", id)
    .order("annee", { ascending: false });

  // Montant cotisation
  const { data: parametre } = await supabase
    .from("parametres")
    .select("valeur")
    .eq("cle", "cotisation_montant")
    .single();

  const montantCotisation = parseFloat(parametre?.valeur ?? "180");
  const cotisationAnneeActuelle = cotisations?.find(c => c.annee === anneeActuelle);

  // Avoir client (lecture admin via supabaseAdmin)
  const mouvementsAvoir = await getMouvementsAvoir(supabaseAdmin, id);
  const soldeAvoir = calculerSoldeAvoir(mouvementsAvoir);

  const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto bg-white rounded-xl p-8 shadow-sm">

        {client.actif === false && (
          <div className="bg-yellow-100 text-yellow-800 px-4 py-2 rounded-xl mb-6 font-semibold">
            🗄️ Ce client est archivé
          </div>
        )}

        <div className="flex justify-between items-start mb-6">
          <h1 className="text-4xl font-bold" style={{ color: "#1B2B5E" }}>
            👤 {client.prenom} {client.nom}
          </h1>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
            client.membre ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
          }`}>
            {client.membre ? "⭐ Membre" : "Standard"}
          </span>
        </div>

        {/* Infos principales */}
        <div className="space-y-2 mb-8">
          <p><strong>Email :</strong> {client.email}</p>
          <p><strong>Téléphone :</strong> {client.telephone || "—"}</p>
          <p><strong>Adresse :</strong> {client.adresse || "—"}</p>
          <p><strong>Client depuis :</strong> {new Date(client.created_at).toLocaleDateString("fr-CH")}</p>
        </div>

        {/* Section cotisation membre */}
        <div className="border-t pt-6 mb-8">
          <h2 className="text-2xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
            ⭐ Adhésion membre
          </h2>

          {/* Alerte si cotisation manquante pour l'année en cours */}
          {client.membre && !cotisationAnneeActuelle && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4">
              <p className="text-orange-700 font-semibold text-sm">
                ⚠️ Aucune adhésion enregistrée pour {anneeActuelle} — renouvellement requis !
              </p>
            </div>
          )}

          {/* Bouton enregistrer/renouveler */}
          {perms.perm_encaissements && (
            <BoutonCotisation
              client_id={client.id}
              client_nom={`${client.prenom} ${client.nom}`}
              est_membre={client.membre}
              cotisation_existante={!!cotisationAnneeActuelle}
              montant={montantCotisation}
              annee={anneeActuelle}
              est_exempte={client.cotisation_exemptee}
              raison_exemption={client.cotisation_exemptee_raison}
            />
          )}

          {/* Historique des cotisations */}
          {cotisations && cotisations.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Historique</p>
              {cotisations.map((c: any) => (
                <div key={c.id} className="flex justify-between items-center border rounded-xl p-3">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: "#1B2B5E" }}>
                      Adhésion {c.annee}
                    </p>
                    <p className="text-xs text-gray-500">
                      {c.mode_paiement === "cash" ? "💵 Cash" :
                       c.mode_paiement === "virement" ? "🏦 Virement IBAN" :
                       c.mode_paiement === "prochaine_resa" ? "📅 Prochaine réservation" : "—"}
                      {c.date_paiement && ` — ${new Date(c.date_paiement).toLocaleDateString("fr-CH")}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm" style={{ color: "#4AAEA0" }}>
                      CHF {Number(c.montant).toFixed(2)}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      c.statut === "payee" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                    }`}>
                      {c.statut === "payee" ? "✅ Payée" : "⏳ En attente"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Avoir client — admin ou employé avec perm_encaissements */}
        {(perms.isAdmin || perms.perm_encaissements) && (
          <GestionAvoir client_id={client.id} solde={soldeAvoir} mouvements={mouvementsAvoir} />
        )}

        {/* Contact d'urgence */}
        <div className="border-t pt-6 mb-8">
          <h2 className="text-2xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
            🚨 Contact d'urgence
          </h2>
          {!client.contact_urgence_nom && !client.contact_urgence_prenom && !client.contact_urgence_telephone ? (
            <p className="text-gray-400">Aucun contact d'urgence renseigné</p>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
              <p>
                <strong>Nom :</strong>{" "}
                {client.contact_urgence_prenom || ""} {client.contact_urgence_nom || "—"}
              </p>
              <p>
                <strong>Téléphone :</strong>{" "}
                {client.contact_urgence_telephone
                  ? <a href={`tel:${client.contact_urgence_telephone}`}
                      className="font-semibold"
                      style={{ color: "#4AAEA0" }}>
                      {client.contact_urgence_telephone}
                    </a>
                  : "—"}
              </p>
            </div>
          )}
        </div>

        {/* Chiens */}
        <div className="border-t pt-6 mb-8">
          <h2 className="text-2xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
            🐶 Chiens ({client.chiens?.length ?? 0})
          </h2>
          <div className="grid gap-3">
            {client.chiens?.length === 0 && (
              <p className="text-gray-400">Aucun chien enregistré</p>
            )}
            {client.chiens?.map((chien: any) => (
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
                    chien.sterilisation === "oui" ? "stérilisé(e)" :
                    chien.sterilisation === "chimique" ? "castré chimiquement" : "entier(e)"
                  }</p>
                </div>
              </Link>
            ))}
          </div>
          {perms.perm_chiens_creer && (
            <div className="mt-4">
              <Link href="/chiens/nouveau"
                className="text-sm font-semibold"
                style={{ color: "#4AAEA0" }}>
                ➕ Ajouter un chien à ce client
              </Link>
            </div>
          )}
        </div>

        {/* Boutons */}
        <div className="border-t pt-6 flex flex-wrap gap-4">
          {perms.perm_clients_modifier && (
            <Link href={`/clients/${client.id}/modifier`}
              className="px-4 py-2 rounded-xl font-semibold text-white"
              style={{ backgroundColor: "#4AAEA0" }}>
              ✏️ Modifier le client
            </Link>
          )}
          {perms.isAdmin && <BoutonArchiverClient id={client.id} actif={client.actif} />}
          {perms.isAdmin && <BoutonSupprimerClient id={client.id} nom={`${client.prenom} ${client.nom}`} />}
          <Link href="/clients"
            className="px-4 py-2 rounded-xl font-semibold"
            style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
            ← Retour à la liste
          </Link>
        </div>

      </div>
    </main>
  );
}
