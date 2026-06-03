import { createSupabaseServerClient } from "../../../../src/lib/supabase-server";
import { supabase } from "../../../../src/lib/supabase";
import FormDemandeReservation from "./FormDemandeReservation";

export default async function NouvelleDemandeReservationPage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  // Chercher le profil client — peut être null si pas encore créé par admin
  const { data: client } = await supabase
    .from("clients")
    .select("*, chiens (id, nom, race, poids, categorie_poids, journee_essai_effectuee, journee_essai_invalide)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // Si pas de profil client encore — afficher message d'attente
  if (!client) {
    return (
      <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
        <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-4xl mb-4">🐾</p>
          <h1 className="text-2xl font-bold mb-3" style={{ color: "#1B2B5E" }}>
            Bienvenue à La Dogosphère !
          </h1>
          <p className="text-gray-600 mb-4">
            Votre profil est en cours de création par notre équipe. Vous pourrez faire votre demande de journée d'essai dès que votre profil sera activé.
          </p>
          <p className="text-sm text-gray-400">
            Contactez-nous : ladogosphere@gmail.com
          </p>
          <a href="/mon-compte"
            className="inline-block mt-6 px-6 py-3 rounded-xl font-semibold text-white"
            style={{ backgroundColor: "#4AAEA0" }}>
            ← Retour
          </a>
        </div>
      </main>
    );
  }

  const chiens = client.chiens ?? [];

  // Vérifier si tous les chiens ont fait leur journée d'essai (et aucun invalide bloquant)
  const tousChiensValides = chiens.length > 0 &&
    chiens.every((c: any) => c.journee_essai_effectuee || c.journee_essai_invalide);

  const aucunChienInvalide = chiens.every((c: any) => !c.journee_essai_invalide);

  const acces_complet = tousChiensValides && aucunChienInvalide;

  // Si tous les chiens sont invalides — aucune réservation possible
  const tousInvalides = chiens.length > 0 && chiens.every((c: any) => c.journee_essai_invalide);

  if (tousInvalides) {
    return (
      <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
        <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-4xl mb-4">❌</p>
          <h1 className="text-2xl font-bold mb-3" style={{ color: "#1B2B5E" }}>
            Réservation impossible
          </h1>
          <p className="text-gray-600 mb-4">
            La journée d'essai de vos chiens a été invalidée. Aucune réservation n'est possible.
          </p>
          <p className="text-sm text-gray-400">
            Contactez-nous pour plus d'informations : ladogosphere@gmail.com
          </p>
          <a href="/mon-compte"
            className="inline-block mt-6 px-6 py-3 rounded-xl font-semibold text-white"
            style={{ backgroundColor: "#4AAEA0" }}>
            ← Retour
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm">
        <h1 className="text-3xl font-bold mb-2" style={{ color: "#1B2B5E" }}>
          {acces_complet ? "📅 Nouvelle demande" : "🧪 Demande de journée d'essai"}
        </h1>
        <p className="text-gray-500 mb-6">
          {acces_complet
            ? "Votre demande sera confirmée par notre équipe sous 24h."
            : "Tous vos chiens doivent effectuer une journée d'essai avant de pouvoir réserver."}
        </p>
        <FormDemandeReservation
          client_id={client.id}
          chiens={chiens}
          est_membre={client.membre ?? false}
          acces_complet={acces_complet}
        />
      </div>
    </main>
  );
}