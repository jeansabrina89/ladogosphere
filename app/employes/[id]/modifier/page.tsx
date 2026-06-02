import { supabase } from "../../../../src/lib/supabase";
import { modifierEmploye, supprimerEmploye } from "./actions";
import BoutonSupprimerEmploye from "./BoutonSupprimerEmploye";

export default async function ModifierEmployePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: emp } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (!emp) return <div>Employé introuvable</div>;

  const actionModifier = modifierEmploye.bind(null, id);

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow">

        <h1 className="text-4xl font-bold mb-2">✏️ Modifier l'employé</h1>
        <p className="text-gray-600 mb-6">{emp.email}</p>

        <form action={actionModifier} className="space-y-4">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Prénom</label>
              <input name="prenom" defaultValue={emp.prenom || ""}
                className="w-full border rounded-xl p-3" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Nom</label>
              <input name="nom" defaultValue={emp.nom || ""}
                className="w-full border rounded-xl p-3" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" name="actif" id="actif"
              defaultChecked={emp.actif} />
            <label htmlFor="actif" className="font-semibold">
              Compte actif
            </label>
          </div>

          {/* Nouveau mot de passe */}
          <div className="border rounded-xl p-4 bg-slate-50">
            <label className="block font-semibold mb-1">
              Nouveau mot de passe
              <span className="text-gray-400 font-normal text-sm ml-2">
                — laisser vide pour ne pas changer
              </span>
            </label>
            <input name="nouveau_mdp" type="password" minLength={6}
              placeholder="minimum 6 caractères"
              className="w-full border rounded-xl p-3 bg-white" />
          </div>

          {/* Permissions */}
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
                  <input type="checkbox" name={key}
                    defaultChecked={(emp as any)[key]} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-4 border-t">
            <button type="submit"
              className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700">
              💾 Enregistrer
            </button>
            <a href="/employes"
              className="bg-gray-200 text-gray-700 px-6 py-3 rounded-xl hover:bg-gray-300">
              ✖ Annuler
            </a>
          </div>

        </form>

        {/* Suppression */}
        <div className="border-t mt-8 pt-6">
          <h2 className="font-bold text-red-600 mb-3">⚠️ Zone dangereuse</h2>
          <BoutonSupprimerEmploye id={id} nom={`${emp.prenom} ${emp.nom}`} />
        </div>

      </div>
    </main>
  );
}