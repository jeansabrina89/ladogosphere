import { createClient } from "../../../src/utils/supabase/server";
import FormReservation from "./FormReservation";

export default async function NouvelleReservationLoader() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, prenom, nom, membre")
    .eq("actif", true)
    .order("nom");

  const { data: chiens } = await supabase
    .from("chiens")
    .select("id, nom, race, categorie_poids, poids, client_id")
    .eq("actif", true)
    .order("nom");

  const { data: boxes } = await supabase
    .from("boxes")
    .select("id, numero")
    .eq("actif", true)
    .order("numero");

  return (
    <FormReservation
      clients={clients ?? []}
      chiens={chiens ?? []}
      boxes={boxes ?? []}
    />
  );
}