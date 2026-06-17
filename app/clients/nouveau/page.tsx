import { creerClient } from "./actions";
import { exigerPersonnelPage } from "@/src/lib/exigerPersonnelPage";

export default async function NouveauClientPage() {
  await exigerPersonnelPage();
  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-xl p-8 shadow">

        <h1 className="text-4xl font-bold mb-6">➕ Ajouter un client</h1>

        <form action={creerClient} className="space-y-4">

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
            <label className="block font-semibold mb-1">Téléphone</label>
            <input name="telephone" type="text"
              className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Adresse</label>
            <textarea name="adresse" rows={3}
              className="w-full border rounded-xl p-3" />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" name="membre" id="membre" />
            <label htmlFor="membre" className="font-semibold">
              ⭐ Membre (tarifs préférentiels)
            </label>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <button type="submit"
              className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700">
              💾 Enregistrer
            </button>
            <a href="/clients"
              className="bg-gray-200 text-gray-700 px-6 py-3 rounded-xl hover:bg-gray-300">
              ✖ Annuler
            </a>
          </div>

        </form>
      </div>
    </main>
  );
}