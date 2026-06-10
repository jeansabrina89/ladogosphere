import { createClient } from "../../../../src/utils/supabase/server";
import { modifierEmploye } from "./actions";
import BoutonSupprimerEmploye from "./BoutonSupprimerEmploye";

export default async function ModifierEmployePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { id } = await params;

  const { data: emp } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { data: rh } = await supabase
    .from("employes_rh")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { data: rhParEmail } = !rh && emp ? await supabase
    .from("employes_rh")
    .select("*")
    .eq("email", emp?.email || "")
    .maybeSingle() : { data: null };

  const rhData = rh || rhParEmail;

  if (!emp && !rhData) return <div>Employé introuvable</div>;

  const actionModifier = modifierEmploye.bind(null, id, rhData?.id || null);

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm">

        <h1 className="text-3xl font-bold mb-2" style={{ color: "#1B2B5E" }}>
          ✏️ Modifier l'employé
        </h1>
        <p className="text-gray-500 mb-6">{rhData?.prenom || emp?.prenom} {rhData?.nom || emp?.nom}</p>

        <form action={actionModifier} className="space-y-6">

          {/* Infos personnelles */}
          <div>
            <h2 className="font-bold mb-3 text-sm uppercase tracking-wide text-gray-400">
              Informations personnelles
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold mb-1 text-sm">Prénom</label>
                <input name="prenom" type="text"
                  defaultValue={rhData?.prenom || emp?.prenom || ""}
                  className="w-full border rounded-xl p-3" />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-sm">Nom</label>
                <input name="nom" type="text"
                  defaultValue={rhData?.nom || emp?.nom || ""}
                  className="w-full border rounded-xl p-3" />
              </div>
            </div>
            <div className="mt-4">
              <label className="block font-semibold mb-1 text-sm">Email</label>
              <input name="email" type="email"
                defaultValue={rhData?.email || emp?.email || ""}
                className="w-full border rounded-xl p-3" />
            </div>
            <div className="mt-4">
              <label className="block font-semibold mb-1 text-sm">Téléphone</label>
              <input name="telephone" type="tel"
                defaultValue={rhData?.telephone || emp?.telephone || ""}
                placeholder="+41 79 000 00 00"
                className="w-full border rounded-xl p-3" />
            </div>
            <div className="mt-4">
  <label className="block font-semibold mb-1 text-sm">N° AVS</label>
  <input name="numero_avs" type="text"
    defaultValue={rhData?.numero_avs || ""}
    placeholder="756.XXXX.XXXX.XX"
    className="w-full border rounded-xl p-3" />
</div>
<div className="mt-4">
  <label className="block font-semibold mb-1 text-sm">Date de naissance</label>
  <input name="date_naissance" type="date"
    defaultValue={rhData?.date_naissance || ""}
    className="w-full border rounded-xl p-3" />
</div>
            <div className="mt-4">
              <label className="block font-semibold mb-1 text-sm">Adresse</label>
              <input name="adresse" type="text"
                defaultValue={rhData?.adresse || ""}
                placeholder="Rue de la Paix 1, 1950 Sion"
                className="w-full border rounded-xl p-3" />
            </div>
          </div>

          {/* Infos RH */}
          {rhData && (
            <div>
              <h2 className="font-bold mb-3 text-sm uppercase tracking-wide text-gray-400">
                Informations RH
              </h2>

              {/* Poste */}
              <div className="mb-4">
                <label className="block font-semibold mb-1 text-sm">Poste</label>
                <select name="poste" defaultValue={rhData.poste || "Auxiliaire"}
                  className="w-full border rounded-xl p-3">
                  <option value="Gardien-ne d'animaux CFC">Gardien-ne d'animaux CFC</option>
                  <option value="Apprenti-e Gardien-ne d'animaux">Apprenti-e Gardien-ne d'animaux</option>
                  <option value="Auxiliaire">Auxiliaire</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>

              {/* Poste autre */}
              <div className="mb-4">
                <label className="block font-semibold mb-1 text-sm">
                  Précision poste (si "Autre")
                </label>
                <input name="poste_autre" type="text"
                  defaultValue={rhData.poste_autre || ""}
                  placeholder="Ex: Responsable administrative"
                  className="w-full border rounded-xl p-3" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold mb-1 text-sm">Taux de travail</label>
                  <select name="taux_travail" defaultValue={rhData.taux_travail}
                    className="w-full border rounded-xl p-3">
                    <option value="100">100% — 5j/semaine</option>
                    <option value="80">80% — 4j/semaine</option>
                    <option value="60">60% — 3j/semaine</option>
                    <option value="40">40% — 2j/semaine</option>
                    <option value="20">20% — 1j/semaine</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-sm">Salaire base 100% (CHF)</label>
                  <input name="salaire_base" type="number" step="50"
                    defaultValue={rhData.salaire_base}
                    className="w-full border rounded-xl p-3" />
                </div>
              </div>
              <div className="mt-4">
                <label className="block font-semibold mb-1 text-sm">Date d'entrée</label>
                <input name="date_entree" type="date"
                  defaultValue={rhData.date_entree}
                  className="w-full border rounded-xl p-3" />
              </div>
              <div className="mt-4 flex items-center gap-2">
                <input type="checkbox" name="actif" id="actif"
                  defaultChecked={rhData.actif} />
                <label htmlFor="actif" className="font-semibold text-sm">Employé actif</label>
              </div>
            </div>
          )}

          {/* Mot de passe */}
          {emp && (
            <div>
              <h2 className="font-bold mb-3 text-sm uppercase tracking-wide text-gray-400">
                Sécurité
              </h2>
              <div className="border rounded-xl p-4" style={{ backgroundColor: "#F8FAFC" }}>
                <label className="block font-semibold mb-1 text-sm">
                  Nouveau mot de passe
                  <span className="text-gray-400 font-normal ml-2">— laisser vide pour ne pas changer</span>
                </label>
                <input name="nouveau_mdp" type="password" minLength={6}
                  placeholder="minimum 6 caractères"
                  className="w-full border rounded-xl p-3 bg-white" />
              </div>
            </div>
          )}

          {/* Permissions */}
          {emp && emp.role === "employe" && (
            <div>
              <h2 className="font-bold mb-3 text-sm uppercase tracking-wide text-gray-400">
                Permissions
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "perm_checkin", label: "✅ Check-in/out" },
                  { key: "perm_reservations_creer", label: "➕ Créer réservations" },
                  { key: "perm_reservations_modifier", label: "✏️ Modifier réservations" },
                  { key: "perm_reservations_annuler", label: "❌ Annuler réservations" },
                  { key: "perm_clients_creer", label: "👤 Créer clients" },
                  { key: "perm_clients_modifier", label: "✏️ Modifier clients" },
                  { key: "perm_chiens_modifier", label: "🐕 Modifier chiens" },
                  { key: "perm_planning", label: "📅 Planning" },
                  { key: "perm_tarifs_urgence", label: "🚨 Tarifs urgence" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name={key}
                      defaultChecked={(emp as any)[key] || false} />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t">
            <button type="submit"
              className="px-6 py-3 rounded-xl font-semibold text-white"
              style={{ backgroundColor: "#4AAEA0" }}>
              💾 Enregistrer
            </button>
            <a href="/employes"
              className="px-6 py-3 rounded-xl font-semibold"
              style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
              ✖ Annuler
            </a>
          </div>
        </form>

        {emp && (
          <div className="border-t mt-8 pt-6">
            <h2 className="font-bold mb-3" style={{ color: "#E8847A" }}>⚠️ Zone dangereuse</h2>
            <BoutonSupprimerEmploye id={id} nom={`${emp.prenom} ${emp.nom}`} />
          </div>
        )}

      </div>
    </main>
  );
}