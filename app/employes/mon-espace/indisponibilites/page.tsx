import { createSupabaseServerClient } from "../../../../src/lib/supabase-server";
import { redirect } from "next/navigation";
import { supabase } from "../../../../src/lib/supabase";
import FormIndisponibilites from "./FormIndisponibilites";

export default async function IndisponibilitesPage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role, email").eq("id", user.id).single();
  if (!profile || !["admin", "employe"].includes(profile.role)) redirect("/");

  const { data: employe } = await supabase
    .from("employes_rh").select("*").eq("email", profile?.email ?? "").single();
  if (!employe) redirect("/employes/mon-espace");

  const aujourd_hui = new Date().toISOString().split("T")[0];

  const { data: indisponibilites } = await supabase
    .from("indisponibilites")
    .select("*")
    .eq("employe_id", employe.id)
    .gte("date", aujourd_hui)
    .order("date", { ascending: true });

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">

        <h1 className="text-3xl font-bold mb-2" style={{ color: "#1B2B5E" }}>
          🚫 Mes indisponibilités
        </h1>
        <p className="text-gray-500 mb-6">
          Indiquez les jours où vous ne pouvez pas travailler. Ces jours seront pris en compte dans le générateur de planning.
        </p>

        {/* Formulaire */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>
            ➕ Ajouter une indisponibilité
          </h2>
          <FormIndisponibilites employe_id={employe.id} />
        </div>

        {/* Liste */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>
            📋 Mes jours indisponibles
          </h2>
          {indisponibilites?.length === 0 && (
            <p className="text-gray-400 text-sm">Aucune indisponibilité enregistrée.</p>
          )}
          <div className="space-y-2">
            {indisponibilites?.map((ind: any) => (
              <div key={ind.id} className="flex justify-between items-center border rounded-xl p-3">
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#1B2B5E" }}>
                    {new Date(ind.date + "T12:00:00").toLocaleDateString("fr-CH", {
                      weekday: "long", day: "numeric", month: "long", year: "numeric"
                    })}
                  </p>
                  {ind.note && <p className="text-xs text-gray-400 mt-0.5">{ind.note}</p>}
                </div>
                <BoutonSupprimerIndispo id={ind.id} />
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}

function BoutonSupprimerIndispo({ id }: { id: string }) {
  return (
    <form action={`/api/rh/indisponibilites?id=${id}`} method="DELETE">
      <button type="submit"
        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
        style={{ backgroundColor: "#E8847A" }}>
        ✖ Supprimer
      </button>
    </form>
  );
}