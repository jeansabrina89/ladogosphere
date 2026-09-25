"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { appliquerCohabitationClient } from "@/src/lib/cohabitationDb";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { ecart } from "@/src/lib/journalLogique";
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

  // Cet écran est celui du PROPRIÉTAIRE, et de personne d'autre.
  //
  // La garde était une lecture faite avec le client de session : si le chien
  // remontait, c'est qu'on y avait droit. Vrai pour un client — la politique
  // `client_select_chiens` ne lui rend que les siens. Faux pour le personnel :
  // `personnel_select_chiens` lui ouvre le SELECT sur TOUS les chiens. Un
  // employé passait donc ici pour n'importe quel chien, et l'écriture qui suit
  // a la clé de service, hors RLS. Le personnel a son propre écran, avec sa
  // propre garde ; cette action-ci n'est pas une porte de service.
  //
  // On ne s'en remet plus à RLS pour cette décision : on compare nous-mêmes.
  const { data: fiche } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!fiche) return refus("Accès refusé à ce chien.");

  const { data: chien } = await supabaseAdmin
    .from("chiens")
    .select("id, client_id")
    .eq("id", chien_id)
    .maybeSingle();

  if (!chien || chien.client_id !== fiche.id) return refus("Accès refusé à ce chien.");

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
  const champs = {
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
  };
  const { data: avant } = await supabaseAdmin
    .from("chiens")
    .select(Object.keys(champs).join(", "))
    .eq("id", chien.id)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("chiens")
    .update(champs)
    .eq("id", chien.id);

  if (error) return refus(messageErreurBase(error));

  const change = ecart(avant as unknown as Record<string, unknown> | null, champs);
  if (change) {
    // Faite par le client : l'auteur est son compte.
    await tracerEvenement({
      entite: "chien", entiteId: chien.id, evenement: "modification",
      avant: change.avant, apres: change.apres,
      userId: user.id,
    });
  }

  // Cohabitation en box, déclarée par le propriétaire. Sans effet si la pension
  // a tranché : sa décision prime (cf. appliquerCohabitationClient).
  await appliquerCohabitationClient(chien.id, formData.get("cohabitation"));

  redirect(`/mon-compte/chiens/${chien.id}`);
}