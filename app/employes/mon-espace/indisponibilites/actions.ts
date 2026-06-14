"use server";

import { createClient } from "../../../../src/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function supprimerIndisponibilite(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  // La RLS DELETE garantit que seul l'employé propriétaire peut supprimer sa ligne.
  const { error } = await supabase
    .from("indisponibilites")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/employes/mon-espace/indisponibilites");
  return {};
}
