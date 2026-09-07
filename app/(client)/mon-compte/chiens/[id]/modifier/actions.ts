"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { appliquerCohabitationClient } from "@/src/lib/cohabitationDb";
import {
  validerChampsChien,
  categorieDepuisPoids,
  messageErreurBase,
} from "@/src/lib/validationChien";
import {
  valeursFormulaire,
  type EtatFormulaire,
} from "@/src/lib/etatFormulaire";

/** Modifie le chien, ou RENVOIE le refus (cf. creerChienClient). */
export async function modifierChienClient(
  chien_id: string,
  _etat: EtatFormulaire,
  formData: FormData
): Promise<EtatFormulaire> {
  const valeurs = valeursFormulaire(formData);
  const refus = (message: string, champ?: string): EtatFormulaire => ({
    erreur: message,
    champ: champ ?? null,
    valeurs,
  });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return refus("Non authentifié.");

  // Vérifie via la session (RLS) que ce chien t'appartient
  const { data: chien } = await supabase
    .from("chiens")
    .select("id")
    .eq("id", chien_id)
    .maybeSingle();

  if (!chien) return refus("Accès refusé à ce chien.");

  const nom = (formData.get("nom") as string || "").trim();
  const race = (formData.get("race") as string || "").trim();
  const couleur = (formData.get("couleur") as string || "").trim();
  const poids = formData.get("poids") ? Number(formData.get("poids")) : null;
  const sexe = (formData.get("sexe") as string || "").trim();
  const sterilisation = (formData.get("sterilisation") as string || "").trim();
  const numero_puce = (formData.get("numero_puce") as string || "").trim();

  const invalide = validerChampsChien(
    { nom, race, couleur, poids, sexe, sterilisation, numero_puce },
    { sterilisationObligatoire: true }
  );
  if (invalide) return refus(invalide.message, invalide.champ);
  // Après validation, le poids est un nombre : la garde ci-dessus l’a exigé.
  const poidsValide = Number(poids);

  // Mise à jour via supabaseAdmin — UNIQUEMENT les champs de base/santé (liste blanche)
  const { error } = await supabaseAdmin
    .from("chiens")
    .update({
      nom,
      race,
      couleur,
      poids: poidsValide,
      categorie_poids: categorieDepuisPoids(poidsValide),
      sexe,
      sterilisation,
      sterilise: sterilisation === "oui",
      date_naissance: formData.get("date_naissance") as string || null,
      numero_puce: numero_puce || null,
      allergies: formData.get("allergies") as string || null,
      traitements: formData.get("traitements") as string || null,
      remarques: formData.get("remarques") as string || null,
    })
    .eq("id", chien.id);

  if (error) return refus(messageErreurBase(error));

  // Cohabitation en box, déclarée par le propriétaire. Sans effet si la pension
  // a tranché : sa décision prime (cf. appliquerCohabitationClient).
  await appliquerCohabitationClient(chien.id, formData.get("cohabitation"));

  redirect(`/mon-compte/chiens/${chien.id}`);
}