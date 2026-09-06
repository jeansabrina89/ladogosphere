"use server";

import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import {
  decisionFicheClient,
  normaliserEmail,
  validerIdentiteInscription,
  type FicheClientExistante,
  type IdentiteInscription,
} from "@/src/lib/inscriptionClient";

export type ResultatFicheClient = { ok: true; client_id: string } | { ok: false; error: string };

/** Fenêtre pendant laquelle un compte tout juste créé peut être rattaché sans session. */
const DELAI_INSCRIPTION_MS = 15 * 60 * 1000;

/**
 * Résout l'utilisateur pour lequel on crée/lie la fiche.
 *
 * Cette action est joignable par POST direct : on ne fait JAMAIS confiance à
 * l'`userId` transmis par le navigateur.
 * - Si une session existe (cas normal, l'e-mail est auto-confirmé sur ce projet),
 *   elle fait autorité et l'`userId` reçu est ignoré.
 * - Sans session (projet exigeant la confirmation d'e-mail), on accepte l'id
 *   seulement s'il désigne un compte réel, avec le MÊME e-mail, encore non
 *   confirmé et créé il y a moins de 15 minutes — c'est-à-dire une inscription
 *   en cours, et rien d'autre.
 */
async function resoudreUtilisateur(
  userIdRecu: string | null | undefined,
  email: string
): Promise<{ id: string; email: string } | { erreur: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user: session } } = await supabase.auth.getUser();
  if (session) return { id: session.id, email: normaliserEmail(session.email) };

  if (!userIdRecu) return { erreur: "Session introuvable, veuillez vous reconnecter." };

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userIdRecu);
  const compte = data?.user;
  if (error || !compte) return { erreur: "Compte introuvable, veuillez vous reconnecter." };
  if (normaliserEmail(compte.email) !== email) {
    return { erreur: "Compte introuvable, veuillez vous reconnecter." };
  }
  if (compte.email_confirmed_at) {
    // Compte déjà confirmé : il doit passer par une vraie session.
    return { erreur: "Veuillez vous connecter pour compléter votre profil." };
  }
  const creeLe = compte.created_at ? new Date(compte.created_at).getTime() : 0;
  if (!creeLe || Date.now() - creeLe > DELAI_INSCRIPTION_MS) {
    return { erreur: "Veuillez vous connecter pour compléter votre profil." };
  }
  return { id: compte.id, email: normaliserEmail(compte.email) };
}

/**
 * Crée (ou rattache) la fiche `clients` d'un compte, et son profil `profiles`.
 *
 * Appelée juste après `supabase.auth.signUp` côté navigateur, et par la page
 * « compléter mon profil » pour réparer un compte ancien resté sans fiche.
 * Tout passe par `supabaseAdmin` : la RLS n'autorise ni INSERT ni UPDATE sur
 * `clients`/`profiles` pour le rôle `authenticated` (elle reste inchangée).
 */
export async function creerOuLierFicheClient(input: {
  userId?: string | null;
  email: string;
  prenom: string;
  nom: string;
  telephone?: string | null;
  photos_ok?: boolean;
}): Promise<ResultatFicheClient> {
  const email = normaliserEmail(input.email);
  if (!email) return { ok: false, error: "Adresse e-mail manquante." };

  const identite: IdentiteInscription = {
    prenom: (input.prenom ?? "").trim(),
    nom: (input.nom ?? "").trim(),
    telephone: (input.telephone ?? "").trim() || null,
  };
  const invalide = validerIdentiteInscription(identite);
  if (invalide) return { ok: false, error: invalide };

  const utilisateur = await resoudreUtilisateur(input.userId, email);
  if ("erreur" in utilisateur) return { ok: false, error: utilisateur.erreur };

  // L'e-mail de référence est TOUJOURS celui du compte Auth, jamais celui du
  // formulaire (qui pourrait viser la fiche d'un autre client).
  const emailCompte = utilisateur.email || email;

  // Fiche portant cet e-mail, comparaison insensible à la casse.
  // `%`, `_` et `\` sont échappés : sans cela un e-mail contenant un underscore
  // (parfaitement légal) deviendrait un joker et matcherait une AUTRE fiche.
  const CHAMPS_FICHE = "id, auth_user_id, prenom, nom, telephone, email, photos_ok_modifie_le";
  const motifEmail = emailCompte.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: candidats, error: errLecture } = await supabaseAdmin
    .from("clients")
    .select(CHAMPS_FICHE)
    .ilike("email", motifEmail)
    .limit(5);
  if (errLecture) return { ok: false, error: errLecture.message };
  // Ceinture et bretelles : on ne garde que les égalités exactes (hors casse).
  const fiches = (candidats ?? []).filter(
    (c) => normaliserEmail((c as { email?: string | null }).email) === emailCompte
  );

  // Une fiche déjà liée à CE compte prime (elle peut porter un autre e-mail).
  // C'est le cas NORMAL : le trigger `on_auth_user_created` a déjà posé une
  // fiche minimale (prénom/nom vides) au moment du signUp.
  const { data: fichesLiees } = await supabaseAdmin
    .from("clients")
    .select(CHAMPS_FICHE)
    .eq("auth_user_id", utilisateur.id)
    .limit(1);

  const ficheBrute = ((fichesLiees ?? [])[0] ?? fiches[0] ?? null) as
    | (FicheClientExistante & { photos_ok_modifie_le?: string | null })
    | null;
  const fiche = ficheBrute as FicheClientExistante | null;

  const decision = decisionFicheClient({ fiche, authUserId: utilisateur.id, identite });
  if (decision.action === "refus") return { ok: false, error: decision.message };

  const photosOk = input.photos_ok !== false;
  const maintenant = new Date().toISOString();
  let clientId: string;

  if (decision.action === "lier") {
    // Liste blanche : rattachement + champs d'identité encore vides + accord photos.
    const maj: Record<string, unknown> = {
      auth_user_id: utilisateur.id,
      ...decision.champs,
    };
    // L'accord photos n'est posé que si le client n'a encore JAMAIS choisi
    // (photos_ok_modifie_le null) : on n'écrase pas un choix explicite, et on
    // enregistre bien celui de l'inscription malgré la fiche pré-créée par le
    // trigger `on_auth_user_created`.
    if (!ficheBrute?.photos_ok_modifie_le) {
      maj.photos_ok = photosOk;
      maj.photos_ok_modifie_le = maintenant;
    }
    const { error } = await supabaseAdmin.from("clients").update(maj).eq("id", decision.id);
    if (error) return { ok: false, error: error.message };
    clientId = decision.id;
  } else {
    const { data, error } = await supabaseAdmin
      .from("clients")
      .insert({
        prenom: identite.prenom,
        nom: identite.nom,
        email: emailCompte,
        telephone: identite.telephone,
        auth_user_id: utilisateur.id,
        actif: true,
        membre: false,
        photos_ok: photosOk,
        photos_ok_modifie_le: maintenant,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "Un client existe déjà avec cette adresse e-mail." };
      }
      return { ok: false, error: error.message };
    }
    clientId = data.id;
  }

  // Profil applicatif — créé ici, jamais depuis le navigateur.
  // On ne crée le profil QUE s'il n'existe pas : réécrire role = 'client' sur un
  // profil existant rétrograderait un compte personnel/admin qui repasse par ici.
  const { data: profilExistant } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", utilisateur.id)
    .maybeSingle();

  if (!profilExistant) {
    const { error: errProfil } = await supabaseAdmin.from("profiles").insert({
      id: utilisateur.id,
      email: emailCompte,
      prenom: identite.prenom,
      nom: identite.nom,
      role: "client",
      actif: true,
    });
    if (errProfil) return { ok: false, error: errProfil.message };
  }

  return { ok: true, client_id: clientId };
}
