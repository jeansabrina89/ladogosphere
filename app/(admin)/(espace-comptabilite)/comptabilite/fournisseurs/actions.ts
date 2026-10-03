"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { COMPTES_DEPENSE } from "@/src/lib/depensesLogique";
import { domainesValides, MESSAGE_DOMAINE_REQUIS } from "@/src/lib/domainesFournisseurs";
import { tracerEvenement } from "@/src/lib/journalEvenements";

/** Carnet de fournisseurs. Un fournisseur ne se supprime pas : il se désactive. */

export type EtatFournisseur = { erreur: string | null; id?: string };

async function garde(): Promise<{ userId?: string; erreur?: string }> {
  const verif = await verifierPermission("perm_depenses");
  if (verif.error) return { erreur: verif.error };
  return { userId: verif.userId };
}

function champs(formData: FormData) {
  const texte = (cle: string) => {
    const v = String(formData.get(cle) ?? "").trim();
    return v === "" ? null : v;
  };
  const compte = texte("compte_charge_defaut");
  /*
   * Un délai en jours : entier, jamais négatif, vide = INCONNU.
   *
   * Le vide compte, et c'est la moitié de la règle : un fournisseur sans délai
   * connu ne rend ses articles commandables en rupture, même cochés. On ne
   * promet pas un délai qu'on ignore. Écrire 0 par défaut aurait promis une
   * livraison le jour même.
   */
  const jours = (cle: string) => {
    const brut = texte(cle);
    if (brut === null) return null;
    const n = Number(brut.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };
  const min = jours("delai_commande_min_jours");
  const max = jours("delai_commande_max_jours");
  return {
    nom: String(formData.get("nom") ?? "").trim(),
    domaines: domainesValides(formData.getAll("domaines").map(String)),
    adresse: texte("adresse"),
    npa: texte("npa"),
    localite: texte("localite"),
    email: texte("email"),
    telephone: texte("telephone"),
    iban: texte("iban")?.replace(/\s+/g, "") ?? null,
    compte_charge_defaut: compte && COMPTES_DEPENSE.includes(compte) ? compte : null,
    notes: texte("notes"),
    delai_commande_min_jours: min,
    // Une borne basse au-dessus de la haute serait refusée par la base : on
    // remet les deux dans l'ordre plutôt que d'afficher une erreur pour une
    // saisie dont l'intention est claire.
    delai_commande_max_jours: min !== null && max !== null && max < min ? min : max,
  };
}

export async function enregistrerFournisseur(
  _etat: EtatFournisseur,
  formData: FormData
): Promise<EtatFournisseur> {
  const g = await garde();
  if (g.erreur) return { erreur: g.erreur };

  const id = (formData.get("id") as string) || null;
  const valeurs = champs(formData);
  if (!valeurs.nom) return { erreur: "Le nom du fournisseur est obligatoire.", id: id ?? undefined };
  if (valeurs.domaines.length === 0) return { erreur: MESSAGE_DOMAINE_REQUIS, id: id ?? undefined };

  if (id) {
    const { data: avant } = await supabaseAdmin
      .from("fournisseurs").select(Object.keys(valeurs).join(", ")).eq("id", id).maybeSingle();
    const { error } = await supabaseAdmin.from("fournisseurs").update(valeurs).eq("id", id);
    if (error) return { erreur: error.message, id };
    // APP 73 — journal des gestes : ce qui a bougé, et rien d'autre.
    const ecart = ecartFournisseur((avant ?? null) as Record<string, unknown> | null, valeurs);
    if (ecart) {
      await tracerEvenement({
        entite: "fournisseur", entiteId: id, evenement: "modification",
        avant: ecart.avant, apres: ecart.apres, userId: g.userId ?? null,
      });
    }
    revalidatePath("/comptabilite/fournisseurs");
    revalidatePath(`/comptabilite/fournisseurs/${id}`);
    return { erreur: null, id };
  }

  const { data, error } = await supabaseAdmin
    .from("fournisseurs")
    .insert(valeurs)
    .select("id")
    .single();
  if (error) return { erreur: error.message };

  await tracerEvenement({
    entite: "fournisseur", entiteId: data.id as string, evenement: "creation",
    apres: { nom: valeurs.nom, domaines: valeurs.domaines }, userId: g.userId ?? null,
  });

  revalidatePath("/comptabilite/fournisseurs");
  redirect(`/comptabilite/fournisseurs/${data.id as string}`);
}

/**
 * Activation ou désactivation. Un fournisseur qui porte des dépenses n'est
 * jamais supprimé — la piste comptable doit rester lisible.
 */
export async function basculerActifFournisseur(
  _etat: EtatFournisseur,
  formData: FormData
): Promise<EtatFournisseur> {
  const g = await garde();
  if (g.erreur) return { erreur: g.erreur };

  const id = String(formData.get("id") ?? "");
  const actif = String(formData.get("actif") ?? "") === "true";

  const { error } = await supabaseAdmin.from("fournisseurs").update({ actif }).eq("id", id);
  if (error) return { erreur: error.message, id };
  await tracerEvenement({
    entite: "fournisseur", entiteId: id, evenement: actif ? "reactivation" : "desactivation",
    avant: { actif: !actif }, apres: { actif }, userId: g.userId ?? null,
  });

  revalidatePath("/comptabilite/fournisseurs");
  revalidatePath(`/comptabilite/fournisseurs/${id}`);
  return { erreur: null, id };
}

/** Suppression réservée à un fournisseur qui n'a jamais servi. */
export async function supprimerFournisseur(
  _etat: EtatFournisseur,
  formData: FormData
): Promise<EtatFournisseur> {
  const g = await garde();
  if (g.erreur) return { erreur: g.erreur };

  const id = String(formData.get("id") ?? "");
  const { count } = await supabaseAdmin
    .from("depenses")
    .select("*", { count: "exact", head: true })
    .eq("fournisseur_id", id);

  if ((count ?? 0) > 0) {
    return {
      erreur: "Ce fournisseur porte des dépenses : désactivez-le plutôt que de le supprimer.",
      id,
    };
  }

  const { data: avantSuppression } = await supabaseAdmin
    .from("fournisseurs").select("nom, domaines").eq("id", id).maybeSingle();
  const { error } = await supabaseAdmin.from("fournisseurs").delete().eq("id", id);
  if (error) return { erreur: error.message, id };
  await tracerEvenement({
    entite: "fournisseur", entiteId: id, evenement: "suppression",
    avant: avantSuppression ?? null, userId: g.userId ?? null,
  });

  revalidatePath("/comptabilite/fournisseurs");
  redirect("/comptabilite/fournisseurs");
}

/** Les champs qui ont changé, avant et après. Les tableaux se comparent par contenu. */
function ecartFournisseur(
  avant: Record<string, unknown> | null,
  apres: Record<string, unknown>,
): { avant: Record<string, unknown>; apres: Record<string, unknown> } | null {
  const av: Record<string, unknown> = {};
  const ap: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(apres)) {
    const ancien = avant?.[cle] ?? null;
    if (JSON.stringify(ancien) === JSON.stringify(valeur ?? null)) continue;
    // L'IBAN ne s'écrit pas en clair dans le journal : on dit seulement qu'il a changé.
    av[cle] = cle === "iban" ? (ancien ? "•••" : null) : ancien;
    ap[cle] = cle === "iban" ? (valeur ? "•••" : null) : valeur ?? null;
  }
  return Object.keys(ap).length > 0 ? { avant: av, apres: ap } : null;
}
