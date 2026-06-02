import { createSupabaseServerClient } from "../../../../src/lib/supabase-server";
import { supabase } from "../../../../src/lib/supabase";
import FormDemandeReservation from "./FormDemandeReservation";

export default async function NouvelleDemandeReservationPage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  const { data: client } = await supabase
    .from("clients")
    .select("*, chiens (id, nom, race, poids, categorie_poids)")
    .eq("auth_user_id", user.id)
    .single();

  if (!client) return <div>Profil introuvable</div>;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm">
        <h1 className="text-3xl font-bold mb-2" style={{ color: "#1B2B5E" }}>
          📅 Nouvelle demande
        </h1>
        <p className="text-gray-500 mb-6">
          Votre demande sera confirmée par notre équipe sous 24h.
        </p>
        <FormDemandeReservation
          client_id={client.id}
          chiens={client.chiens ?? []}
          est_membre={client.membre ?? false}
        />
      </div>
    </main>
  );
}
