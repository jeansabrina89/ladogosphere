"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { messageErreurBase } from "@/src/lib/validationChien";
import { compteAuthParEmail } from "@/src/lib/compteAuth";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { refusRattachementFiche } from "@/src/lib/ficheDeRecette";
import { decisionProfilPourFiche } from "@/src/lib/profilPourFicheClient";
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

/**
 * Crée la fiche, ou RENVOIE le refus : une exception de Server Action est
 * masquée en production, le message n'arriverait jamais à l'écran.
 */
export async function creerClient(
  _etat: EtatFormulaire,
  formData: FormData
): Promise<EtatFormulaire> {
  const valeurs = valeursFormulaire(formData);
  const refus = (message: string, champ?: string): EtatFormulaire => ({
    erreur: message,
    champ: champ ?? null,
    valeurs,
  });

  const verif = await verifierPermission("perm_clients_creer");
  if (verif.error) return refus(verif.error);

  const prenom = String(formData.get("prenom") ?? "").trim();
  const nomClient = String(formData.get("nom") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  const invalide = refusIdentiteClient(prenom, nomClient, email);
  if (invalide) return refus(invalide.message, invalide.champ);

  // Le compte Auth de cette adresse, s'il existe.
  //
  // Une recherche qui ÉCHOUE refuse la création. Une fiche créée sans son
  // rattachement ressemble en tout point à une fiche dont le client n'a pas de
  // compte : personne ne s'aperçoit de rien avant le jour où il se connecte et
  // ne trouve pas ses chiens.
  const recherche = await compteAuthParEmail(email);
  if (!recherche.ok) return refus(recherche.message, "email");
  const auth_user_id = recherche.id;

  // Une fiche marquée recette ne reçoit jamais un compte réel. Le même refus
  // existe en base : celui-ci n'est là que pour le dire à l'écran.
  const refusRecette = refusRattachementFiche({
    fiche: { email, nom: nomClient, prenom },
    authUserId: auth_user_id,
    emailCompte: email,
  });
  if (refusRecette) return refus(refusRecette, "email");

  // Le rôle du profil décide de la sorte de fiche, et non l'inverse : la fiche
  // de quelqu'un de la maison naît interne, et son rôle ne bouge pas.
  const { data: profilExistant } = auth_user_id
    ? await supabaseAdmin.from("profiles").select("role").eq("id", auth_user_id).maybeSingle()
    : { data: null };
  const decision = decisionProfilPourFiche(profilExistant?.role);

  const { data: creee, error } = await supabaseAdmin
    .from("clients")
    .insert({
      prenom,
      nom: nomClient,
      email: email || null,
      telephone: formData.get("telephone") as string || null,
      adresse: formData.get("adresse") as string || null,
      membre: formData.get("membre") === "on",
      actif: true,
      auth_user_id,
      interne: decision.ficheInterne,
      photos_ok: formData.get("photos_ok") === "on",
      photos_ok_modifie_le: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return refus("Un client existe déjà avec cette adresse e-mail.", "email");
    }
    return refus(messageErreurBase(error));
  }

  await tracerEvenement({
    entite: "client", entiteId: creee.id as string, evenement: "creation",
    apres: {
      prenom, nom: nomClient, email: email || null,
      interne: decision.ficheInterne, rattachee_a_un_compte: !!auth_user_id,
    },
    userId: verif.userId ?? null,
  });

  // Le profil ne reçoit « client » que s'il n'a pas déjà un rôle. Un compte
  // `admin` ou `employe` n'est JAMAIS rétrogradé : il perdrait son espace de
  // travail au rafraîchissement suivant, sans que rien ne le dise.
  if (auth_user_id && decision.roleAPoser) {
    await supabaseAdmin
      .from("profiles")
      .upsert({
        id: auth_user_id,
        email,
        role: decision.roleAPoser,
        actif: true,
      });
  }

  redirect("/clients");
}
