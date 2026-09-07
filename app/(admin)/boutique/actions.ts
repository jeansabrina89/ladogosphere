"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { aujourdhuiISO } from "@/src/lib/dates";
import {
  enregistrerMouvement,
  validerInventaire,
  entrerStockDepuisDepense,
  lireArticle,
} from "@/src/lib/boutique";
import {
  validerChampsArticle,
  normaliserReference,
  normaliserCodeBarres,
  quantiteSignee,
  ecartInventaire,
  lireNombre,
  tauxPropose,
  type TypeMouvement,
} from "@/src/lib/boutiqueLogique";
import {
  valeursFormulaire,
  type EtatFormulaire,
} from "@/src/lib/etatFormulaire";

/**
 * Boutique — actions d'écran. Toutes exigent perm_boutique (l'admin l'a
 * d'office). Le stock n'est jamais écrit ici : on passe un mouvement, et c'est
 * le trigger SQL qui tient le compte.
 *
 * Un refus est RETOURNÉ, jamais lancé : une exception d'action serveur est
 * masquée en production, et l'utilisateur ne verrait rien.
 */

export type EtatBoutique = EtatFormulaire & { message?: string | null };

const TYPES_MANUELS: TypeMouvement[] = ["entree", "perte", "usage_interne", "retour", "ajustement"];

async function garde(): Promise<{ userId?: string; erreur?: string }> {
  const verif = await verifierPermission("perm_boutique");
  if (verif.error) return { erreur: verif.error };
  return { userId: verif.userId };
}

/** Création et modification d'un article : une seule action, un seul chemin. */
export async function enregistrerArticle(
  articleId: string | null,
  _etat: EtatBoutique,
  formData: FormData
): Promise<EtatBoutique> {
  const g = await garde();
  const valeurs = valeursFormulaire(formData);
  if (g.erreur) return { erreur: g.erreur, valeurs };

  const nom = String(formData.get("nom") ?? "").trim();
  const categorie = String(formData.get("categorie") ?? "").trim();
  const taux_tva = lireNombre(formData.get("taux_tva")) ?? tauxPropose(categorie);
  const prix_vente = lireNombre(formData.get("prix_vente"));
  const prix_achat = lireNombre(formData.get("prix_achat"));
  const stock_alerte = lireNombre(formData.get("stock_alerte"));

  const refus = validerChampsArticle({
    nom,
    categorie,
    taux_tva,
    prix_vente,
    prix_achat,
    stock_alerte,
  });
  if (refus) return { erreur: refus.message, champ: refus.champ, valeurs };

  const champs: Record<string, unknown> = {
    nom,
    description: String(formData.get("description") ?? "").trim() || null,
    categorie,
    marque: String(formData.get("marque") ?? "").trim() || null,
    fournisseur_id: (formData.get("fournisseur_id") as string) || null,
    taux_tva,
    prix_vente,
    prix_achat,
    stock_alerte: stock_alerte ?? 0,
    unite: String(formData.get("unite") ?? "").trim() || "pièce",
    code_barres: normaliserCodeBarres(formData.get("code_barres") as string),
    actif: formData.get("actif") === "on",
    vendable_en_ligne: formData.get("vendable_en_ligne") === "on",
  };

  // Référence laissée vide : la base l'attribue elle-même, sous la forme ART-0001.
  const reference = normaliserReference(formData.get("reference") as string);
  if (reference) champs.reference = reference;

  if (articleId) {
    const { error } = await supabaseAdmin
      .from("articles")
      .update(champs)
      .eq("id", articleId);
    if (error) return { erreur: messageBase(error), champ: champFautif(error), valeurs };

    revalidatePath("/boutique/articles");
    revalidatePath(`/boutique/articles/${articleId}`);
    redirect(`/boutique/articles/${articleId}`);
  }

  const { data, error } = await supabaseAdmin
    .from("articles")
    .insert(champs)
    .select("id")
    .single();
  if (error) return { erreur: messageBase(error), champ: champFautif(error), valeurs };

  revalidatePath("/boutique/articles");
  redirect(`/boutique/articles/${data.id as string}`);
}

/** Entrée manuelle, perte, usage interne, retour — et l'ajustement d'inventaire. */
export async function passerMouvement(
  articleId: string,
  _etat: EtatBoutique,
  formData: FormData
): Promise<EtatBoutique> {
  const g = await garde();
  const valeurs = valeursFormulaire(formData);
  if (g.erreur) return { erreur: g.erreur, valeurs };

  const type = String(formData.get("type") ?? "") as TypeMouvement;
  if (!TYPES_MANUELS.includes(type)) {
    return { erreur: "Choisissez le type de mouvement.", champ: "type", valeurs };
  }

  const article = await lireArticle(articleId);
  if (!article) return { erreur: "Article introuvable.", valeurs };

  const motif = String(formData.get("motif") ?? "").trim();
  const saisie = lireNombre(formData.get("quantite"));
  if (saisie === null) {
    return { erreur: "Indiquez une quantité.", champ: "quantite", valeurs };
  }

  // L'ajustement se saisit en stock compté, pas en écart : c'est ce qu'on a
  // sous les yeux dans le local.
  const quantite =
    type === "ajustement"
      ? ecartInventaire(Number(article.stock_actuel), saisie)
      : quantiteSignee(type, saisie);

  if (type === "ajustement" && quantite === 0) {
    return { erreur: "Le stock compté est déjà celui de la fiche : rien à ajuster.", champ: "quantite", valeurs };
  }

  const res = await enregistrerMouvement({
    article_id: articleId,
    type,
    quantite,
    motif,
    date_peremption: (formData.get("date_peremption") as string) || null,
    user_id: g.userId ?? null,
  });
  if (res.error) {
    return { erreur: res.error, champ: res.error.includes("motif") ? "motif" : "quantite", valeurs };
  }

  revalidatePath("/boutique/articles");
  revalidatePath(`/boutique/articles/${articleId}`);
  revalidatePath("/");
  return { erreur: null, message: "Mouvement enregistré." };
}

/**
 * Validation d'un comptage complet : un mouvement d'ajustement par écart, tous
 * avec le même motif « Inventaire du … ».
 */
export async function validerComptage(
  _etat: EtatBoutique,
  formData: FormData
): Promise<EtatBoutique> {
  const g = await garde();
  if (g.erreur) return { erreur: g.erreur };

  const date = String(formData.get("date_inventaire") ?? "").trim() || aujourdhuiISO();

  const lignes: { article_id: string; stock_theorique: number; stock_compte: number | null }[] = [];
  for (const [cle, brut] of formData.entries()) {
    if (!cle.startsWith("compte_")) continue;
    const article_id = cle.slice("compte_".length);
    const compte = lireNombre(brut);
    const theorique = lireNombre(formData.get(`theorique_${article_id}`)) ?? 0;
    lignes.push({ article_id, stock_theorique: theorique, stock_compte: compte });
  }

  if (lignes.every((l) => l.stock_compte === null)) {
    return { erreur: "Aucune quantité comptée : il n'y a rien à valider." };
  }

  const res = await validerInventaire(lignes, date, g.userId ?? null);
  if (res.erreurs.length > 0) return { erreur: res.erreurs[0] };

  revalidatePath("/boutique/articles");
  revalidatePath("/boutique/inventaire");
  revalidatePath("/");
  return {
    erreur: null,
    message:
      res.ajustements === 0
        ? "Inventaire validé : aucun écart, le stock était juste."
        : `Inventaire validé : ${res.ajustements} ajustement${res.ajustements > 1 ? "s" : ""} enregistré${res.ajustements > 1 ? "s" : ""}.`,
  };
}

/** Entrées en stock rattachées à une dépense de marchandises déjà validée. */
export async function entrerStock(
  depenseId: string,
  _etat: EtatBoutique,
  formData: FormData
): Promise<EtatBoutique> {
  const g = await garde();
  if (g.erreur) return { erreur: g.erreur };

  const lignes: { article_id: string; quantite: number; date_peremption?: string | null }[] = [];
  for (const [cle, brut] of formData.entries()) {
    if (!cle.startsWith("quantite_")) continue;
    const article_id = cle.slice("quantite_".length);
    if (formData.get(`article_${article_id}`) !== "on") continue;
    const quantite = lireNombre(brut);
    if (quantite === null || quantite <= 0) continue;
    lignes.push({
      article_id,
      quantite,
      date_peremption: (formData.get(`peremption_${article_id}`) as string) || null,
    });
  }

  if (lignes.length === 0) {
    return { erreur: "Cochez au moins un article et indiquez sa quantité." };
  }

  const res = await entrerStockDepuisDepense(depenseId, lignes, g.userId ?? null);
  if (res.erreurs.length > 0) return { erreur: res.erreurs[0] };

  revalidatePath("/boutique/articles");
  revalidatePath(`/comptabilite/depenses/${depenseId}`);
  revalidatePath("/");
  return {
    erreur: null,
    message: `${res.entrees} entrée${res.entrees > 1 ? "s" : ""} en stock enregistrée${res.entrees > 1 ? "s" : ""}.`,
  };
}

// ── Messages ────────────────────────────────────────────────────────────────

/** Jamais de texte Postgres à l'écran. */
function messageBase(erreur: { message?: string; code?: string } | null): string {
  const m = erreur?.message ?? "";
  if (erreur?.code === "23505" || /duplicate key/i.test(m)) {
    if (/code_barres/.test(m)) return "Ce code-barres est déjà utilisé par un autre article.";
    return "Cette référence est déjà utilisée par un autre article.";
  }
  if (/stock ne se modifie pas/i.test(m)) return m;
  return "L'enregistrement a été refusé. Vérifiez la saisie.";
}

function champFautif(erreur: { message?: string } | null): string | undefined {
  const m = erreur?.message ?? "";
  if (/code_barres/.test(m)) return "code_barres";
  if (/reference/.test(m)) return "reference";
  return undefined;
}
