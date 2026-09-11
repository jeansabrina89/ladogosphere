import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import GestionBoxes from "./GestionBoxes";
import { parcBox, resumeParcBox } from "@/src/lib/usageBox";

export default async function BoxesPage() {
  await exigerAccesAdmin();

  const { data: boxes } = await supabaseAdmin
    .from("boxes")
    .select("*")
    .order("numero");

  const { data: indisponibilites } = await supabaseAdmin
    .from("box_indisponibilites")
    .select("*")
    .order("date_debut");

  // Fiches du personnel : propriétaires possibles d'un box interne.
  const { data: fichesInternes } = await supabaseAdmin
    .from("clients")
    .select("id, prenom, nom")
    .eq("interne", true)
    .order("prenom");

  // « 14 » ne dit rien au moment d'accepter une réservation : deux de ces box
  // ne sont pas de la pension. Le résumé sépare les deux.
  const parc = parcBox(boxes ?? []);

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold mb-2" style={{ color: "#1B2B5E" }}>📦 Gestion des box</h1>
        <p className="text-gray-500 mb-2">
          Renommer, configurer les capacités et gérer les indisponibilités des box.
        </p>
        <p className="mb-6 font-semibold" style={{ color: "#1B2B5E" }}>
          {resumeParcBox(parc)}
          <span className="ml-2 font-normal text-sm text-gray-500">
            {" "}— seuls les box de pension accueillent des chiens de clients ; les autres
            occupent de la place et comptent dans l&apos;occupation réelle.
          </span>
        </p>

        <GestionBoxes boxes={boxes ?? []} indisponibilites={indisponibilites ?? []} fichesInternes={fichesInternes ?? []} />
      </div>
    </main>
  );
}
