import { createClient } from "../../../src/utils/supabase/server";
import { creerChien } from "./actions";

export default async function NouveauChienPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, prenom, nom")
    .order("nom");

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto bg-white rounded-xl p-8 shadow-sm">

        <h1 className="text-4xl font-bold mb-6" style={{ color: "#1B2B5E" }}>
          ➕ Ajouter un chien
        </h1>

        <form action={creerChien} className="space-y-4">

          <div>
            <label className="block font-semibold mb-1">Propriétaire *</label>
            <select name="client_id" required className="w-full border rounded-xl p-3">
              <option value="">-- Sélectionner --</option>
              {clients?.map(c => (
                <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1">Nom *</label>
            <input name="nom" type="text" required className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Race</label>
            <input name="race" type="text" className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Couleur</label>
            <input name="couleur" type="text" className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Poids (kg) *</label>
            <input name="poids" type="number" step="0.1" required className="w-full border rounded-xl p-3" />
            <p className="text-sm text-gray-500 mt-1">
              Catégorie calculée automatiquement : &lt;15kg = Petit · 15-30kg = Moyen · &gt;30kg = Grand
            </p>
          </div>

          <div>
            <label className="block font-semibold mb-1">Date de naissance</label>
            <input name="date_naissance" type="date" className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Sexe *</label>
            <select name="sexe" required className="w-full border rounded-xl p-3">
              <option value="">Choisir</option>
              <option value="M">Mâle</option>
              <option value="F">Femelle</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1">Stérilisé(e)</label>
            <select name="sterilise" className="w-full border rounded-xl p-3">
              <option value="false">Non</option>
              <option value="true">Oui</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1">Numéro de puce</label>
            <input name="numero_puce" type="text" className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Niveau d'énergie</label>
            <select name="niveau_energie" className="w-full border rounded-xl p-3">
              <option value="">Choisir</option>
              <option value="faible">Faible</option>
              <option value="moyen">Moyen</option>
              <option value="eleve">Élevé</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1">Allergies</label>
            <textarea name="allergies" rows={3} className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Traitements</label>
            <textarea name="traitements" rows={3} className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Comportement / Sociabilité</label>
            <textarea name="comportement" rows={3} className="w-full border rounded-xl p-3" />
          </div>

          {/* Comportements particuliers */}
          <div className="border-t pt-4">
            <h2 className="font-bold mb-3" style={{ color: "#1B2B5E" }}>
              ⚠️ Comportements particuliers
            </h2>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="protection_ressources" />
                ⚠️ Protection de ressources
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="destructeur" />
                🔨 Destructeur
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="craintif" />
                😰 Craintif
              </label>
            </div>
            <div className="mt-3">
              <label className="block font-semibold mb-1">Autres comportements</label>
              <input name="comportement_autre" type="text"
                className="w-full border rounded-xl p-3"
                placeholder="Ex: aboie beaucoup, saute sur les gens..." />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">Remarques</label>
            <textarea name="remarques" rows={4} className="w-full border rounded-xl p-3" />
          </div>

          {/* Compatibilité sexe */}
          <div className="border-t pt-4">
            <h2 className="font-bold mb-3">🤝 Compatibilité — Sexe</h2>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="compatible_males_castres" />
                Mâles castrés
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="compatible_males_entiers" />
                Mâles entiers
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="compatible_femelles_sterilisees" />
                Femelles stérilisées
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="compatible_femelles_entieres" />
                Femelles entières
              </label>
            </div>
          </div>

          {/* Compatibilité poids */}
          <div className="border-t pt-4">
            <h2 className="font-bold mb-3">⚖️ Compatibilité — Gabarit</h2>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="compatible_moins_15kg" />
                🟢 Chiens de moins de 15 kg (Petits)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="compatible_15_30kg" />
                🟡 Chiens de 15 à 30 kg (Moyens)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="compatible_30_40kg" />
                🔴 Chiens de plus de 30 kg (Grands)
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <button type="submit"
              className="px-6 py-3 rounded-xl font-semibold text-white"
              style={{ backgroundColor: "#4AAEA0" }}>
              💾 Enregistrer
            </button>
            <a href="/chiens"
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