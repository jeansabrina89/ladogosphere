import { modifierChien } from "./actions";
import { createClient } from "../../../../src/utils/supabase/server";

export default async function ModifierChienPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { id } = await params;

  const { data: chien } = await supabase
    .from("chiens")
    .select("*")
    .eq("id", id)
    .single();

  if (!chien) return <div>Chien introuvable</div>;

  const actionModifier = modifierChien.bind(null, id);

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto bg-white rounded-xl p-8 shadow-sm">

        <h1 className="text-4xl font-bold mb-6" style={{ color: "#1B2B5E" }}>
          ✏️ Modifier {chien.nom}
        </h1>

        <form action={actionModifier} className="space-y-4">

          <div>
            <label className="block font-semibold mb-1">Nom</label>
            <input name="nom" defaultValue={chien.nom}
              className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Race</label>
            <input name="race" defaultValue={chien.race || ""}
              className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Couleur</label>
            <input name="couleur" defaultValue={chien.couleur || ""}
              className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Poids (kg)</label>
            <input name="poids" type="number" step="0.1"
              defaultValue={chien.poids || ""}
              className="w-full border rounded-xl p-3" />
            <p className="text-sm text-gray-500 mt-1">
              Catégorie actuelle : {
                chien.categorie_poids === "moins_15kg" ? "🟢 Petit (< 15 kg)" :
                chien.categorie_poids === "15_30kg" ? "🟡 Moyen (15–30 kg)" :
                chien.categorie_poids === "30_40kg" ? "🔴 Grand (> 30 kg)" : "—"
              }
            </p>
          </div>

          <div>
            <label className="block font-semibold mb-1">Date de naissance</label>
            <input name="date_naissance" type="date"
              defaultValue={chien.date_naissance || ""}
              className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Sexe</label>
            <select name="sexe" defaultValue={chien.sexe || ""}
              className="w-full border rounded-xl p-3">
              <option value="M">Mâle</option>
              <option value="F">Femelle</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1">Stérilisation</label>
            <select name="sterilisation"
              defaultValue={chien.sterilisation || "non"}
              className="w-full border rounded-xl p-3">
              <option value="non">Non</option>
              <option value="oui">Oui</option>
              <option value="chimique">Castré chimiquement</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1">Numéro de puce</label>
            <input name="numero_puce" defaultValue={chien.numero_puce || ""}
              className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Niveau d'énergie</label>
            <select name="niveau_energie"
              defaultValue={chien.niveau_energie || ""}
              className="w-full border rounded-xl p-3">
              <option value="">Choisir</option>
              <option value="faible">Faible</option>
              <option value="moyen">Moyen</option>
              <option value="eleve">Élevé</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1">Allergies</label>
            <textarea name="allergies" rows={3}
              defaultValue={chien.allergies || ""}
              className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Traitements</label>
            <textarea name="traitements" rows={3}
              defaultValue={chien.traitements || ""}
              className="w-full border rounded-xl p-3" />
          </div>

          {/* Vétérinaire */}
          <div className="border-t pt-4">
            <h2 className="font-bold mb-3" style={{ color: "#1B2B5E" }}>
              🩺 Vétérinaire
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block font-semibold mb-1">Nom du vétérinaire</label>
                <input name="veterinaire_nom"
                  defaultValue={chien.veterinaire_nom || ""}
                  className="w-full border rounded-xl p-3" />
              </div>
              <div>
                <label className="block font-semibold mb-1">Téléphone du vétérinaire</label>
                <input name="veterinaire_telephone"
                  defaultValue={chien.veterinaire_telephone || ""}
                  className="w-full border rounded-xl p-3" />
              </div>
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">Comportement / Sociabilité</label>
            <textarea name="comportement" rows={3}
              defaultValue={chien.comportement || ""}
              className="w-full border rounded-xl p-3" />
          </div>

          {/* Comportements particuliers */}
          <div className="border-t pt-4">
            <h2 className="font-bold mb-3" style={{ color: "#1B2B5E" }}>
              ⚠️ Comportements particuliers
            </h2>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="protection_ressources"
                  defaultChecked={chien.protection_ressources} />
                ⚠️ Protection de ressources
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="destructeur"
                  defaultChecked={chien.destructeur} />
                🔨 Destructeur
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="craintif"
                  defaultChecked={chien.craintif} />
                😰 Craintif
              </label>
            </div>
            <div className="mt-3">
              <label className="block font-semibold mb-1">Autres comportements</label>
              <input name="comportement_autre" type="text"
                defaultValue={chien.comportement_autre || ""}
                className="w-full border rounded-xl p-3"
                placeholder="Ex: aboie beaucoup, saute sur les gens..." />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">Remarques</label>
            <textarea name="remarques" rows={4}
              defaultValue={chien.remarques || ""}
              className="w-full border rounded-xl p-3" />
          </div>

          {/* Compatibilité sexe */}
          <div className="border-t pt-4">
            <h2 className="font-bold mb-3">🤝 Compatibilité — Sexe</h2>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="compatible_males_castres"
                  defaultChecked={chien.compatible_males_castres} />
                Mâles castrés
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="compatible_males_entiers"
                  defaultChecked={chien.compatible_males_entiers} />
                Mâles entiers
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="compatible_femelles_sterilisees"
                  defaultChecked={chien.compatible_femelles_sterilisees} />
                Femelles stérilisées
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="compatible_femelles_entieres"
                  defaultChecked={chien.compatible_femelles_entieres} />
                Femelles entières
              </label>
            </div>
          </div>

          {/* Compatibilité poids */}
          <div className="border-t pt-4">
            <h2 className="font-bold mb-3">⚖️ Compatibilité — Gabarit</h2>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="compatible_moins_15kg"
                  defaultChecked={chien.compatible_moins_15kg} />
                🟢 Chiens de moins de 15 kg (Petits)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="compatible_15_30kg"
                  defaultChecked={chien.compatible_15_30kg} />
                🟡 Chiens de 15 à 30 kg (Moyens)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="compatible_30_40kg"
                  defaultChecked={chien.compatible_30_40kg} />
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
            <a href={`/chiens/${id}`}
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