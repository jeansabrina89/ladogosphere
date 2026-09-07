"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
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
export async function modifierChien(
  id: string,
  _etat: EtatFormulaire,
  formData: FormData
): Promise<EtatFormulaire> {
  const valeurs = valeursFormulaire(formData);
  const refus = (message: string, champ?: string): EtatFormulaire => ({
    erreur: message,
    champ: champ ?? null,
    valeurs,
  });

  const verif = await verifierPermission("perm_chiens_modifier");
  if (verif.error) return refus(verif.error);

  const poids = Number(formData.get("poids"));
  const sterilisationRaw = formData.get("sterilisation") as string;
  const sterilisation = ["oui", "non", "chimique"].includes(sterilisationRaw) ? sterilisationRaw : "non";
  const race = (formData.get("race") as string || "").trim();
  const numero_puce = (formData.get("numero_puce") as string || "").trim();
  const nom = (formData.get("nom") as string || "").trim();
  const couleur = (formData.get("couleur") as string || "").trim();
  const sexe = (formData.get("sexe") as string || "").trim();

  const invalide = validerChampsChien(
    { nom, race, couleur, poids, sexe, sterilisation, numero_puce },
    { puceObligatoire: true }
  );
  if (invalide) return refus(invalide.message, invalide.champ);

  const { error } = await supabaseAdmin
    .from("chiens")
    .update({
      nom,
      race,
      couleur,
      poids,
      categorie_poids: categorieDepuisPoids(poids),
      date_naissance: formData.get("date_naissance") || null,
      sexe,
      sterilisation,
      sterilise: sterilisation === "oui",
      numero_puce,
      niveau_energie: formData.get("niveau_energie"),
      allergies: formData.get("allergies"),
      traitements: formData.get("traitements"),
      veterinaire_nom: formData.get("veterinaire_nom"),
      veterinaire_telephone: formData.get("veterinaire_telephone"),
      comportement: formData.get("comportement"),
      comportement_autre: formData.get("comportement_autre") || null,
      protection_ressources: formData.get("protection_ressources") === "on",
      destructeur: formData.get("destructeur") === "on",
      craintif: formData.get("craintif") === "on",
      remarques: formData.get("remarques"),
      compatible_males_castres: formData.get("compatible_males_castres") === "on",
      compatible_males_entiers: formData.get("compatible_males_entiers") === "on",
      compatible_femelles_sterilisees: formData.get("compatible_femelles_sterilisees") === "on",
      compatible_femelles_entieres: formData.get("compatible_femelles_entieres") === "on",
      compatible_moins_15kg: formData.get("compatible_moins_15kg") === "on",
      compatible_15_30kg: formData.get("compatible_15_30kg") === "on",
      compatible_30_40kg: formData.get("compatible_30_40kg") === "on",
    })
    .eq("id", id);

  if (error) return refus(messageErreurBase(error));
  redirect(`/chiens/${id}`);
}
