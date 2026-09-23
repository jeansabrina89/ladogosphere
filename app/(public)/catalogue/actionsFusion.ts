"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { panierDuClient } from "@/src/lib/venteEnLigne";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { chargerCatalogue } from "@/src/lib/panier/catalogue";
import {
  choixDepuisConfiguration,
  refusNombreDeLignes,
  revaliderLigne,
  type CodeLigneInvalide,
  type LigneRevalidee,
} from "@/src/lib/panier/revaliderLigne";
import {
  fusionnerPaniers,
  lirePanierLocal,
  messageFusion,
  estSurMesure,
  type LigneCompte,
  type LigneLocale,
} from "@/src/lib/panierLocalLogique";

/**
 * La fusion du panier du navigateur avec celui du compte, à la connexion.
 *
 * La règle de fusion est dans `panierLocalLogique` : un même article des deux
 * côtés prend la quantité LA PLUS ÉLEVÉE, jamais la somme.
 *
 * Ce qui arrive du navigateur n'est qu'un ensemble d'IDENTIFIANTS : article,
 * choix d'options, quantité. Chaque ligne est relue contre le catalogue
 * (revaliderLigne) AVANT d'entrer en base, et c'est tout ou rien : une seule
 * ligne refusée, et rien n'est écrit — le navigateur montre l'erreur et renvoie
 * un panier propre. Les lignes DÉJÀ au compte qui ne passent plus ne sont pas
 * supprimées en silence : elles sont nommées dans la réponse.
 *
 * Le client_id vient de la SESSION, jamais du formulaire. Un refus est
 * retourné, jamais lancé.
 */

export type RetourFusion = {
  error?: string;
  code?: CodeLigneInvalide;
  champ?: string;
  message?: string | null;
  fusionne?: boolean;
  /** Les lignes déjà au compte qui ne passent plus, à montrer à l'écran. */
  invalides?: { ligne_id: string; libelle: string; code: CodeLigneInvalide; message: string }[];
};

export async function fusionnerPanierLocal(brut: unknown): Promise<RetourFusion> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Connectez-vous pour retrouver votre panier." };

  const { data: fiche } = await supabase
    .from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
  const clientId = (fiche?.id as string) ?? null;
  if (!clientId) return { error: "Votre fiche client n'est pas encore créée." };

  const local = lirePanierLocal(brut);
  if (local.lignes.length === 0) return { fusionne: false, message: null };

  const trop = refusNombreDeLignes(local.lignes.length);
  if (trop) return { error: trop.message, code: trop.code, champ: trop.champ };

  const panier = await panierDuClient(clientId, true);
  if (!panier) return { error: "Le panier n'a pas pu être ouvert." };

  const { data: dejaLa } = await supabaseAdmin
    .from("commandes_lignes")
    .select("id, article_id, libelle, quantite, prix_unitaire, configuration")
    .eq("commande_id", panier.id);

  const lignesCompte = (dejaLa ?? []) as unknown as {
    id: string; article_id: string; libelle: string;
    quantite: number | string; prix_unitaire: number | string; configuration: unknown[] | null;
  }[];

  // Un seul chargement du catalogue pour tout l'envoi : articles du navigateur
  // et articles déjà au compte.
  const catalogue = await chargerCatalogue(
    [...local.lignes.map((l) => l.article_id), ...lignesCompte.map((l) => l.article_id)],
    clientId,
  );

  // ── Les lignes entrantes : toutes bonnes, ou rien ────────────────────────
  const recalculees = new Map<LigneLocale, LigneRevalidee>();
  for (const l of local.lignes) {
    const res = revaliderLigne(
      { article_id: l.article_id, quantite: l.quantite, choix: l.choix, configuration: l.configuration },
      catalogue,
    );
    if (!res.ok) return { error: res.message, code: res.code, champ: res.champ };
    recalculees.set(l, res);
  }

  // Un prix venu du navigateur n'est jamais lu : on le dit une fois, pour
  // l'envoi entier, et sans rien d'autre que le compte de lignes.
  if ([...recalculees.values()].some((r) => r.prixClientIgnore)) {
    await tracerEvenement({
      entite: "acces", entiteId: user.id, evenement: "prix_client_ignore",
      apres: { action: "fusion_panier", lignes: recalculees.size },
      userId: user.id,
    });
  }

  const compte: LigneCompte[] = lignesCompte.map((l) => ({
    id: l.id,
    article_id: l.article_id,
    quantite: Number(l.quantite),
    configuration: l.configuration,
  }));

  const fusion = fusionnerPaniers(local, compte, new Set(catalogue.articles.keys()));

  for (const l of fusion.aCreer) {
    const recalculee = recalculees.get(l);
    if (!recalculee) continue;
    // Prix, libellé, taux, poids et options : du catalogue, jamais du navigateur.
    await supabaseAdmin.from("commandes_lignes").insert({
      commande_id: panier.id,
      article_id: recalculee.article_id,
      libelle: recalculee.libelle,
      quantite: recalculee.quantite,
      prix_unitaire: recalculee.prix_unitaire,
      taux_tva: recalculee.taux_tva,
      secteur_tdfn: recalculee.secteur_tdfn,
      montant: recalculee.montant,
      configuration: recalculee.configuration,
      prix_base: recalculee.prix_base,
      remise_pourcentage: recalculee.remise_pourcentage,
      remise_origine: recalculee.remise_origine,
      remise_libelle: recalculee.remise_libelle,
    });
  }

  for (const m of fusion.aMonter) {
    const ligne = lignesCompte.find((l) => l.id === m.id);
    const article = ligne ? catalogue.articles.get(ligne.article_id) : undefined;
    if (!ligne || !article) continue;
    // La quantité montée repasse par la même règle que le reste.
    const res = revaliderLigne({ article_id: ligne.article_id, quantite: m.quantite }, catalogue);
    if (!res.ok) return { error: res.message, code: res.code, champ: res.champ };
    await supabaseAdmin
      .from("commandes_lignes")
      .update({ quantite: res.quantite, prix_unitaire: res.prix_unitaire, montant: res.montant })
      .eq("id", m.id);
  }

  revalidatePath("/catalogue");
  revalidatePath("/catalogue/panier");

  // ── Ce qui dormait au compte et ne passe plus : nommé, jamais effacé ─────
  const invalides: NonNullable<RetourFusion["invalides"]> = [];
  for (const l of lignesCompte) {
    const res = revaliderLigne(
      {
        article_id: l.article_id,
        quantite: Number(l.quantite),
        // Une ligne déjà figée se relit par ses identifiants quand elle en a.
        choix: choixDepuisConfiguration(l.configuration),
        configuration: l.configuration,
      },
      catalogue,
    );
    if (!res.ok && !(estSurMesure(l) && res.code === "CONFIGURATION_ILLISIBLE")) {
      invalides.push({ ligne_id: l.id, libelle: l.libelle, code: res.code, message: res.message });
    }
  }

  const nomsEcartes = fusion.ecartes.map((id) => catalogue.articles.get(id)?.nom ?? "Un article");
  return {
    fusionne: fusion.reprises > 0 || fusion.ecartes.length > 0,
    message: messageFusion(fusion, nomsEcartes),
    ...(invalides.length > 0 ? { invalides } : {}),
  };
}
