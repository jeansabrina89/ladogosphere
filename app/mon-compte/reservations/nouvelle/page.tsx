import { createSupabaseServerClient } from "../../../../src/lib/supabase-server";
import { createClient } from "../../../../src/utils/supabase/server";
import FormDemandeReservation from "./FormDemandeReservation";

export default async function NouvelleDemandeReservationPage() {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  // Chercher le profil client — peut être null si pas encore créé par admin
  const { data: client } = await supabase
    .from("clients")
    .select("*, chiens (id, nom, race, poids, categorie_poids, statut_essai)")
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

  // Tous les chiens validés → accès complet (journée + séjour)
  const acces_complet = chiens.length > 0 && chiens.every((c: any) => c.statut_essai === 'valide');

  // Tous les chiens refusés → aucune réservation possible
  const tousRefuses = chiens.length > 0 && chiens.every((c: any) => c.statut_essai === 'refuse');

  if (tousRefuses) {
    return (
      <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
        <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-4xl mb-4">❌</p>
          <h1 className="text-2xl font-bold mb-3" style={{ color: "#1B2B5E" }}>
            Réservation impossible
          </h1>
          <div className="text-gray-600 mb-4 text-left space-y-3">
            {chiens.map((c: any) => (
              <p key={c.id}>
                {c.nom} n'a pas été accepté à l'issue de sa journée d'essai et ne peut donc pas faire l'objet d'une réservation.
              </p>
            ))}
          </div>
          <p className="text-sm text-gray-500">
            N'hésitez pas à nous contacter pour plus d'informations ou pour envisager une nouvelle journée d'essai.
          </p>
          <p className="text-xs text-gray-400 mt-1">ladogosphere@gmail.com</p>
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