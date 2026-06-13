import { createSupabaseServerClient } from "../../../src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "../../../src/utils/supabase/server";
import { creerEmploye } from "./actions";

export default async function NouvelEmployePage() {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow">

        <h1 className="text-4xl font-bold mb-6">➕ Ajouter un employé</h1>

        <form action={creerEmploye} className="space-y-4">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Prénom *</label>
              <input name="prenom" type="text" required
                className="w-full border rounded-xl p-3" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Nom *</label>
              <input name="nom" type="text" required
                className="w-full border rounded-xl p-3" />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">Email *</label>
            <input name="email" type="email" required
              className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Mot de passe provisoire *</label>
            <input name="password" type="password" required
              className="w-full border rounded-xl p-3" />
          </div>

          <div className="border-t pt-4">
            <p className="font-bold mb-3">🔐 Permissions</p>
            <div className="space-y-2">
              {[
                { key: "perm_checkin", label: "Check-in / Check-out" },
                { key: "perm_reservations_creer", label: "Créer des réservations" },
                { key: "perm_reservations_modifier", label: "Modifier des réservations" },
                { key: "perm_reservations_annuler", label: "Annuler des réservations" },
                { key: "perm_clients_creer", label: "Créer des clients" },
                { key: "perm_clients_modifier", label: "Modifier des clients" },
                { key: "perm_chiens_modifier", label: "Modifier des chiens" },
                { key: "perm_planning", label: "Voir le planning" },
                { key: "perm_tarifs_urgence", label: "Appliquer tarifs urgence" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2">
                  <input type="checkbox" name={key} defaultChecked={key !== "perm_tarifs_urgence"} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <button type="submit"
              className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700">
              💾 Créer le compte
            </button>
            <a href="/employes"
              className="bg-gray-200 text-gray-700 px-6 py-3 rounded-xl hover:bg-gray-300">
              ✖ Annuler
            </a>
          </div>

        </form>
      </div>
    </main>
  );
}