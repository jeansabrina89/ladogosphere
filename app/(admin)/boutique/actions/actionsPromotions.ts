"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifierPermissionBoutique } from "@/src/lib/permissions";
import {
  basculerPromotion,
  dupliquerPromotion,
  enregistrerPromotion,
} from "@/src/lib/promotions";
import { refusPromotion } from "@/src/lib/prixLogique";
import { lireNombre } from "@/src/lib/boutiqueLogique";
import { valeursFormulaire, type EtatFormulaire } from "@/src/lib/etatFormulaire";

/**
 * Les rubriques de la boutique — actions d'écran.
 *
 * Réservées à « Boutique — gestion » : décider d'un prix n'est pas encaisser.
 * Un refus est RETOURNÉ, jamais lancé — une exception d'action serveur est
 * masquée en production, et Sabrina ne verrait rien.
 */

export type EtatPromotion = EtatFormulaire & { message?: string | null };

async function garde(): Promise<{ userId?: string; erreur?: string }> {
  const verif = await verifierPermissionBoutique("gestion");
  if (verif.error) return { erreur: verif.error };
  return { userId: verif.userId };
}

function rafraichir() {
  revalidatePath("/boutique/actions");
  revalidatePath("/boutique");
  revalidatePath("/catalogue");
}

export async function enregistrerRubrique(
  promotionId: string | null,
  _etat: EtatPromotion,
  formData: FormData
): Promise<EtatPromotion> {
  const valeurs = valeursFormulaire(formData);

  const g = await garde();
  if (g.erreur) return { erreur: g.erreur, valeurs };

  const nom = String(formData.get("nom") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const cible = String(formData.get("cible") ?? "tous").trim();
  const date_debut = String(formData.get("date_debut") ?? "").trim();
  const date_fin = String(formData.get("date_fin") ?? "").trim();
  const pourcentage = lireNombre(formData.get("pourcentage"));

  const refus = refusPromotion({ nom, type, pourcentage, date_debut, date_fin, cible });
  if (refus) return { erreur: refus.message, champ: refus.champ, valeurs };

  // Les articles arrivent en cases cochées : on ne fait confiance qu'à leur
  // forme, la base fera respecter l'existence par sa clé étrangère.
  const articleIds = formData.getAll("article").map(String);
  if (articleIds.length === 0) {
    return { erreur: "Choisissez au moins un article pour cette rubrique.", champ: "article", valeurs };
  }

  const res = await enregistrerPromotion(
    promotionId,
    {
      nom,
      type,
      // Une rubrique « Nouveautés » met en avant sans remiser : son
      // pourcentage reste vide, et la base le fait respecter aussi.
      pourcentage: type === "nouveaute" ? null : pourcentage,
      date_debut,
      date_fin,
      cible,
      texte: String(formData.get("texte") ?? "").trim() || null,
      actif: formData.get("actif") === "on",
      ordre: Math.round(lireNombre(formData.get("ordre")) ?? 0),
    },
    articleIds,
    g.userId ?? null
  );
  if (res.error) return { erreur: res.error, valeurs };

  rafraichir();
  redirect("/boutique/actions");
}

export async function changerEtatRubrique(
  promotionId: string,
  actif: boolean
): Promise<{ error?: string; message?: string }> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const res = await basculerPromotion(promotionId, actif, g.userId ?? null);
  if (res.error) return { error: res.error };

  rafraichir();
  return {
    message: actif
      ? "Rubrique réactivée."
      : "Rubrique désactivée. Elle reste consultable, et les ventes qu'elle a portées ne changent pas.",
  };
}

export async function copierRubrique(promotionId: string): Promise<{ error?: string; id?: string }> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const res = await dupliquerPromotion(promotionId, g.userId ?? null);
  if (res.error) return { error: res.error };

  rafraichir();
  return { id: res.id };
}
