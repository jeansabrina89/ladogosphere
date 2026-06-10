import { createSupabaseServerClient } from "../../../../src/lib/supabase-server";
import { creerChienClient } from "./actions";

export default async function NouveauChienClientPage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  const { data: client } = await supabaseServer
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!client) return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm text-center">
        <p className="text-4xl mb-4">🐾</p>
        <h1 className="text-2xl font-bold mb-3" style={{ color: "#1B2B5E" }}>
          Profil en cours de création
        </h1>
        <p className="text-gray-600 mb-4">
          Votre profil est en cours de validation. Revenez dans quelques instants.
        </p>
        <a href="/mon-compte"
          className="inline-block mt-4 px-6 py-3 rounded-xl font-semibold text-white"
          style={{ backgroundColor: "#4AAEA0" }}>
          ← Retour
        </a>
      </div>
    </main>
  );

  const action = creerChienClient.bind(null, client.id);

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm">

        <h1 className="text-3xl font-bold mb-6" style={{ color: "#1B2B5E" }}>
          🐶 Ajouter un chien
        </h1>

        <form action={action} className="space-y-4">

          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Nom *</label>
            <input name="nom" type="text" required className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Race *</label>
            <input name="race" type="text" required className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Couleur *</label>
            <input name="couleur" type="text" required className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Poids (kg) *</label>
            <input name="poids" type="number" step="0.1" min="0" required className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Sexe *</label>
            <select name="sexe" required defaultValue="" className="w-full border rounded-xl p-3">
              <option value="" disabled>Choisir</option>
              <option value="M">Mâle</option>
              <option value="F">Femelle</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Stérilisation *</label>
            <select name="sterilisation" required defaultValue="" className="w-full border rounded-xl p-3">
              <option value="" disabled>Choisir</option>
              <option value="non">Non</option>
              <option value="oui">Oui</option>
              <option value="chimique">Castré chimiquement</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Date de naissance</label>
            <input name="date_naissance" type="date" className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Numéro de puce</label>
            <input name="numero_puce" type="text" className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Allergies</label>
            <textarea name="allergies" rows={2} className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Traitements en cours</label>
            <textarea name="traitements" rows={2} className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Remarques</label>
            <textarea name="remarques" rows={3} className="w-full border rounded-xl p-3" />
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