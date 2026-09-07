"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { dupliquerOptions } from "@/src/lib/personnalisation";
import {
  normaliserCouleur,
  cible,
  type Porteur,
  type TypeGroupe,
} from "@/src/lib/personnalisationLogique";
import { BUCKET_PHOTOS } from "@/src/lib/imageBoutique";

/**
 * Catalogue d'options d'un article personnalisable. Tout exige perm_boutique
 * (l'admin l'a d'office), et tout renvoie son refus plutôt que de le lancer :
 * une exception d'action serveur est masquée en production.
 */

export type Retour = { error?: string; message?: string; id?: string };

const TYPES: TypeGroupe[] = ["liste", "couleur", "texte", "booleen", "mesure"];

async function garde(): Promise<{ userId?: string; erreur?: string }> {
  const verif = await verifierPermission("perm_boutique");
  if (verif.error) return { erreur: verif.error };
  return { userId: verif.userId };
}

/**
 * Un catalogue d'options appartient à un article, ou à un modèle de la
 * bibliothèque. Les écrans sont les mêmes ; seul le porteur change.
 */
function rafraichir(porteur: Porteur) {
  const { article, modele } = cible(porteur);
  if (article) {
    revalidatePath(`/boutique/articles/${article}/options`);
    revalidatePath(`/boutique/articles/${article}`);
    return;
  }
  revalidatePath(`/boutique/modeles/${modele}`);
  revalidatePath("/boutique/modeles");
  // Les articles qui portent ce modèle en dépendent : leur page change aussi.
  revalidatePath("/boutique/articles", "layout");
}

/** Les colonnes qui désignent le propriétaire d'un groupe, pour un insert. */
function colonnesPorteur(porteur: Porteur): { article_id: string | null; modele_id: string | null } {
  const { article, modele } = cible(porteur);
  return { article_id: article, modele_id: modele };
}

/** Le filtre équivalent, pour une lecture. */
function filtrePorteur(porteur: Porteur): { colonne: "article_id" | "modele_id"; valeur: string } {
  const { article, modele } = cible(porteur);
  return article
    ? { colonne: "article_id", valeur: article }
    : { colonne: "modele_id", valeur: modele! };
}

const nombre = (v: unknown, defaut = 0): number => {
  const n = Number(String(v ?? "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : defaut;
};

// ── Groupes ─────────────────────────────────────────────────────────────────

export async function enregistrerGroupe(entree: {
  porteur: Porteur;
  id?: string | null;
  nom: string;
  type: TypeGroupe;
  obligatoire: boolean;
  aide?: string | null;
  max_caracteres?: number | null;
  // ── Groupe de type « mesure » ──
  unite?: string | null;
  valeur_min?: string | number | null;
  valeur_max?: string | number | null;
  pas?: string | number | null;
  alerte_min?: string | number | null;
  alerte_max?: string | number | null;
  seuil_supplement?: string | number | null;
  supplement_au_dela?: string | number | null;
}): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const nom = entree.nom.trim();
  if (!nom) return { error: "Donnez un nom au groupe d'options." };
  if (!TYPES.includes(entree.type)) return { error: "Choisissez le type d'options." };

  const mesure = entree.type === "mesure";
  const optionnel = (v: unknown): number | null => {
    const brut = String(v ?? "").replace(",", ".").trim();
    if (!brut) return null;
    const n = Number(brut);
    return Number.isFinite(n) ? n : null;
  };

  const min = mesure ? optionnel(entree.valeur_min) : null;
  const max = mesure ? optionnel(entree.valeur_max) : null;
  const alerteMin = mesure ? optionnel(entree.alerte_min) : null;
  const alerteMax = mesure ? optionnel(entree.alerte_max) : null;
  const seuil = mesure ? optionnel(entree.seuil_supplement) : null;
  const auDela = mesure ? optionnel(entree.supplement_au_dela) : null;

  if (mesure) {
    if (min !== null && min <= 0) return { error: "Le minimum accepté doit être un nombre positif." };
    if (min !== null && max !== null && min > max) {
      return { error: "Le minimum accepté doit rester en dessous du maximum." };
    }
    // Une alerte hors des bornes dures ne se déclencherait jamais : le refus
    // arriverait d'abord. Mieux vaut le dire que de laisser un réglage muet.
    if (alerteMin !== null && min !== null && alerteMin < min) {
      return { error: "Le seuil de confirmation bas doit rester au-dessus du minimum accepté, sinon il ne se déclenche jamais." };
    }
    if (alerteMax !== null && max !== null && alerteMax > max) {
      return { error: "Le seuil de confirmation haut doit rester en dessous du maximum accepté, sinon il ne se déclenche jamais." };
    }
    if (alerteMin !== null && alerteMax !== null && alerteMin > alerteMax) {
      return { error: "Les deux seuils de confirmation se croisent : tout déclencherait une question." };
    }
    if (auDela !== null && auDela < 0) return { error: "Le supplément ne peut pas être négatif." };
    if (auDela !== null && auDela > 0 && seuil === null) {
      return { error: "Indiquez à partir de quelle mesure ce supplément s'applique." };
    }
  }

  const champs = {
    nom,
    type: entree.type,
    obligatoire: entree.obligatoire,
    aide: entree.aide?.trim() || null,
    max_caracteres:
      entree.type === "texte" && Number(entree.max_caracteres ?? 0) > 0
        ? Math.round(Number(entree.max_caracteres))
        : null,
    // Changer un groupe de type efface les réglages de l'autre type : ils
    // n'auraient plus de sens, et un réglage invisible finit par surprendre.
    unite: mesure ? (String(entree.unite ?? "").trim() || "cm") : null,
    valeur_min: min,
    valeur_max: max,
    pas: mesure ? optionnel(entree.pas) : null,
    alerte_min: alerteMin,
    alerte_max: alerteMax,
    seuil_supplement: seuil,
    // La colonne ne veut pas de null : zéro, c'est « pas de supplément ».
    supplement_au_dela: auDela ?? 0,
  };

  if (entree.id) {
    const { error } = await supabaseAdmin.from("options_groupes").update(champs).eq("id", entree.id);
    if (error) return { error: "La modification a été refusée." };
    rafraichir(entree.porteur);
    return { message: "Groupe enregistré.", id: entree.id };
  }

  const f = filtrePorteur(entree.porteur);
  const { data: dernier } = await supabaseAdmin
    .from("options_groupes").select("ordre").eq(f.colonne, f.valeur)
    .order("ordre", { ascending: false }).limit(1).maybeSingle();

  const { data, error } = await supabaseAdmin
    .from("options_groupes")
    .insert({
      ...champs,
      ...colonnesPorteur(entree.porteur),
      ordre: Number(dernier?.ordre ?? 0) + 1,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "La création a été refusée." };

  rafraichir(entree.porteur);
  return { message: "Groupe créé.", id: data.id as string };
}

export async function supprimerGroupe(porteur: Porteur, groupeId: string): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const { error } = await supabaseAdmin.from("options_groupes").delete().eq("id", groupeId);
  if (error) {
    return {
      error: /citée par une commande/.test(error.message)
        ? "Une option de ce groupe est citée par une commande : désactivez-la plutôt."
        : "La suppression a été refusée.",
    };
  }
  rafraichir(porteur);
  return { message: "Groupe supprimé." };
}

/** Déplacement par deux boutons : le glisser seul ne suffit pas sur mobile. */
export async function deplacerGroupe(
  porteur: Porteur,
  groupeId: string,
  sens: "haut" | "bas"
): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const f = filtrePorteur(porteur);
  const { data: groupes } = await supabaseAdmin
    .from("options_groupes").select("id, ordre").eq(f.colonne, f.valeur).order("ordre");

  const res = echanger(groupes ?? [], groupeId, sens);
  if (!res) return { message: "Déjà à sa place." };

  return ordonnerGroupes(porteur, res.map((l) => l.id));
}

/** Réordonnancement par glisser : la liste complète, dans son nouvel ordre. */
export async function ordonnerGroupes(porteur: Porteur, ids: string[]): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  // Tout part ensemble : un groupe qui dépend d'un autre ne doit jamais se
  // retrouver, même un instant, placé avant lui.
  const { article, modele } = cible(porteur);
  const { error } = article
    ? await supabaseAdmin.rpc("ordonner_groupes_options", { p_article_id: article, p_ids: ids })
    : await supabaseAdmin.rpc("ordonner_groupes_modele", { p_modele_id: modele!, p_ids: ids });
  if (error) return { error: messageOrdre(error.message) };

  rafraichir(porteur);
  return { message: "Ordre enregistré." };
}

/** Le refus du trigger est déjà écrit en français : on le laisse passer. */
function messageOrdre(message: string): string {
  const m = message ?? "";
  if (/dépend de|dépendraient|même article|lui-même/.test(m)) return m;
  return "Cet ordre n'est pas possible : un groupe doit rester après celui dont il dépend.";
}

// ── Valeurs ─────────────────────────────────────────────────────────────────

export async function enregistrerValeur(entree: {
  porteur: Porteur;
  groupe_id: string;
  id?: string | null;
  libelle: string;
  code_couleur?: string | null;
  supplement_prix?: string | number | null;
  supplement_delai_jours?: string | number | null;
  composant_article_id?: string | null;
  composant_quantite?: string | number | null;
  defaut?: boolean;
}): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const libelle = entree.libelle.trim();
  if (!libelle) return { error: "Donnez un nom à l'option — une couleur sans nom ne se cite pas au téléphone." };

  const supplement = nombre(entree.supplement_prix, 0);
  if (supplement < 0) return { error: "Le supplément de prix ne peut pas être négatif." };
  const delai = Math.round(nombre(entree.supplement_delai_jours, 0));
  if (delai < 0) return { error: "Le supplément de délai ne peut pas être négatif." };

  const composant = entree.composant_article_id || null;
  const quantite = composant ? nombre(entree.composant_quantite, 0) : 0;
  if (composant && quantite <= 0) {
    return { error: "Indiquez la quantité de fourniture consommée par ce choix." };
  }

  const champs = {
    libelle,
    code_couleur: normaliserCouleur(entree.code_couleur),
    supplement_prix: supplement,
    supplement_delai_jours: delai,
    composant_article_id: composant,
    composant_quantite: composant ? quantite : null,
    defaut: entree.defaut === true,
  };

  // Une seule valeur par défaut par groupe : la dernière posée l'emporte.
  if (champs.defaut) {
    await supabaseAdmin
      .from("options_valeurs").update({ defaut: false }).eq("groupe_id", entree.groupe_id);
  }

  if (entree.id) {
    const { error } = await supabaseAdmin.from("options_valeurs").update(champs).eq("id", entree.id);
    if (error) return { error: "La modification a été refusée." };
    rafraichir(entree.porteur);
    return { message: "Option enregistrée.", id: entree.id };
  }

  const { data: dernier } = await supabaseAdmin
    .from("options_valeurs").select("ordre").eq("groupe_id", entree.groupe_id)
    .order("ordre", { ascending: false }).limit(1).maybeSingle();

  const { data, error } = await supabaseAdmin
    .from("options_valeurs")
    .insert({ ...champs, groupe_id: entree.groupe_id, ordre: Number(dernier?.ordre ?? 0) + 1 })
    .select("id")
    .single();
  if (error || !data) return { error: "La création a été refusée." };

  rafraichir(entree.porteur);
  return { message: "Option ajoutée.", id: data.id as string };
}

export async function basculerValeur(
  porteur: Porteur,
  valeurId: string,
  actif: boolean
): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const { error } = await supabaseAdmin.from("options_valeurs").update({ actif }).eq("id", valeurId);
  if (error) return { error: "La modification a été refusée." };
  rafraichir(porteur);
  return { message: actif ? "Option remise en service." : "Option désactivée." };
}

export async function supprimerValeur(porteur: Porteur, valeurId: string): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const { data: valeur } = await supabaseAdmin
    .from("options_valeurs").select("image_path").eq("id", valeurId).maybeSingle();

  const { error } = await supabaseAdmin.from("options_valeurs").delete().eq("id", valeurId);
  if (error) {
    return {
      error: /citée par une commande/.test(error.message)
        ? "Cette option est citée par une commande : désactivez-la, elle ne se supprime pas."
        : "La suppression a été refusée.",
    };
  }

  const image = valeur?.image_path as string | null;
  if (image) await supabaseAdmin.storage.from(BUCKET_PHOTOS).remove([image]);

  rafraichir(porteur);
  return { message: "Option supprimée." };
}

export async function deplacerValeur(
  porteur: Porteur,
  groupeId: string,
  valeurId: string,
  sens: "haut" | "bas"
): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const { data: valeurs } = await supabaseAdmin
    .from("options_valeurs").select("id, ordre").eq("groupe_id", groupeId).order("ordre");

  const res = echanger(valeurs ?? [], valeurId, sens);
  if (!res) return { message: "Déjà à sa place." };

  for (const { id, ordre } of res) {
    await supabaseAdmin.from("options_valeurs").update({ ordre }).eq("id", id);
  }
  rafraichir(porteur);
  return { message: "Ordre modifié." };
}

export async function ordonnerValeurs(porteur: Porteur, ids: string[]): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  for (let i = 0; i < ids.length; i++) {
    await supabaseAdmin.from("options_valeurs").update({ ordre: i + 1 }).eq("id", ids[i]);
  }
  rafraichir(porteur);
  return { message: "Ordre enregistré." };
}

// ── Duplication ─────────────────────────────────────────────────────────────

/** Les mêmes vingt couleurs sur le collier, la laisse et le harnais. */
export async function dupliquerDepuis(cibleId: Porteur, sourceId: Porteur | ""): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };
  if (!sourceId) return { error: "Choisissez la source dont copier les options." };

  const res = await dupliquerOptions(cible(sourceId), cible(cibleId));
  if (res.error) return { error: res.error };

  rafraichir(cibleId);
  return {
    message: `${res.groupes} groupe${(res.groupes ?? 0) > 1 ? "s" : ""} et ${res.valeurs} option${(res.valeurs ?? 0) > 1 ? "s" : ""} copiés. Ils sont maintenant indépendants.`,
  };
}

// ── Petit outil d'ordre ─────────────────────────────────────────────────────

/** Échange deux voisins. Renvoie les deux lignes à réécrire, ou null. */
function echanger(
  liste: { id: string; ordre: number }[],
  id: string,
  sens: "haut" | "bas"
): { id: string; ordre: number }[] | null {
  const i = liste.findIndex((l) => l.id === id);
  if (i === -1) return null;
  const j = sens === "haut" ? i - 1 : i + 1;
  if (j < 0 || j >= liste.length) return null;

  // Les ordres peuvent être égaux ou en trous : on renumérote proprement.
  const nouvelOrdre = [...liste];
  [nouvelOrdre[i], nouvelOrdre[j]] = [nouvelOrdre[j], nouvelOrdre[i]];
  return nouvelOrdre.map((l, k) => ({ id: l.id, ordre: k + 1 }));
}

// ── Dépendances entre options ───────────────────────────────────────────────

/** Les valeurs d'un groupe, dans l'ordre. */
async function valeursDe(groupeId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("options_valeurs").select("id").eq("groupe_id", groupeId).order("ordre");
  return (data ?? []).map((v) => v.id as string);
}

/**
 * Déclare de quel groupe celui-ci dépend.
 *
 * À la déclaration, TOUT est coché : un article existant ne change pas de
 * comportement, et Sabrina décoche ensuite les quelques cases qui font
 * exception. À la suppression du parent, les dépendances tombent avec lui —
 * le groupe redevient libre.
 */
export async function definirParentGroupe(
  porteur: Porteur,
  groupeId: string,
  parentId: string | null
): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const valeurs = await valeursDe(groupeId);

  if (!parentId) {
    if (valeurs.length > 0) {
      await supabaseAdmin.from("options_dependances").delete().in("valeur_id", valeurs);
    }
    const { error } = await supabaseAdmin
      .from("options_groupes").update({ depend_de_groupe_id: null }).eq("id", groupeId);
    if (error) return { error: messageOrdre(error.message) };

    rafraichir(porteur);
    return { message: "Ce groupe ne dépend plus d'aucun autre." };
  }

  const { error } = await supabaseAdmin
    .from("options_groupes").update({ depend_de_groupe_id: parentId }).eq("id", groupeId);
  if (error) return { error: messageOrdre(error.message) };

  // Tout coché par défaut : le comportement d'avant, à la lettre.
  const requises = await valeursDe(parentId);
  if (valeurs.length > 0 && requises.length > 0) {
    const lignes = valeurs.flatMap((v) =>
      requises.map((r) => ({ valeur_id: v, valeur_requise_id: r }))
    );
    const { error: erreurLignes } = await supabaseAdmin
      .from("options_dependances").upsert(lignes, { onConflict: "valeur_id,valeur_requise_id" });
    if (erreurLignes) return { error: "Les dépendances n'ont pas pu être posées." };
  }

  rafraichir(porteur);
  return { message: "Dépendance déclarée. Tout est disponible : décochez les exceptions." };
}

/** Une case de la matrice. */
export async function basculerDependance(
  porteur: Porteur,
  valeurId: string,
  valeurRequiseId: string,
  coche: boolean
): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  if (coche) {
    const { error } = await supabaseAdmin
      .from("options_dependances")
      .upsert(
        [{ valeur_id: valeurId, valeur_requise_id: valeurRequiseId }],
        { onConflict: "valeur_id,valeur_requise_id" }
      );
    if (error) return { error: messageDependance(error.message) };
  } else {
    const { error } = await supabaseAdmin
      .from("options_dependances")
      .delete()
      .eq("valeur_id", valeurId)
      .eq("valeur_requise_id", valeurRequiseId);
    if (error) return { error: "La modification a été refusée." };
  }

  rafraichir(porteur);
  return {};
}

/**
 * Tout cocher ou tout décocher, par ligne ou par colonne. Avec vingt coloris
 * et trois largeurs, case à case serait insupportable.
 */
export async function basculerLot(entree: {
  porteur: Porteur;
  valeurs: string[];
  requises: string[];
  coche: boolean;
}): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  if (entree.valeurs.length === 0 || entree.requises.length === 0) return {};

  if (entree.coche) {
    const lignes = entree.valeurs.flatMap((v) =>
      entree.requises.map((r) => ({ valeur_id: v, valeur_requise_id: r }))
    );
    const { error } = await supabaseAdmin
      .from("options_dependances").upsert(lignes, { onConflict: "valeur_id,valeur_requise_id" });
    if (error) return { error: messageDependance(error.message) };
  } else {
    const { error } = await supabaseAdmin
      .from("options_dependances")
      .delete()
      .in("valeur_id", entree.valeurs)
      .in("valeur_requise_id", entree.requises);
    if (error) return { error: "La modification a été refusée." };
  }

  rafraichir(entree.porteur);
  return { message: entree.coche ? "Tout coché." : "Tout décoché." };
}

function messageDependance(message: string): string {
  const m = message ?? "";
  if (/même article|même groupe|posée avant elle|introuvable/.test(m)) return m;
  return "Cette dépendance a été refusée.";
}

// ── Prix par combinaison ────────────────────────────────────────────────────

/**
 * Le supplément propre à une combinaison : « l'ocre en 25 mm coûte 5 ».
 *
 * Vide veut dire « rien de particulier » : on retombe alors sur le supplément
 * habituel du coloris. Un 0 saisi, lui, est une valeur — c'est la façon de
 * dire « celui-là ne coûte rien dans cette largeur ». Les deux ne s'ajoutent
 * jamais : la combinaison, quand elle parle, a le dernier mot.
 */
export async function definirSupplementCombinaison(
  porteur: Porteur,
  valeurId: string,
  valeurRequiseId: string,
  prix: string | null
): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const brut = String(prix ?? "").replace(",", ".").trim();
  let montant: number | null = null;
  if (brut) {
    const n = Number(brut);
    if (!Number.isFinite(n)) return { error: "Le prix doit être un nombre." };
    if (n < 0) return { error: "Un supplément ne peut pas être négatif." };
    montant = Math.round(n * 100) / 100;
  }

  const { error } = await supabaseAdmin
    .from("options_dependances")
    .update({ supplement_prix: montant })
    .eq("valeur_id", valeurId)
    .eq("valeur_requise_id", valeurRequiseId);
  if (error) return { error: "L'enregistrement du prix a été refusé." };

  rafraichir(porteur);
  return { message: montant === null ? "Prix remis au supplément habituel." : "Prix enregistré." };
}

/** Le même prix sur toutes les options cochées d'une même colonne. */
export async function appliquerPrixLot(entree: {
  porteur: Porteur;
  valeurs: string[];
  requise: string;
  prix: string | null;
}): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };
  if (entree.valeurs.length === 0) return { error: "Aucune option cochée dans cette colonne." };

  const brut = String(entree.prix ?? "").replace(",", ".").trim();
  let montant: number | null = null;
  if (brut) {
    const n = Number(brut);
    if (!Number.isFinite(n)) return { error: "Le prix doit être un nombre." };
    if (n < 0) return { error: "Un supplément ne peut pas être négatif." };
    montant = Math.round(n * 100) / 100;
  }

  const { error } = await supabaseAdmin
    .from("options_dependances")
    .update({ supplement_prix: montant })
    .in("valeur_id", entree.valeurs)
    .eq("valeur_requise_id", entree.requise);
  if (error) return { error: "L'enregistrement a été refusé." };

  rafraichir(entree.porteur);
  return {
    message: `${entree.valeurs.length} option${entree.valeurs.length > 1 ? "s" : ""} mise${entree.valeurs.length > 1 ? "s" : ""} à jour.`,
  };
}

/**
 * Reprendre une colonne entière : les mêmes options disponibles, aux mêmes
 * prix. Trois largeurs à vingt coloris, c'est soixante cases — on les copie.
 */
export async function copierDisponibilites(entree: {
  porteur: Porteur;
  source: string;
  cible: string;
  /** Les options du groupe en cours : une autre question qui dépend de la
   * même largeur garde les siennes, la copie ne déborde pas. */
  valeurs: string[];
}): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };
  const { porteur, source: sourceRequiseId, cible: cibleRequiseId, valeurs } = entree;
  if (!sourceRequiseId) return { error: "Choisissez la colonne à copier." };
  if (sourceRequiseId === cibleRequiseId) return { error: "C'est déjà cette colonne." };
  if (valeurs.length === 0) return { error: "Ce groupe n'a aucune option à copier." };

  const { data: source } = await supabaseAdmin
    .from("options_dependances")
    .select("valeur_id, supplement_prix")
    .eq("valeur_requise_id", sourceRequiseId)
    .in("valeur_id", valeurs);

  const lignes = (source ?? []) as unknown as { valeur_id: string; supplement_prix: number | null }[];

  // La colonne cible est refaite à l'identique : ce qui n'est pas dans la
  // source disparaît, sinon « copier » laisserait des restes invisibles.
  const { error: erreurVide } = await supabaseAdmin
    .from("options_dependances").delete()
    .eq("valeur_requise_id", cibleRequiseId).in("valeur_id", valeurs);
  if (erreurVide) return { error: "La copie a été refusée." };

  if (lignes.length > 0) {
    const { error } = await supabaseAdmin.from("options_dependances").insert(
      lignes.map((l) => ({
        valeur_id: l.valeur_id,
        valeur_requise_id: cibleRequiseId,
        supplement_prix: l.supplement_prix,
      }))
    );
    if (error) return { error: messageDependance(error.message) };
  }

  rafraichir(porteur);
  return {
    message: `${lignes.length} disponibilité${lignes.length > 1 ? "s" : ""} copiée${lignes.length > 1 ? "s" : ""}, prix compris.`,
  };
}
