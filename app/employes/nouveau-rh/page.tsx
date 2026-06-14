import { createSupabaseServerClient } from "../../../src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "../../../src/utils/supabase/server";
import { creerEmployeRH } from "./actions";

export default async function NouvelEmployeRHPage() {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm">

        <h1 className="text-3xl font-bold mb-6" style={{ color: "#1B2B5E" }}>
          👤 Nouvelle fiche RH
        </h1>

        <form action={creerEmployeRH} className="space-y-4">

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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Taux de travail (%) *</label>
              <select name="taux_travail" required className="w-full border rounded-xl p-3">
                <option value="100">100% — 5j/semaine</option>
                <option value="90">90% — alternance 4/5j</option>
                <option value="80">80% — 4j/semaine</option>
                <option value="70">70% — alternance 3/4j</option>
                <option value="60">60% — 3j/semaine</option>
                <option value="50">50% — alternance 2/3j</option>
                <option value="40">40% — 2j/semaine</option>
                <option value="30">30% — alternance 1/2j</option>
                <option value="20">20% — 1j/semaine</option>
                <option value="10">10% — alternance 0/1j</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">Salaire de base 100% (CHF) *</label>
              <input name="salaire_base" type="number" step="50" required
                className="w-full border rounded-xl p-3"
                placeholder="ex: 4500" />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">Date d'entrée *</label>
            <input name="date_entree" type="date" required className="w-full border rounded-xl p-3"
              defaultValue="2027-02-01" />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" name="actif" id="actif" defaultChecked />
            <label htmlFor="actif" className="font-semibold">Employé actif</label>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <button type="submit"
              className="px-6 py-3 rounded-xl font-semibold text-white"
              style={{ backgroundColor: "#4AAEA0" }}>
              💾 Créer la fiche RH
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