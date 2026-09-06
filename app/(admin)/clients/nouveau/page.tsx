import { creerClient } from "./actions";
import { exigerPersonnelPage } from "@/src/lib/exigerPersonnelPage";
import { LIBELLE_ACCORD_PHOTOS } from "@/src/lib/accordPhotos";

export default async function NouveauClientPage() {
  await exigerPersonnelPage();
  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto bg-white rounded-xl p-8 shadow-sm">

        <h1 className="text-4xl font-bold mb-6" style={{ color: "#1B2B5E" }}>
          ➕ Ajouter un client
        </h1>

        <form action={creerClient} className="space-y-4">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Prénom *</label>
              <input name="prenom" type="text" required className="w-full border rounded-xl p-3" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Nom *</label>
              <input name="nom" type="text" required className="w-full border rounded-xl p-3" />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">Email *</label>
            <input name="email" type="email" required className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Téléphone</label>
            <input name="telephone" type="text" className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Adresse</label>
            <textarea name="adresse" rows={3} className="w-full border rounded-xl p-3" />
          </div>

          <div className="border-t pt-4">
            <label className="flex items-start gap-2">
              <input type="checkbox" name="photos_ok" defaultChecked className="mt-1 h-4 w-4 flex-shrink-0" />
              <span className="text-sm">📸 {LIBELLE_ACCORD_PHOTOS}</span>
            </label>
          </div>

          <div className="border-t pt-4">
            <label className="flex items-center gap-2 font-semibold">
              <input type="checkbox" name="membre" />
              ⭐ Membre (tarifs préférentiels)
            </label>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <button type="submit"
              className="px-6 py-3 rounded-xl font-semibold text-white"
              style={{ backgroundColor: "#2E8B7E" }}>
              💾 Enregistrer
            </button>
            <a href="/clients"
              className="px-6 py-3 rounded-xl font-semibold"
              style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
              ✖ Annuler
            </a>
          </div>

        </form>
      </div>
    </main>
  );
}
