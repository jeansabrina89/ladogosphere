"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import {
  MESSAGE_RESERVE_LOCATAIRES,
  catalogueVisible,
  estGarde,
  joursValides,
  unitePrestation,
} from "@/src/lib/prestationsLogique";
import { lireReglagesPrestations, regenererAbonnement } from "@/src/lib/prestationsDb";
import { aujourdhuiISO } from "@/src/lib/dates";

type Resultat = { error?: string; ok?: boolean };

/**
 * Ce qu'un locataire peut faire lui-même.
 *
 * La porte est vérifiée à chaque geste, côté serveur, sur la fiche liée à sa
 * session : ni le formulaire ni l'identifiant qu'il enverrait ne décident de
 * son droit. Un client de la pension est refusé net.
 */
async function ficheDuLocataire(): Promise<
  { error: string } | { fiche: { id: string; box_loue: string | null } }
> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };

  const { data: fiche } = await supabaseAdmin
    .from("clients")
    .select("id, locataire_box, box_loue")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!fiche || !catalogueVisible(fiche)) return { error: MESSAGE_RESERVE_LOCATAIRES };

  return { fiche: { id: String(fiche.id), box_loue: (fiche.box_loue as string | null) ?? null } };
}

/** Commander une prestation ponctuelle — si le réglage l'autorise. */
export async function commanderPrestation(formData: FormData): Promise<Resultat> {
  const acces = await ficheDuLocataire();
  if ("error" in acces) return acces;

  const reglages = await lireReglagesPrestations();
  if (!reglages.commandeLocataire) {
    return { error: "Les commandes passent par la pension. Appelez-nous." };
  }

  const prestationId = String(formData.get("prestation_id") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!prestationId) return { error: "Choisissez une prestation." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Date invalide." };
  if (date < aujourdhuiISO()) return { error: "Cette date est passée." };

  const { data: prestation } = await supabaseAdmin
    .from("prestations")
    .select("id, unite, prix, taux_tva, motif_tva, actif")
    .eq("id", prestationId)
    .maybeSingle();
  if (!prestation?.actif) return { error: "Cette prestation n'est pas disponible." };

  // Une garde complète se décide avec la pension : elle engage une
  // responsabilité de 24 h et bloque le chien. Elle ne se commande pas en ligne.
  if (estGarde(unitePrestation(prestation.unite as string))) {
    return { error: "Une garde se convient avec la pension : appelez-nous pour l'organiser." };
  }

  const { error } = await supabaseAdmin.from("taches_prestations").insert({
    date,
    heure_prevue: String(formData.get("heure_prevue") ?? "") || null,
    client_id: acces.fiche.id,
    box: acces.fiche.box_loue,
    prestation_id: prestationId,
    origine: "a_la_carte",
    facturable: true,
    prix_fige: Number(prestation.prix ?? 0),
    taux_tva: Number(prestation.taux_tva ?? 8.1),
    motif_tva: (prestation.motif_tva as string | null) ?? null,
    commentaire: String(formData.get("commentaire") ?? "").trim() || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/mon-compte/prestations");
  return { ok: true };
}

/** Ajuster ses jours pour la semaine à venir, sans changer d'abonnement. */
export async function ajusterMaSemaine(formData: FormData): Promise<Resultat> {
  const acces = await ficheDuLocataire();
  if ("error" in acces) return acces;

  const abonnementId = String(formData.get("abonnement_id") ?? "");
  const semaine = String(formData.get("semaine") ?? "");
  const prestationId = String(formData.get("prestation_id") ?? "");
  const jours = joursValides(formData.getAll("jours") as string[]);
  if (!abonnementId || !semaine || !prestationId) return { error: "Demande incomplète." };

  // L'abonnement doit être le sien : l'identifiant envoyé ne suffit pas.
  const { data: abo } = await supabaseAdmin
    .from("abonnements_prestations")
    .select("id, client_id, jours_personnalises")
    .eq("id", abonnementId)
    .eq("client_id", acces.fiche.id)
    .maybeSingle();
  if (!abo) return { error: "Abonnement introuvable." };

  const perso = { ...((abo.jours_personnalises ?? {}) as Record<string, Record<string, string[]>>) };
  perso[semaine] = { ...(perso[semaine] ?? {}), [prestationId]: jours };

  const { error } = await supabaseAdmin
    .from("abonnements_prestations")
    .update({ jours_personnalises: perso })
    .eq("id", abonnementId);
  if (error) return { error: error.message };

  await regenererAbonnement(abonnementId, aujourdhuiISO());
  revalidatePath("/mon-compte/prestations");
  return { ok: true };
}
