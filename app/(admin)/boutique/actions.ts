"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermissionStock } from "@/src/lib/permissions";
import {
  perimetreDeArticle,
  perimetreDuCompte,
  PERIMETRES,
  type PerimetreStock,
} from "@/src/lib/perimetreStock";
import { aujourdhuiISO } from "@/src/lib/dates";
import { secteurValide } from "@/src/lib/tvaLogique";
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
 * Actions de stock — magasin et atelier. Le stock n'est jamais écrit ici : on
 * passe un mouvement, et c'est le trigger SQL qui tient le compte.
 *
 * La permission dépend du PÉRIMÈTRE DE LA DONNÉE, pas de l'écran d'où part la
 * requête : « Boutique — gestion » pour un article revendu, « Atelier » pour
 * une fourniture de fabrication. Le périmètre est relu en base à chaque fois —
 * un champ caché de formulaire ne décide jamais d'un droit.
 *
 * Un refus est RETOURNÉ, jamais lancé : une exception d'action serveur est
 * masquée en production, et l'utilisateur ne verrait rien.
 */

export type EtatBoutique = EtatFormulaire & { message?: string | null };

const TYPES_MANUELS: TypeMouvement[] = ["entree", "perte", "usage_interne", "retour", "ajustement"];

async function garde(
  perimetre: PerimetreStock
): Promise<{ userId?: string; erreur?: string }> {
  const verif = await verifierPermissionStock(perimetre, "gestion");
  if (verif.error) return { erreur: verif.error };
  return { userId: verif.userId };
}

/**
 * La garde de plusieurs articles d'un coup — l'inventaire, qui peut porter sur
 * un seul périmètre à la fois mais dont on ne croit pas la liste sur parole.
 * Il faut avoir droit à TOUS les périmètres touchés.
 */
async function gardeArticles(
  ids: string[]
): Promise<{ userId?: string; erreur?: string; perimetres: PerimetreStock[] }> {
  const { data } = await supabaseAdmin
    .from("articles")
    .select("id, composant")
    .in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const perimetres = [...new Set(
    ((data ?? []) as { composant: boolean | null }[]).map(perimetreDeArticle)
  )];

  let userId: string | undefined;
  for (const p of perimetres) {
    const g = await garde(p);
    if (g.erreur) return { erreur: g.erreur, perimetres };
    userId = g.userId;
  }
  return { userId, perimetres };
}

/** Rafraîchit les écrans du périmètre touché, et l'accueil qui en montre les chiffres. */
function revalider(perimetre: PerimetreStock, ...autres: string[]) {
  const config = PERIMETRES[perimetre];
  for (const chemin of [config.liste, config.accueil, "/", ...autres]) {
    revalidatePath(chemin);
  }
}

/** Création et modification d'un article : une seule action, un seul chemin. */
export async function enregistrerArticle(
  articleId: string | null,
  _etat: EtatBoutique,
  formData: FormData
): Promise<EtatBoutique> {
  const valeurs = valeursFormulaire(formData);

  // Le périmètre VOULU (la case cochée) et, sur une modification, le périmètre
  // ACTUEL : il faut avoir droit aux deux. Sans quoi on pourrait sortir une
  // fourniture de l'atelier sans y avoir accès, ou y faire entrer un article.
  const voulu: PerimetreStock = formData.get("composant") === "on" ? "atelier" : "boutique";
  const existant = articleId ? await lireArticle(articleId) : null;
  if (articleId && !existant) return { erreur: "Article introuvable.", valeurs };

  for (const p of new Set(existant ? [voulu, perimetreDeArticle(existant)] : [voulu])) {
    const g = await garde(p);
    if (g.erreur) return { erreur: g.erreur, valeurs };
  }

  const nom = String(formData.get("nom") ?? "").trim();
  const categorie = String(formData.get("categorie") ?? "").trim();
  const taux_tva = lireNombre(formData.get("taux_tva")) ?? tauxPropose(categorie);
  // Le secteur ne sert qu'au décompte TVA, jamais à la facture. Par défaut
  // le commerce : la pension ne se vend pas au comptoir.
  const secteur_tdfn = secteurValide(formData.get("secteur_tdfn")) ?? "commerce";
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
    secteur_tdfn,
    prix_vente,
    prix_achat,
    stock_alerte: stock_alerte ?? 0,
    unite: String(formData.get("unite") ?? "").trim() || "pièce",
    code_barres: normaliserCodeBarres(formData.get("code_barres") as string),
    actif: formData.get("actif") === "on",
    vendable_en_ligne: formData.get("vendable_en_ligne") === "on",
    // Un article sur mesure ne suit pas de stock de produit fini : ce sont
    // ses fournitures qui se décomptent, à la fabrication.
    type_article: formData.get("type_article") === "personnalisable" ? "personnalisable" : "standard",
    delai_fabrication_jours:
      formData.get("type_article") === "personnalisable"
        ? Math.max(Math.round(lireNombre(formData.get("delai_fabrication_jours")) ?? 0), 0)
        : null,
    // Une fourniture se stocke mais ne se vend pas seule : ni caisse, ni vitrine.
    composant: formData.get("composant") === "on",
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

    // Les deux périmètres se rafraîchissent : un article qui change de camp
    // disparaît d'une liste et apparaît dans l'autre.
    revalider(voulu, `/boutique/articles/${articleId}`);
    if (existant) revalider(perimetreDeArticle(existant));
    redirect(`/boutique/articles/${articleId}`);
  }

  const { data, error } = await supabaseAdmin
    .from("articles")
    .insert(champs)
    .select("id")
    .single();
  if (error) return { erreur: messageBase(error), champ: champFautif(error), valeurs };

  revalider(voulu);
  redirect(`/boutique/articles/${data.id as string}`);
}

/** Entrée manuelle, perte, usage interne, retour — et l'ajustement d'inventaire. */
export async function passerMouvement(
  articleId: string,
  _etat: EtatBoutique,
  formData: FormData
): Promise<EtatBoutique> {
  const valeurs = valeursFormulaire(formData);

  const article = await lireArticle(articleId);
  if (!article) return { erreur: "Article introuvable.", valeurs };

  // C'est l'article qui dit quelle permission il faut, pas l'écran.
  const perimetre = perimetreDeArticle(article);
  const g = await garde(perimetre);
  if (g.erreur) return { erreur: g.erreur, valeurs };

  const type = String(formData.get("type") ?? "") as TypeMouvement;
  if (!TYPES_MANUELS.includes(type)) {
    return { erreur: "Choisissez le type de mouvement.", champ: "type", valeurs };
  }

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

  revalider(perimetre, `/boutique/articles/${articleId}`, "/atelier/entrees");
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

  // Le périmètre se relit sur les articles comptés : le formulaire ne décide
  // pas de la permission qu'il faut pour être validé.
  const g = await gardeArticles(
    lignes.filter((l) => l.stock_compte !== null).map((l) => l.article_id)
  );
  if (g.erreur) return { erreur: g.erreur };

  const res = await validerInventaire(lignes, date, g.userId ?? null);
  if (res.erreurs.length > 0) return { erreur: res.erreurs[0] };

  for (const p of g.perimetres) revalider(p, PERIMETRES[p].inventaire);
  return {
    erreur: null,
    message:
      res.ajustements === 0
        ? "Inventaire validé : aucun écart, le stock était juste."
        : `Inventaire validé : ${res.ajustements} ajustement${res.ajustements > 1 ? "s" : ""} enregistré${res.ajustements > 1 ? "s" : ""}.`,
  };
}

/**
 * Entrées en stock rattachées à une dépense déjà validée.
 *
 * C'est la CATÉGORIE DE LA DÉPENSE qui décide de la permission : « Matières de
 * fabrication » (4000) demande l'atelier, « Marchandises à revendre » (4200) la
 * gestion boutique. On relit la dépense plutôt que de croire l'écran.
 *
 * Et parce qu'une même facture peut porter les deux, la garde des articles
 * cochés s'ajoute à celle de la catégorie.
 */
export async function entrerStock(
  depenseId: string,
  _etat: EtatBoutique,
  formData: FormData
): Promise<EtatBoutique> {
  const { data: depense } = await supabaseAdmin
    .from("depenses").select("compte_charge").eq("id", depenseId).maybeSingle();

  const perimetreDepense = perimetreDuCompte(depense?.compte_charge as string | undefined);
  if (!perimetreDepense) {
    return { erreur: "Cette catégorie de dépense n'ouvre pas d'entrée en stock." };
  }
  const gDepense = await garde(perimetreDepense);
  if (gDepense.erreur) return { erreur: gDepense.erreur };

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

  const g = await gardeArticles(lignes.map((l) => l.article_id));
  if (g.erreur) return { erreur: g.erreur };

  const res = await entrerStockDepuisDepense(depenseId, lignes, g.userId ?? null);
  if (res.erreurs.length > 0) return { erreur: res.erreurs[0] };

  for (const p of new Set([perimetreDepense, ...g.perimetres])) {
    revalider(p, `/comptabilite/depenses/${depenseId}`, "/atelier/entrees");
  }
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
