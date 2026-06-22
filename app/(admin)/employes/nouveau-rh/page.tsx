import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import { creerEmployeRH } from "./actions";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";

export default async function NouvelEmployeRHPage() {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const inputClass = "w-full rounded-xl p-3 border border-[rgba(27,43,94,0.18)]";

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto">

        <EnTete
          titre="👤 Nouvelle fiche RH"
          action={<Bouton href="/employes" variante="secondaire">← Équipe</Bouton>}
        />

        <Carte>
          <form action={creerEmployeRH} className="space-y-4">

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold mb-1">Prénom *</label>
                <input name="prenom" type="text" required className={inputClass} />
              </div>
              <div>
                <label className="block font-semibold mb-1">Nom *</label>
                <input name="nom" type="text" required className={inputClass} />
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1">Email *</label>
              <input name="email" type="email" required className={inputClass} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold mb-1">Taux de travail (%) *</label>
                <select name="taux_travail" required className={inputClass}>
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
                  className={inputClass}
                  placeholder="ex: 4500" />
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1">Date d'entrée *</label>
              <input name="date_entree" type="date" required className={inputClass}
                defaultValue="2027-02-01" />
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" name="actif" id="actif" defaultChecked />
              <label htmlFor="actif" className="font-semibold">Employé actif</label>
            </div>

            <div className="flex gap-3 pt-4 border-t border-[rgba(27,43,94,0.12)]">
              <Bouton type="submit" variante="principal">💾 Créer la fiche RH</Bouton>
              <Bouton href="/employes" variante="secondaire">✖ Annuler</Bouton>
            </div>

          </form>
        </Carte>
      </div>
    </main>
  );
}
