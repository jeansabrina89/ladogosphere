"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { messageErreurBase } from "@/src/lib/validationChien";
import {
  valeursFormulaire,
  type EtatFormulaire,
} from "@/src/lib/etatFormulaire";

/** Champs d'identité d'une fiche client : le refus nomme le champ fautif. */
function refusIdentiteClient(
  prenom: string,
  nom: string,
  email: string
): { champ: string; message: string } | null {
  if (!prenom.trim()) return { champ: "prenom", message: "Le prénom est obligatoire." };
  if (!nom.trim()) return { champ: "nom", message: "Le nom est obligatoire." };
  if (!email.trim()) return { champ: "email", message: "L'adresse e-mail est obligatoire." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
    return { champ: "email", message: "L'adresse e-mail n'est pas valide." };
  }
  return null;
}

/** Modifie la fiche, ou RENVOIE le refus (cf. creerClient). */
export async function modifierClient(
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

  const verif = await verifierPermission("perm_clients_modifier");
  if (verif.error) return refus(verif.error);

  const prenom = String(formData.get("prenom") ?? "").trim();
  const nomClient = String(formData.get("nom") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  const invalide = refusIdentiteClient(prenom, nomClient, email);
  if (invalide) return refus(invalide.message, invalide.champ);

  // Accord photos : horodaté seulement s'il change réellement.
  const photosOk = formData.get("photos_ok") === "on";
  const { data: avant } = await supabaseAdmin
    .from("clients")
    .select("photos_ok")
    .eq("id", id)
    .maybeSingle();

  const updateData: Record<string, unknown> = {
    photos_ok: photosOk,
    prenom,
    nom: nomClient,
    email,
    telephone: formData.get("telephone") as string || null,
    adresse: formData.get("adresse") as string || null,
    membre: formData.get("membre") === "on",
    contact_urgence_prenom: formData.get("contact_urgence_prenom") as string || null,
    contact_urgence_nom: formData.get("contact_urgence_nom") as string || null,
    contact_urgence_telephone: formData.get("contact_urgence_telephone") as string || null,
  };

  if (avant && photosOk !== avant.photos_ok) {
    updateData.photos_ok_modifie_le = new Date().toISOString();
  }

  // Champs admin uniquement : ne pas modifier si employé
  if (verif.isAdmin) {
    updateData.cotisation_exemptee = formData.get("cotisation_exemptee") === "on";
    updateData.cotisation_exemptee_raison = formData.get("cotisation_exemptee_raison") as string || null;
  }

  const { error } = await supabaseAdmin
    .from("clients")
    .update(updateData)
    .eq("id", id);

  if (error) {
    console.error(error);
    if (error.code === "23505") {
      return refus("Un client existe déjà avec cette adresse e-mail.", "email");
    }
    return refus(messageErreurBase(error));
  }

  redirect(`/clients/${id}`);
}
