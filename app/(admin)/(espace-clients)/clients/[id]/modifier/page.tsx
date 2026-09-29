import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import FormModifierClient, { type ClientFiche } from "./FormModifierClient";
import { cotisationActive } from "@/src/lib/cotisation";
import { aujourdhuiISO } from "@/src/lib/dates";

export default async function ModifierClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerAccesAdmin();
  const perms = await getProfilePerms();
  const supabase = supabaseAdmin;
  const { id } = await params;

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();

  if (!client) return <div>Client introuvable</div>;

  // APP 57 — le MÊME calcul que la fiche client : une cotisation payée valable
  // aujourd'hui. On ne recrée pas un second calcul, on rappelle celui-là.
  const cotisationEnCours = await cotisationActive(supabase, id, aujourdhuiISO());

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto bg-white rounded-xl p-8 shadow-sm">

        <h1 className="text-4xl font-bold mb-6" style={{ color: "#1B2B5E" }}>
          ✏️ Modifier {client.prenom} {client.nom}
        </h1>

        <FormModifierClient
          client={client as unknown as ClientFiche}
          estAdmin={perms.isAdmin}
          finAdhesion={cotisationEnCours?.date_fin ?? null}
        />
      </div>
    </main>
  );
}
