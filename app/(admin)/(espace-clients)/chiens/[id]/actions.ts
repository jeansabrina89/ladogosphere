"use server";

import { redirect } from "next/navigation";
import { oublierPhotoChien } from "@/src/lib/photoChien";
import { createClient } from "@/src/utils/supabase/server";
import { exigerAdmin } from "@/src/lib/garde";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { idUtilisateurCourant } from "@/src/lib/permissions";

export async function archiverChien(formData: FormData) {
  // Première couche : la garde. Elle manquait, et RLS tenait seule.
  //
  // `exigerAdmin` et non `perm_chiens_modifier` : l'écran l'a déjà tranché,
  // `chiens/[id]/page.tsx` n'affiche ce bouton que sous `perms.isAdmin`. La
  // route ne fait que dire ce que l'écran dit déjà. La permission de modifier
  // ouvre la fiche d'un chien, pas son retrait de la liste.
  await exigerAdmin("chien_archiver");

  const supabase = await createClient();
  const id = formData.get("id") as string;
  const actif = formData.get("actif") === "true";

  // Seconde couche : compter ce qui a VRAIMENT bougé.
  //
  // Un UPDATE que RLS filtre ne renvoie aucune erreur : il touche zéro ligne
  // et dit que tout va bien. On traçait donc une archive qui n'avait pas eu
  // lieu, puis on redirigeait comme si c'était fait.
  const { data: touchees, error } = await supabase
    .from("chiens")
    .update({ actif: !actif })
    .eq("id", id)
    .select("id");

  if (error) throw new Error(error.message);
  if (!touchees || touchees.length === 0) {
    throw new Error("Cette fiche chien n'a pas pu être archivée : elle est introuvable.");
  }

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
  // Même garde, même raison : supprimer une fiche est le geste le moins
  // réversible de cet écran, et l'écran le réserve déjà à l'administratrice.
  await exigerAdmin("chien_supprimer");

  const supabase = await createClient();
  const id = formData.get("id") as string;

  // Et le même compte de lignes : un DELETE filtré par RLS ne se plaint pas,
  // il supprime zéro ligne. L'écran annonçait la suppression quand même.
  /*
   * Le chemin de la photo est lu AVANT le DELETE : après, la ligne n'existe
   * plus et l'objet serait introuvable — donc gardé pour toujours (APP 28).
   */
  const { data: supprimees, error } = await supabase
    .from("chiens")
    .delete()
    .eq("id", id)
    .select("id, photo_principale");

  if (error) throw new Error(error.message);
  if (!supprimees || supprimees.length === 0) {
    throw new Error("Cette fiche chien n'a pas pu être supprimée : elle est introuvable.");
  }

  /*
   * La photo suit la fiche. Une donnée personnelle qui survit à la suppression
   * de son propriétaire n'est pas supprimée, elle est seulement cachée.
   *
   * Après le DELETE, jamais avant : si la suppression échoue, la photo doit
   * rester — le chien est toujours là.
   */
  for (const c of supprimees) {
    await oublierPhotoChien((c as { photo_principale?: string | null }).photo_principale, {
      chienId: id, motif: "suppression du chien",
    });
  }

  redirect("/chiens");
}
