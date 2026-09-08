"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { panierDuClient } from "@/src/lib/venteEnLigne";
import { articlesVendables } from "@/src/lib/vitrine";
import {
  fusionnerPaniers,
  lirePanierLocal,
  messageFusion,
  type LigneCompte,
} from "@/src/lib/panierLocalLogique";

/**
 * La fusion du panier du navigateur avec celui du compte, à la connexion.
 *
 * La règle est dans `panierLocalLogique` : un même article des deux côtés
 * prend la quantité LA PLUS ÉLEVÉE, jamais la somme. Personne ne veut deux
 * colliers parce qu'il s'est connecté.
 *
 * Le client_id vient de la SESSION, jamais du formulaire. Un refus est
 * retourné, jamais lancé.
 */

export type RetourFusion = { error?: string; message?: string | null; fusionne?: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;

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

  // Ce qui est encore proposé : la vitrine décide, et elle seule.
  const vendables = await articlesVendables(local.lignes.map((l) => l.article_id));
  const parId = new Map(vendables.map((a) => [a.id, a]));

  const panier = await panierDuClient(clientId, true);
  if (!panier) return { error: "Le panier n'a pas pu être ouvert." };

  const { data: dejaLa } = await supabaseAdmin
    .from("commandes_lignes")
    .select("id, article_id, quantite, configuration")
    .eq("commande_id", panier.id);

  const compte: LigneCompte[] = ((dejaLa ?? []) as unknown as {
    id: string; article_id: string; quantite: number | string; configuration: unknown[] | null;
  }[]).map((l) => ({
    id: l.id,
    article_id: l.article_id,
    quantite: Number(l.quantite),
    configuration: l.configuration,
  }));

  const fusion = fusionnerPaniers(local, compte, new Set(parId.keys()));

  for (const l of fusion.aCreer) {
    const a = parId.get(l.article_id);
    if (!a) continue;
    // Le prix vient de la BASE, jamais du navigateur — même à la fusion.
    const prix = Number(a.prix_vente);
    await supabaseAdmin.from("commandes_lignes").insert({
      commande_id: panier.id,
      article_id: l.article_id,
      libelle: l.configuration ? `${a.nom} — sur mesure` : a.nom,
      quantite: l.quantite,
      prix_unitaire: prix,
      taux_tva: 0,
      montant: r2(l.quantite * prix),
      configuration: l.configuration ?? null,
    });
  }

  for (const m of fusion.aMonter) {
    const { data: ligne } = await supabaseAdmin
      .from("commandes_lignes").select("prix_unitaire").eq("id", m.id).maybeSingle();
    const prix = Number(ligne?.prix_unitaire ?? 0);
    await supabaseAdmin
      .from("commandes_lignes")
      .update({ quantite: m.quantite, montant: r2(m.quantite * prix) })
      .eq("id", m.id);
  }

  // Le taux et le secteur se relisent sur l'article : la vitrine ne les porte pas.
  await rattraperTaux(panier.id);

  revalidatePath("/catalogue");
  revalidatePath("/catalogue/panier");

  const nomsEcartes = fusion.ecartes.map((id) => parId.get(id)?.nom ?? "Un article");
  return {
    fusionne: fusion.reprises > 0 || fusion.ecartes.length > 0,
    message: messageFusion(fusion, nomsEcartes),
  };
}

/** Les lignes créées à la fusion prennent le taux ET le secteur de leur article. */
async function rattraperTaux(panierId: string): Promise<void> {
  const { data: lignes } = await supabaseAdmin
    .from("commandes_lignes").select("id, article_id, taux_tva, secteur_tdfn").eq("commande_id", panierId);

  const aCorriger = ((lignes ?? []) as {
    id: string; article_id: string; taux_tva: number | string; secteur_tdfn: string | null;
  }[]).filter((l) => Number(l.taux_tva) === 0 || l.secteur_tdfn === null);
  if (aCorriger.length === 0) return;

  const { data: articles } = await supabaseAdmin
    .from("articles")
    .select("id, taux_tva, secteur_tdfn")
    .in("id", [...new Set(aCorriger.map((l) => l.article_id))]);

  const parId = new Map(
    ((articles ?? []) as { id: string; taux_tva: number | string; secteur_tdfn: string | null }[])
      .map((a) => [a.id, a])
  );

  for (const l of aCorriger) {
    const a = parId.get(l.article_id);
    if (!a) continue;
    await supabaseAdmin.from("commandes_lignes").update({
      taux_tva: Number(a.taux_tva),
      secteur_tdfn: a.secteur_tdfn ?? "commerce",
    }).eq("id", l.id);
  }
}
