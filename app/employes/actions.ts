"use server";

import { createSupabaseServerClient } from "../../src/lib/supabase-server";
import { revalidatePath } from "next/cache";

export async function supprimerEmploye(id: string): Promise<{ error?: string }> {
  const supabase = await createSupabaseServerClient();

  // Sécurité : admin uniquement
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: "Accès réservé à l'admin" };

  // Historique RH lié, puis l'employé
  const { data: fiches } = await supabase
    .from("fiches_salaire").select("id").eq("employe_id", id);
  const ficheIds = (fiches ?? []).map((f: any) => f.id);
  if (ficheIds.length) {
    await supabase.from("fiche_salaire_deductions").delete().in("fiche_id", ficheIds);
  }
  await supabase.from("fiches_salaire").delete().eq("employe_id", id);
  await supabase.from("planning_employes").delete().eq("employe_id", id);
  await supabase.from("demandes_vacances").delete().eq("employe_id", id);
  await supabase.from("timbrage").delete().eq("employe_id", id);
  await supabase.from("indisponibilites").delete().eq("employe_id", id);

  const { error } = await supabase.from("employes_rh").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/employes");
  return {};
}