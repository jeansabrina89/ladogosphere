import { exigerPersonnelPage } from "../../src/lib/exigerPersonnelPage";
import { supabaseAdmin } from "../../src/lib/supabase-admin";
import GestionBoxes from "./GestionBoxes";

export default async function BoxesPage() {
  await exigerPersonnelPage();

  const { data: boxes } = await supabaseAdmin
    .from("boxes")
    .select("*")
    .order("numero");

  const { data: indisponibilites } = await supabaseAdmin
    .from("box_indisponibilites")
    .select("*")
    .order("date_debut");

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold mb-2" style={{ color: "#1B2B5E" }}>📦 Gestion des box</h1>
        <p className="text-gray-500 mb-6">
          Renommer, configurer les capacités et gérer les indisponibilités des box.
        </p>

        <GestionBoxes boxes={boxes ?? []} indisponibilites={indisponibilites ?? []} />
      </div>
    </main>
  );
}
