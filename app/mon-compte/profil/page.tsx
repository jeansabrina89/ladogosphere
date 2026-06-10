import { createSupabaseServerClient } from "../../../src/lib/supabase-server";
import { createClient } from "../../../src/utils/supabase/server";
import { modifierProfil } from "./actions";

export default async function MonProfilPage() {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  if (!client) return <div>Profil introuvable</div>;

  const actionModifier = modifierProfil.bind(null, client.id);

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm">

        <h1 className="text-3xl font-bold mb-6" style={{ color: "#1B2B5E" }}>
          👤 Mon profil
        </h1>

        <form action={actionModifier} className="space-y-4">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Prénom</label>
              <input name="prenom" defaultValue={client.prenom || ""}
                className="w-full border rounded-xl p-3" />
            </div>
            <div>
              <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Nom</label>
              <input name="nom" defaultValue={client.nom || ""}
                className="w-full border rounded-xl p-3" />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Email</label>
            <input type="email" defaultValue={client.email || ""}
              disabled
              className="w-full border rounded-xl p-3 bg-gray-100 text-gray-500" />
            <p className="text-xs text-gray-400 mt-1">L'email ne peut pas être modifié</p>
          </div>

          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Téléphone</label>
            <input name="telephone" type="text" defaultValue={client.telephone || ""}
              className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Adresse</label>
            <textarea name="adresse" rows={3} defaultValue={client.adresse || ""}
              className="w-full border rounded-xl p-3" />
          </div>

          {/* Contact d'urgence */}
          <div className="border-t pt-4">
            <h2 className="font-bold mb-3" style={{ color: "#1B2B5E" }}>
              🚨 Contact d'urgence
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Prénom</label>
                <input name="contact_urgence_prenom" type="text"
                  defaultValue={client.contact_urgence_prenom || ""}
                  className="w-full border rounded-xl p-3"
                  placeholder="Prénom" />
              </div>
              <div>
                <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Nom</label>
                <input name="contact_urgence_nom" type="text"
                  defaultValue={client.contact_urgence_nom || ""}
                  className="w-full border rounded-xl p-3"
                  placeholder="Nom" />
              </div>
            </div>
            <div className="mt-3">
              <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Téléphone</label>
              <input name="contact_urgence_telephone" type="text"
                defaultValue={client.contact_urgence_telephone || ""}
                className="w-full border rounded-xl p-3"
                placeholder="+41 XX XXX XX XX" />
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <button type="submit"
              className="px-6 py-3 rounded-xl font-semibold text-white"
              style={{ backgroundColor: "#4AAEA0" }}>
              💾 Enregistrer
            </button>
            <a href="/mon-compte"
              className="px-6 py-3 rounded-xl font-semibold"
              style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
              ← Retour
            </a>
          </div>

        </form>
      </div>
    </main>
  );
}