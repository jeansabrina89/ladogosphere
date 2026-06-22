import { createClient } from "@/src/utils/supabase/server";
import { redirect } from "next/navigation";
import { aujourdhuiISO } from "@/src/lib/dates";
import { getEmployeRhActuel } from "@/src/lib/employeActuel";
import FormIndisponibilites from "./FormIndisponibilites";
import { supprimerIndisponibilite } from "./actions";
import EnTete from "@/app/components/ui/EnTete";

export default async function IndisponibilitesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role, email").eq("id", user.id).single();
  if (!profile || !["admin", "employe"].includes(profile.role)) redirect("/");

  const employe = await getEmployeRhActuel(supabase, user.id, profile?.email);
  if (!employe) redirect("/employes/mon-espace");

  const aujourd_hui = aujourdhuiISO();

  const { data: indisponibilites } = await supabase
    .from("indisponibilites")
    .select("*")
    .eq("employe_id", employe.id)
    .gte("date", aujourd_hui)
    .order("date", { ascending: true });

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">

        <EnTete
          titre="🚫 Mes indisponibilités"
          sousTitre="Indiquez les jours où vous ne pouvez pas travailler. Ces jours seront pris en compte dans le générateur de planning."
        />

        {/* Formulaire d'ajout */}
        <div className="mb-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "24px" }}>
          <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>
            ➕ Ajouter une indisponibilité
          </h2>
          <FormIndisponibilites employe_id={employe.id} />
        </div>

        {/* Liste */}
        <div style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "24px" }}>
          <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>
            📋 Mes jours indisponibles
          </h2>
          {indisponibilites?.length === 0 && (
            <p className="text-[rgba(27,43,94,0.45)] text-sm">Aucune indisponibilité enregistrée.</p>
          )}
          <div className="space-y-2">
            {indisponibilites?.map((ind: any) => (
              <div key={ind.id} className="flex justify-between items-center rounded-xl p-3" style={{ border: "1px solid rgba(27,43,94,0.12)" }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#1B2B5E" }}>
                    {new Date(ind.date + "T12:00:00").toLocaleDateString("fr-CH", {
                      weekday: "long", day: "numeric", month: "long", year: "numeric"
                    })}
                  </p>
                  {ind.note && <p className="text-xs text-[rgba(27,43,94,0.45)] mt-0.5">{ind.note}</p>}
                </div>
                <form action={async () => {
                  "use server";
                  await supprimerIndisponibilite(ind.id);
                }}>
                  <button type="submit"
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                    style={{ backgroundColor: "#E8847A" }}>
                    ✖ Supprimer
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}
