import { supabaseAdmin } from "@/src/lib/supabase-admin";
import FormReservation from "./FormReservation";

export default async function NouvelleReservationLoader() {
  const supabase = supabaseAdmin;
  const { data: clients } = await supabase
    .from("clients")
    .select("id, prenom, nom, membre")
    .eq("actif", true)
    .order("nom");

  const { data: chiens } = await supabase
    .from("chiens")
    .select("id, nom, race, categorie_poids, poids, client_id, journee_essai_effectuee, journee_essai_invalide")
    .eq("actif", true)
    .order("nom");

  const { data: boxes } = await supabase
    .from("boxes")
    .select("id, numero, nom")
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