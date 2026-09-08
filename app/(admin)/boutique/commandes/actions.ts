"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermissionBoutique } from "@/src/lib/permissions";
import {
  changerStatutCommande,
  choixDeCommande,
  lireCommande,
} from "@/src/lib/personnalisation";
import type { StatutCommande } from "@/src/lib/personnalisationLogique";

/**
 * Suivi de fabrication. Le passage en « en cours » décompte les fournitures —
 * une seule fois, la RPC s'en assure. Le passage à « prête » propose l'e-mail
 * au client ; il n'est jamais envoyé sans qu'on le demande.
 */

export type RetourCommande = {
  error?: string;
  message?: string;
  statut?: string;
  consommes?: number;
  proposerEmail?: boolean;
};

async function garde(): Promise<{ userId?: string; erreur?: string }> {
  const verif = await verifierPermissionBoutique("vente");
  if (verif.error) return { erreur: verif.error };
  return { userId: verif.userId };
}

export async function avancerCommande(
  commandeId: string,
  statut: StatutCommande,
  motif?: string | null
): Promise<RetourCommande> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const res = await changerStatutCommande(commandeId, statut, g.userId ?? null, motif);
  if (res.error) return { error: res.error };

  revalidatePath("/boutique/commandes");
  revalidatePath("/boutique/articles");
  revalidatePath("/");

  const fournitures =
    res.consommes && res.consommes > 0
      ? ` ${res.consommes} fourniture${res.consommes > 1 ? "s" : ""} décomptée${res.consommes > 1 ? "s" : ""}.`
      : "";

  return {
    statut: res.statut,
    consommes: res.consommes,
    proposerEmail: statut === "prete",
    message:
      statut === "remise"
        ? "Commande remise — elle est close."
        : `Statut mis à jour.${fournitures}`,
  };
}

/** « Votre commande est prête » — envoyé seulement sur demande. */
export async function envoyerCommandePrete(commandeId: string): Promise<RetourCommande> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const commande = await lireCommande(commandeId);
  if (!commande) return { error: "Commande introuvable." };

  const [{ data: client }, { data: article }, choix] = await Promise.all([
    supabaseAdmin.from("clients").select("prenom, nom, email").eq("id", commande.client_id).maybeSingle(),
    supabaseAdmin.from("articles").select("nom").eq("id", commande.article_id).maybeSingle(),
    choixDeCommande(commandeId),
  ]);

  const email = (client?.email as string) ?? "";
  if (!email) return { error: "Ce client n'a pas d'adresse e-mail : prévenez-le autrement." };

  const { envoyerEmailCommandePrete } = await import("@/src/lib/email");

  try {
    await envoyerEmailCommandePrete({
      email,
      prenom: (client?.prenom as string) ?? "",
      numero: commande.numero ?? "",
      article: (article?.nom as string) ?? "votre commande",
      recapitulatif: choix.map(
        (c) => `${c.groupe_nom} : ${c.valeur_texte ?? c.valeur_libelle}`
      ),
    });
  } catch {
    return { error: "L'envoi a échoué. Réessayez dans un instant." };
  }

  await supabaseAdmin.from("journal_evenements").insert({
    entite: "commande",
    entite_id: commandeId,
    evenement: "envoi",
    apres: { destinataire: email },
    user_id: g.userId ?? null,
  });

  revalidatePath("/boutique/commandes");
  return { message: `Client prévenu à ${email}.` };
}
