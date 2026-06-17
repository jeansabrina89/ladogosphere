import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { modifierChienClient } from "./actions";
import Link from "next/link";

export default async function ModifierChienClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: chien } = await supabase
    .from("chiens")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!chien) {
    return (
      <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
        <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-gray-600 mb-4">Chien introuvable.</p>
          <Link href="/mon-compte/chiens" className="font-semibold" style={{ color: "#4AAEA0" }}>
            ← Retour à mes chiens
          </Link>
        </div>
      </main>
    );
  }

  const action = modifierChienClient.bind(null, chien.id);

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm">
        <h1 className="text-3xl font-bold mb-6" style={{ color: "#1B2B5E" }}>
          ✏️ Modifier {chien.nom}
        </h1>

        <form action={action} className="space-y-4">
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Nom *</label>
            <input name="nom" type="text" required defaultValue={chien.nom ?? ""} className="w-full border rounded-xl p-3" />
          </div>
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Race *</label>
            <input name="race" type="text" required defaultValue={chien.race ?? ""} className="w-full border rounded-xl p-3" />
          </div>
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Couleur *</label>
            <input name="couleur" type="text" required defaultValue={chien.couleur ?? ""} className="w-full border rounded-xl p-3" />
          </div>
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Poids (kg) *</label>
            <input name="poids" type="number" step="0.1" min="0" required defaultValue={chien.poids ?? ""} className="w-full border rounded-xl p-3" />
          </div>
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Sexe *</label>
            <select name="sexe" required defaultValue={chien.sexe ?? ""} className="w-full border rounded-xl p-3">
              <option value="" disabled>Choisir</option>
              <option value="M">Mâle</option>
              <option value="F">Femelle</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Stérilisation *</label>
            <select name="sterilisation" required defaultValue={chien.sterilisation || "non"} className="w-full border rounded-xl p-3">
              <option value="non">Non</option>
              <option value="oui">Oui</option>
              <option value="chimique">Castré chimiquement</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Date de naissance</label>
            <input name="date_naissance" type="date" defaultValue={chien.date_naissance ? String(chien.date_naissance).slice(0, 10) : ""} className="w-full border rounded-xl p-3" />
          </div>
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Numéro de puce</label>
            <input name="numero_puce" type="text" defaultValue={chien.numero_puce ?? ""} className="w-full border rounded-xl p-3" />
          </div>
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Allergies</label>
            <textarea name="allergies" rows={2} defaultValue={chien.allergies ?? ""} className="w-full border rounded-xl p-3" />
          </div>
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Traitements en cours</label>
            <textarea name="traitements" rows={2} defaultValue={chien.traitements ?? ""} className="w-full border rounded-xl p-3" />
          </div>
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Remarques</label>
            <textarea name="remarques" rows={3} defaultValue={chien.remarques ?? ""} className="w-full border rounded-xl p-3" />
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <button type="submit" className="px-6 py-3 rounded-xl font-semibold text-white" style={{ backgroundColor: "#4AAEA0" }}>
              💾 Enregistrer
            </button>
            <Link href={`/mon-compte/chiens/${chien.id}`} className="px-6 py-3 rounded-xl font-semibold" style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
              ← Annuler
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}