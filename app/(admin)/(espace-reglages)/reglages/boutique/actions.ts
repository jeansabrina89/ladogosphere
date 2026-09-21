"use server";

import { revalidatePath } from "next/cache";
import { verifierAdmin } from "@/src/lib/permissions";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import {
  formatPoids,
  libelleSeuil,
  lireSaisieFrancoPort,
  lireSaisieGrille,
  type LigneSaisieGrille,
  type PalierPort,
} from "@/src/lib/venteEnLigneLogique";

/** La clé du seuil de livraison offerte dans parametres. */
const CLE_FRANCO_PORT = "franco_port_des";
/** Les clés de la grille et du poids maximum dans parametres. */
const CLE_GRILLE = "frais_port_grille";
const CLE_POIDS_MAX = "poids_max_colis_grammes";

export type RetourFranco = { error?: string; message?: string };

/**
 * Réglages → Boutique : « Livraison offerte à partir de ».
 *
 * Réservé à l'administratrice : c'est une décision commerciale. Un refus est
 * retourné, jamais lancé. Vide = jamais ; la valeur s'écrit vide en base, la
 * table des paramètres n'acceptant pas de valeur nulle.
 *
 * Une commande déjà confirmée ne bouge pas : ses frais de port sont figés dans
 * commandes.frais_port. Le nouveau seuil vaut pour les paniers à venir.
 */
export async function enregistrerFrancoPort(formData: FormData): Promise<RetourFranco> {
  const acces = await verifierAdmin();
  if (acces.error) return { error: "Réservé à l'administratrice." };

  const saisie = lireSaisieFrancoPort(formData.get("franco_port_des"));
  if (!saisie.ok) return { error: saisie.message };

  const { data: avant } = await supabaseAdmin
    .from("parametres").select("valeur").eq("cle", CLE_FRANCO_PORT).maybeSingle();

  const { data: ligne, error } = await supabaseAdmin
    .from("parametres")
    .upsert(
      {
        cle: CLE_FRANCO_PORT,
        valeur: saisie.valeur,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cle" },
    )
    .select("id")
    .single();
  if (error || !ligne) return { error: error?.message ?? "Enregistrement impossible." };

  await tracerEvenement({
    entite: "parametre",
    entiteId: ligne.id as string,
    evenement: "franco_port_des",
    avant: { valeur: (avant?.valeur as string | null) ?? "" },
    apres: { valeur: saisie.valeur },
    userId: acces.userId ?? null,
  });

  revalidatePath("/reglages/boutique");
  revalidatePath("/catalogue/panier");

  return {
    message: saisie.seuil === null
      ? "La livraison n'est plus jamais offerte. Les commandes déjà confirmées ne changent pas."
      : `Livraison offerte dès ${libelleSeuil(saisie.seuil)} d'articles. Les commandes déjà confirmées ne changent pas.`,
  };
}

export type RetourGrille = { error?: string; message?: string; paliers?: PalierPort[]; poidsMaxGrammes?: number };

/**
 * Réglages → Boutique : la grille des frais de port et le poids maximum d'un
 * colis, enregistrés ensemble — l'un borne l'autre.
 *
 * La grille s'écrit dans frais_port_grille au format que lit fraisPort, triée
 * par poids croissant. Chaque changement est tracé au journal, avec la grille
 * d'avant : un tarif appliqué à un client doit pouvoir se retrouver.
 */
export async function enregistrerGrillePort(formData: FormData): Promise<RetourGrille> {
  const acces = await verifierAdmin();
  if (acces.error) return { error: "Réservé à l'administratrice." };

  let lignes: LigneSaisieGrille[];
  try {
    lignes = JSON.parse(String(formData.get("lignes") ?? "[]"));
    if (!Array.isArray(lignes)) throw new Error();
  } catch {
    return { error: "Grille illisible." };
  }
  const saisie = lireSaisieGrille({ lignes, poidsMaxKg: String(formData.get("poids_max_kg") ?? "") });
  if (!saisie.ok) return { error: saisie.message };

  const { data: avant } = await supabaseAdmin
    .from("parametres").select("id, cle, valeur").in("cle", [CLE_GRILLE, CLE_POIDS_MAX]);
  const valeurAvant = (cle: string) =>
    ((avant ?? []) as { cle: string; valeur: string }[]).find((p) => p.cle === cle)?.valeur ?? "";

  const maintenant = new Date().toISOString();
  const { data: lignesEcrites, error } = await supabaseAdmin
    .from("parametres")
    .upsert(
      [
        { cle: CLE_GRILLE, valeur: JSON.stringify(saisie.paliers), updated_at: maintenant },
        { cle: CLE_POIDS_MAX, valeur: String(saisie.poidsMaxGrammes), updated_at: maintenant },
      ],
      { onConflict: "cle" },
    )
    .select("id, cle");
  if (error || !lignesEcrites) return { error: error?.message ?? "Enregistrement impossible." };

  const idGrille = (lignesEcrites as { id: string; cle: string }[]).find((l) => l.cle === CLE_GRILLE)?.id;
  if (idGrille) {
    await tracerEvenement({
      entite: "parametre",
      entiteId: idGrille,
      evenement: "frais_port_grille",
      // La valeur d'avant telle qu'elle était écrite — même incohérente : le
      // journal garde ce qui était, il ne le relit pas.
      avant: {
        grille: valeurAvant(CLE_GRILLE),
        poids_max_colis_grammes: valeurAvant(CLE_POIDS_MAX),
      },
      apres: { grille: saisie.paliers, poids_max_colis_grammes: saisie.poidsMaxGrammes },
      userId: acces.userId ?? null,
    });
  }

  revalidatePath("/reglages/boutique");
  revalidatePath("/catalogue/panier");

  return {
    paliers: saisie.paliers,
    poidsMaxGrammes: saisie.poidsMaxGrammes,
    message: `Grille enregistrée : ${saisie.paliers
      .map((p) => `jusqu'à ${formatPoids(p.jusqu_a_grammes)} → ${p.prix.toFixed(2)}`)
      .join(" · ")}. Colis de ${formatPoids(saisie.poidsMaxGrammes)} au plus. Les commandes déjà confirmées ne changent pas.`,
  };
}
