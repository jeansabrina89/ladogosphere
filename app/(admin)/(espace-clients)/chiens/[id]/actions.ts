"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { idUtilisateurCourant } from "@/src/lib/permissions";

export async function archiverChien(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const actif = formData.get("actif") === "true";

  const { error } = await supabase
    .from("chiens")
    .update({ actif: !actif })
    .eq("id", id);

  if (error) throw new Error(error.message);

  await tracerEvenement({
    entite: "chien", entiteId: id,
    // Le même bouton archive et désarchive : le sens se lit dans avant/après.
    evenement: "archive",
    avant: { actif }, apres: { actif: !actif },
    userId: await idUtilisateurCourant(),
  });
  redirect(`/chiens/${id}`);
}

export async function supprimerChien(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;

  const { error } = await supabase
    .from("chiens")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
  redirect("/chiens");
}