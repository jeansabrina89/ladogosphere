"use server";

import { revalidatePath } from "next/cache";
import { verifierAdmin } from "@/src/lib/permissions";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { libelleSeuil, lireSaisieFrancoPort } from "@/src/lib/venteEnLigneLogique";

/** La clé du seuil de livraison offerte dans parametres. */
const CLE_FRANCO_PORT = "franco_port_des";

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
