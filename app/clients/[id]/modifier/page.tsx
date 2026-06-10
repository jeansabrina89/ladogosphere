import { modifierClient } from "./actions";
import { createClient } from "../../../../src/utils/supabase/server";

export default async function ModifierClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { id } = await params;

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();

  if (!client) return <div>Client introuvable</div>;

  const actionModifier = modifierClient.bind(null, id);

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto bg-white rounded-xl p-8 shadow-sm">

        <h1 className="text-4xl font-bold mb-6" style={{ color: "#1B2B5E" }}>
          ✏️ Modifier {client.prenom} {client.nom}
        </h1>

        <form action={actionModifier} className="space-y-4">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Prénom *</label>
              <input name="prenom" type="text" required
                defaultValue={client.prenom}
                className="w-full border rounded-xl p-3" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Nom *</label>
              <input name="nom" type="text" required
                defaultValue={client.nom}
                className="w-full border rounded-xl p-3" />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">Email *</label>
            <input name="email" type="email" required
              defaultValue={client.email}
              className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Téléphone</label>
            <input name="telephone" type="text"
              defaultValue={client.telephone || ""}
              className="w-full border rounded-xl p-3" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Adresse</label>
            <textarea name="adresse" rows={3}
              defaultValue={client.adresse || ""}
              className="w-full border rounded-xl p-3" />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" name="membre" id="membre"
              defaultChecked={client.membre} />
            <label htmlFor="membre" className="font-semibold">
              ⭐ Membre (tarifs préférentiels)
            </label>
          </div>

          {/* Exemption de cotisation */}
          <div className="border-t pt-4">
            <div className="flex items-center gap-2">
              <input type="checkbox" name="cotisation_exemptee" id="cotisation_exemptee"
                defaultChecked={client.cotisation_exemptee} />
              <label htmlFor="cotisation_exemptee" className="font-semibold">
                🎟️ Exempté d'adhésion
              </label>
            </div>
            <div className="mt-3">
              <label className="block font-semibold mb-1">Raison de l'exemption</label>
              <input name="cotisation_exemptee_raison" type="text"
                defaultValue={client.cotisation_exemptee_raison || ""}
                className="w-full border rounded-xl p-3"
                placeholder="Ex : employée, bénévole…" />
            </div>
          </div>

          {/* Contact d'urgence */}
          <div className="border-t pt-4">
            <h2 className="font-bold mb-3" style={{ color: "#1B2B5E" }}>
              🚨 Contact d'urgence
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold mb-1">Prénom</label>
                <input name="contact_urgence_prenom" type="text"
                  defaultValue={client.contact_urgence_prenom || ""}
                  className="w-full border rounded-xl p-3"
                  placeholder="Prénom" />
              </div>
              <div>
                <label className="block font-semibold mb-1">Nom</label>
                <input name="contact_urgence_nom" type="text"
                  defaultValue={client.contact_urgence_nom || ""}
                  className="w-full border rounded-xl p-3"
                  placeholder="Nom" />
              </div>
            </div>
            <div className="mt-3">
              <label className="block font-semibold mb-1">Téléphone</label>
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
            <a href={`/clients/${id}`}
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