"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
import {
  blocsArticle,
  dupliquerOptions,
  lireGroupes,
  lireGroupesModele,
  modelesDArticle,
  articlesDuModele,
  optionsCitees,
} from "@/src/lib/personnalisation";
import { refusOrdreGroupes, resoudreGroupes } from "@/src/lib/personnalisationLogique";

/**
 * Bibliothèque de modèles d'options.
 *
 * Un modèle est un catalogue d'options qui vit pour lui-même : les articles
 * s'y ATTACHENT, ils n'en reçoivent pas une copie. Corriger un prix dans le
 * modèle le corrige partout où il est attaché — c'est tout l'intérêt, et c'est
 * aussi ce qui oblige à prévenir avant de retirer une valeur.
 *
 * Rien de tout cela ne touche aux commandes déjà passées : leurs choix sont
 * figés ligne à ligne dans commandes_choix, et le restent.
 */

export type Retour = { error?: string; message?: string; id?: string };

async function garde(): Promise<{ userId?: string; erreur?: string }> {
  const verif = await verifierPermission("perm_boutique");
  if (verif.error) return { erreur: verif.error };
  return { userId: verif.userId };
}

function rafraichirModeles(id?: string) {
  revalidatePath("/boutique/modeles");
  if (id) revalidatePath(`/boutique/modeles/${id}`);
}

// ── Le modèle lui-même ──────────────────────────────────────────────────────

export async function enregistrerModele(entree: {
  id?: string | null;
  nom: string;
  description?: string | null;
}): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const nom = entree.nom.trim();
  if (!nom) return { error: "Donnez un nom au modèle — « Sangle biothane », « Gravure médaillon »." };

  const champs = { nom, description: entree.description?.trim() || null };

  if (entree.id) {
    const { error } = await supabaseAdmin.from("modeles_options").update(champs).eq("id", entree.id);
    if (error) return { error: messageModele(error.message) };
    rafraichirModeles(entree.id);
    return { message: "Modèle enregistré.", id: entree.id };
  }

  const { data, error } = await supabaseAdmin
    .from("modeles_options").insert(champs).select("id").single();
  if (error || !data) return { error: messageModele(error?.message ?? "") };

  rafraichirModeles(data.id as string);
  return { message: "Modèle créé. Ajoutez-lui ses groupes d'options.", id: data.id as string };
}

function messageModele(message: string): string {
  if (/duplicate key|unique/i.test(message)) {
    return "Un modèle porte déjà ce nom. Deux modèles homonymes seraient impossibles à distinguer dans la liste.";
  }
  return "L'enregistrement a été refusé.";
}

/**
 * Un modèle ne se supprime pas tant qu'un article s'en sert : ce serait retirer
 * des questions sous les pieds d'articles en vente. On le désactive — il
 * disparaît des propositions, et continue de servir là où il est attaché.
 */
export async function basculerModele(id: string, actif: boolean): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const { error } = await supabaseAdmin.from("modeles_options").update({ actif }).eq("id", id);
  if (error) return { error: "La modification a été refusée." };

  rafraichirModeles(id);
  return {
    message: actif
      ? "Modèle remis en service."
      : "Modèle désactivé : il ne sera plus proposé, et reste en place là où il est déjà attaché.",
  };
}

export async function supprimerModele(id: string): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const articles = await articlesDuModele(id);
  if (articles.length > 0) {
    const noms = articles.slice(0, 3).map((a) => a.nom).join(", ");
    const reste = articles.length > 3 ? ` et ${articles.length - 3} autre${articles.length - 3 > 1 ? "s" : ""}` : "";
    return {
      error: `Ce modèle est attaché à ${articles.length} article${articles.length > 1 ? "s" : ""} (${noms}${reste}). Détachez-le d'abord, ou désactivez-le.`,
    };
  }

  const { error } = await supabaseAdmin.from("modeles_options").delete().eq("id", id);
  if (error) {
    return {
      error: /citée par une commande/.test(error.message)
        ? "Une option de ce modèle est citée par une commande : désactivez-le plutôt."
        : "La suppression a été refusée.",
    };
  }

  rafraichirModeles();
  return { message: "Modèle supprimé." };
}

/** Repartir d'un modèle existant plutôt que de tout ressaisir. */
export async function dupliquerModele(id: string, nom: string): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const cree = await enregistrerModele({ nom });
  if (cree.error || !cree.id) return cree;

  const res = await dupliquerOptions({ modele: id }, { modele: cree.id });
  if (res.error) return { error: res.error };

  rafraichirModeles(cree.id);
  return {
    message: `Modèle dupliqué : ${res.groupes} groupe${(res.groupes ?? 0) > 1 ? "s" : ""} et ${res.valeurs} option${(res.valeurs ?? 0) > 1 ? "s" : ""} copiés.`,
    id: cree.id,
  };
}

// ── Attacher un modèle à un article ─────────────────────────────────────────

function rafraichirArticle(articleId: string) {
  revalidatePath(`/boutique/articles/${articleId}/options`);
  revalidatePath(`/boutique/articles/${articleId}`);
  revalidatePath(`/boutique/caisse/sur-mesure/${articleId}`);
  revalidatePath(`/mon-compte/boutique/${articleId}`);
}

/**
 * Attache un modèle en dernière position, puis vérifie que le plan obtenu
 * tient debout. Un modèle qui casserait l'ordre des dépendances est refusé
 * AVANT d'être posé : mieux vaut un refus clair qu'un article incohérent.
 */
export async function attacherModele(articleId: string, modeleId: string): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };
  if (!modeleId) return { error: "Choisissez le modèle à attacher." };

  const dejaLa = await modelesDArticle(articleId);
  if (dejaLa.some((m) => m.id === modeleId)) {
    return { error: "Ce modèle est déjà attaché à cet article." };
  }

  const groupes = await lireGroupesModele(modeleId);
  if (groupes.length === 0) {
    return { error: "Ce modèle n'a aucun groupe d'options : il n'apporterait rien." };
  }

  // On simule le plan avant d'écrire.
  const blocs = await blocsArticle(articleId);
  const ordreVoulu = dejaLa.reduce((max, m) => Math.max(max, m.ordre), 0) + 1;
  const propres = blocs.find((b) => b.source === "Cet article");
  const simule = [
    ...blocs.filter((b) => b.source !== "Cet article"),
    { source: "Modèle", ordre: ordreVoulu, groupes },
    ...(propres ? [{ ...propres, ordre: ordreVoulu + 1 }] : []),
  ];
  const refus = refusOrdreGroupes(resoudreGroupes(simule).groupes);
  if (refus) {
    return { error: `Ce modèle ne peut pas être attaché ici : ${refus}` };
  }

  const { error } = await supabaseAdmin
    .from("article_modeles")
    .insert({ article_id: articleId, modele_id: modeleId, ordre: ordreVoulu });
  if (error) return { error: "L'attachement a été refusé." };

  rafraichirArticle(articleId);
  rafraichirModeles(modeleId);
  return { message: "Modèle attaché. Ses questions s'ajoutent à celles de l'article." };
}

/**
 * Détacher : les questions du modèle disparaissent de l'article. Les commandes
 * déjà passées gardent leurs choix figés — elles ne bougent pas d'un iota.
 */
export async function detacherModele(articleId: string, modeleId: string): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  // Un groupe propre qui dépendait d'un groupe du modèle resterait orphelin :
  // on refait le plan SANS ce modèle, et on regarde s'il tient encore debout.
  const modeles = (await modelesDArticle(articleId)).filter((m) => m.id !== modeleId);
  const propres = await lireGroupes(articleId);
  const restants = [
    ...(await Promise.all(
      modeles.map(async (m, k) => ({
        source: m.nom,
        ordre: k + 1,
        groupes: await lireGroupesModele(m.id),
      }))
    )),
    ...(propres.length > 0
      ? [{ source: "Cet article", ordre: modeles.length + 1, groupes: propres }]
      : []),
  ];
  const orphelin = refusOrdreGroupes(resoudreGroupes(restants).groupes);
  if (orphelin) {
    return {
      error: `Ce modèle ne peut pas être détaché : ${orphelin} Retirez d'abord cette dépendance.`,
    };
  }

  const { error } = await supabaseAdmin
    .from("article_modeles").delete().eq("article_id", articleId).eq("modele_id", modeleId);
  // Le refus du trigger est déjà écrit en français : on le laisse passer.
  if (error) {
    return {
      error: /dépend d.une question de ce modèle/.test(error.message)
        ? error.message
        : "Le détachement a été refusé.",
    };
  }

  rafraichirArticle(articleId);
  rafraichirModeles(modeleId);
  return { message: "Modèle détaché. Les commandes déjà passées gardent leurs choix." };
}

/** Monter ou descendre un modèle : c'est l'ordre des questions au comptoir. */
export async function deplacerModele(
  articleId: string,
  modeleId: string,
  sens: "haut" | "bas"
): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const modeles = await modelesDArticle(articleId);
  const i = modeles.findIndex((m) => m.id === modeleId);
  const j = sens === "haut" ? i - 1 : i + 1;
  if (i === -1 || j < 0 || j >= modeles.length) return { message: "Déjà à sa place." };

  const ordonne = [...modeles];
  [ordonne[i], ordonne[j]] = [ordonne[j], ordonne[i]];

  // L'ordre décide de quel groupe fusionné garde sa place : on vérifie d'abord.
  const propres = await lireGroupes(articleId);
  const blocs = [
    ...(await Promise.all(
      ordonne.map(async (m, k) => ({
        source: m.nom,
        ordre: k + 1,
        groupes: await lireGroupesModele(m.id),
      }))
    )),
    ...(propres.length > 0
      ? [{ source: "Cet article", ordre: ordonne.length + 1, groupes: propres }]
      : []),
  ];
  const refus = refusOrdreGroupes(resoudreGroupes(blocs).groupes);
  if (refus) return { error: `Cet ordre n'est pas possible : ${refus}` };

  for (let k = 0; k < ordonne.length; k++) {
    await supabaseAdmin
      .from("article_modeles").update({ ordre: k + 1 })
      .eq("article_id", articleId).eq("modele_id", ordonne[k].id);
  }

  rafraichirArticle(articleId);
  return { message: "Ordre des modèles enregistré." };
}

/**
 * « Transformer ces groupes en modèle » : ce que Sabrina a déjà réglé sur un
 * article devient réutilisable. Les groupes propres sont COPIÉS dans un modèle
 * neuf, puis l'article est attaché à ce modèle et ses copies d'origine sont
 * retirées — sinon chaque question serait posée deux fois.
 */
export async function transformerEnModele(articleId: string, nom: string): Promise<Retour> {
  const g = await garde();
  if (g.erreur) return { error: g.erreur };

  const propres = await lireGroupes(articleId);
  if (propres.length === 0) {
    return { error: "Cet article n'a aucun groupe propre à transformer." };
  }

  // Une option citée par une commande ne se supprimera pas : mieux vaut le
  // dire tout de suite que de laisser un modèle créé à moitié.
  const citees = await optionsCitees(articleId);
  if (citees.length > 0) {
    return {
      error:
        "Des options de cet article sont citées par des commandes (" +
        citees.slice(0, 3).join(", ") +
        (citees.length > 3 ? ", …" : "") +
        "). Elles ne peuvent pas être retirées de l'article : dupliquez plutôt ces options " +
        "vers un modèle neuf depuis l'écran des modèles.",
    };
  }

  const cree = await enregistrerModele({ nom });
  if (cree.error || !cree.id) return cree;

  const res = await dupliquerOptions({ article: articleId }, { modele: cree.id });
  if (res.error) return { error: res.error };

  const attache = await attacherModele(articleId, cree.id);
  if (attache.error) return { error: attache.error };

  // Les originaux partent : le modèle les porte désormais. Une valeur citée par
  // une commande bloquerait la suppression — on le dit plutôt que de la forcer.
  const { error } = await supabaseAdmin
    .from("options_groupes").delete().eq("article_id", articleId);
  if (error) {
    return {
      error:
        "Le modèle a été créé et attaché, mais les groupes d'origine n'ont pas pu être retirés " +
        "(une option est citée par une commande). Retirez-les un par un, ou détachez le modèle.",
    };
  }

  rafraichirArticle(articleId);
  rafraichirModeles(cree.id);
  return {
    message: `« ${nom} » est maintenant un modèle, attaché à cet article. Vous pouvez l'attacher ailleurs.`,
    id: cree.id,
  };
}
