import { createSupabaseServerClient } from "../../../../src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "../../../../src/utils/supabase/server";
import FormFicheSalaire from "./FormFicheSalaire";

export default async function CreerFicheSalairePage({
  searchParams,
}: {
  searchParams: Promise<{ employe_id?: string }>;
}) {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const params = await searchParams;

  const { data: employes } = await supabase
    .from("employes_rh")
    .select("*")
    .eq("actif", true)
    .order("nom");

  const { data: modeles } = await supabase
    .from("modeles_deductions")
    .select("*")
    .eq("actif", true)
    .order("ordre");

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-6" style={{ color: "#1B2B5E" }}>
          📊 Nouvelle fiche de salaire
        </h1>
        <FormFicheSalaire
          employes={employes ?? []}
          modeles={modeles ?? []}
          employe_id_initial={params.employe_id || ""}
        />
      </div>
    </main>
  );
}