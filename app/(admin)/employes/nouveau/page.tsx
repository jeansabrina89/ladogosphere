import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import { creerEmploye } from "./actions";

export default async function NouvelEmployePage() {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto bg-white rounded-xl p-8 shadow-sm">

        <h1 className="text-4xl font-bold mb-6" style={{ color: "#1B2B5E" }}>➕ Ajouter un employé</h1>

        <form action={creerEmploye} className="space-y-4">

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
            <label className="block font-semibold mb-1">Mot de passe provisoire *</label>
            <input name="password" type="password" required
              className="w-full border rounded-xl p-3" />
          </div>

          <div className="border-t pt-4 space-y-5">
            <p className="font-bold" style={{ color: "#1B2B5E" }}>🔐 Permissions</p>

            {[
              {
                titre: "Opérationnel — chiens & clients",
                items: [
                  { key: "perm_chiens_creer", label: "Ajouter des chiens", defaut: true },
                  { key: "perm_chiens_modifier", label: "Modifier les chiens", defaut: true },
                  { key: "perm_clients_creer", label: "Créer des clients", defaut: true },
                  { key: "perm_clients_modifier", label: "Modifier les clients", defaut: true },
                ],
              },
              {
                titre: "Réservations & journées d'essai",
                items: [
                  { key: "perm_reservations_creer", label: "Créer des réservations", defaut: true },
                  { key: "perm_reservations_modifier", label: "Modifier des réservations", defaut: true },
                  { key: "perm_reservations_annuler", label: "Annuler des réservations", defaut: true },
                  { key: "perm_journee_essai", label: "Gérer les journées d'essai (valider / invalider)", defaut: true },
                ],
              },
              {
                titre: "Encaissements",
                items: [
                  { key: "perm_encaissements", label: "Encaissements (enregistrer un paiement, marquer payé, avoirs)", defaut: true },
                  { key: "perm_tarifs_urgence", label: "Appliquer le tarif d'urgence", defaut: false },
                ],
              },
              {
                titre: "Check-in & box",
                items: [
                  { key: "perm_checkin", label: "Check-in / check-out", defaut: true },
                  { key: "perm_box", label: "Attribuer / gérer les box", defaut: true },
                ],
              },
              {
                titre: "Planning & équipe (responsable)",
                items: [
                  { key: "perm_planning", label: "Gérer le planning de l'équipe", defaut: true },
                  { key: "perm_timbrage_equipe", label: "Gérer le timbrage de l'équipe", defaut: false },
                  { key: "perm_vacances_equipe", label: "Approuver les vacances de l'équipe", defaut: false },
                ],
              },
            ].map(({ titre, items }) => (
              <div key={titre}>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "rgba(27,43,94,0.45)" }}>{titre}</p>
                <div className="space-y-1.5 pl-1">
                  {items.map(({ key, label, defaut }) => (
                    <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" name={key} defaultChecked={defaut} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <p className="text-xs italic pt-1" style={{ color: "rgba(27,43,94,0.45)" }}>
              Acquis pour tout employé, sans réglage : son propre espace RH, la lecture des tarifs et la lecture du planning de toute l'équipe.
            </p>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <button type="submit"
              className="px-6 py-3 rounded-xl font-semibold text-white"
              style={{ backgroundColor: "#2E8B7E" }}>
              💾 Créer le compte
            </button>
            <a href="/employes"
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
