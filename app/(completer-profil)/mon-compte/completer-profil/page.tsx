import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import CompleterProfilForm from "./CompleterProfilForm";

/**
 * Réparation des comptes créés avant la fiche client automatique.
 *
 * Cette page vit dans son PROPRE groupe de routes, hors du layout `(client)` :
 * ce layout redirige ici quand la fiche manque, et un layout ne connaît pas le
 * chemin courant — l'y laisser provoquerait une boucle de redirection.
 */
export default async function CompleterProfilPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: fiche } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // Fiche déjà là (page ouverte à la main, ou deuxième onglet) : rien à faire.
  if (fiche) redirect("/mon-compte");

  return (
    <main className="min-h-screen flex items-center justify-center p-8"
      style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-md w-full bg-white rounded-xl p-8 shadow-lg">
        <div className="text-center mb-6">
          <img src="/logo-compact.webp" alt="La Dogosphère"
            className="h-20 w-20 rounded-full object-cover mx-auto mb-4" />
          <h1 className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>
            Complétez votre profil
          </h1>
          <p className="text-gray-500 mt-2 text-sm">
            Il nous manque quelques informations pour finaliser votre espace client.
          </p>
        </div>
        <CompleterProfilForm email={user.email ?? ""} />
      </div>
    </main>
  );
}
