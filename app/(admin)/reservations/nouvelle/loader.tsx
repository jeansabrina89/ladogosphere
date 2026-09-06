import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import { clientsMembresAJour } from "@/src/lib/membre";
import FormReservation from "./FormReservation";

export default async function NouvelleReservationLoader() {
  const supabase = supabaseAdmin;
  const perms = await getProfilePerms();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, prenom, nom, membre, cotisation_exemptee")
    .eq("actif", true)
    .order("nom");

  const setAJour = await clientsMembresAJour(supabase, (clients ?? []).map((c) => c.id));
  const clientsAvecStatut = (clients ?? []).map((c) => ({ ...c, aJour: setAJour.has(c.id) }));

  const { data: chiens } = await supabase
    .from("chiens")
    .select("id, nom, race, categorie_poids, poids, client_id, statut_essai")
    .eq("actif", true)
    .order("nom");

  const { data: boxes } = await supabase
    .from("boxes")
    .select("id, numero, nom")
    .eq("actif", true)
    .order("numero");

  return (
    <FormReservation
      clients={clientsAvecStatut}
      chiens={chiens ?? []}
      boxes={boxes ?? []}
      peutUrgence={perms.perm_tarifs_urgence}
    />
  );
}
