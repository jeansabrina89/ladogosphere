"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { aujourdhuiISO } from "@/src/lib/dates";
import {
  catalogueVisible,
  estGarde,
  joursValides,
  refusAnnulation,
  unitePrestation,
} from "@/src/lib/prestationsLogique";
import { datesDe } from "@/src/lib/prestationsLogique";
import { gardeQuiChevauche, regenererAbonnement } from "@/src/lib/prestationsDb";

/**
 * Les gestes de l'espace Prestations.
 *
 * Deux niveaux de droit, et ils ne disent pas la même chose :
 *
 *   · `perm_prestations` suffit pour VOIR et COCHER. C'est le geste de terrain :
 *     l'employée constate qu'elle a fait le nettoyage ;
 *   · créer une prestation, en annuler une ou toucher à un abonnement exige EN
 *     PLUS `perm_encaissements`, parce que ces gestes-là décident de ce qui
 *     partira sur une facture.
 */

type Resultat = { error?: string; ok?: boolean };

async function garde(): Promise<{ error?: string; userId?: string }> {
  return verifierPermission("perm_prestations");
}

/** Pour ce qui touche à l'argent : la permission des encaissements en plus. */
async function gardeFacturation(): Promise<{ error?: string; userId?: string }> {
  const base = await verifierPermission("perm_prestations");
  if (base.error) return base;
  const sous = await verifierPermission("perm_encaissements");
  if (sous.error) {
    return {
      error:
        "Créer ou annuler une prestation demande la permission des encaissements : " +
        "ces gestes décident de ce qui partira sur une facture.",
    };
  }
  return base;
}

// ── Le geste du terrain ───────────────────────────────────────────────────

export async function marquerFaite(tacheId: string): Promise<Resultat> {
  const verif = await garde();
  if (verif.error) return verif;

  const { error } = await supabaseAdmin
    .from("taches_prestations")
    .update({ statut: "faite", fait_le: new Date().toISOString(), fait_par: verif.userId ?? null })
    .eq("id", tacheId)
    .eq("statut", "a_faire");
  if (error) return { error: error.message };

  revalidatePath("/prestations");
  return { ok: true };
}

export async function annulerFaite(tacheId: string): Promise<Resultat> {
  const verif = await garde();
  if (verif.error) return verif;

  const { error } = await supabaseAdmin
    .from("taches_prestations")
    .update({ statut: "a_faire", fait_le: null, fait_par: null })
    .eq("id", tacheId)
    .eq("statut", "faite")
    .is("facture_id", null);
  if (error) return { error: error.message };

  revalidatePath("/prestations");
  return { ok: true };
}

/**
 * Annuler une prestation : le motif est obligatoire.
 *
 * C'est lui qui sort la ligne de la facture, et il peut y figurer en note.
 * Sans motif, une prestation disparue du décompte serait inexplicable au
 * moment où le locataire demandera pourquoi.
 */
export async function annulerTache(formData: FormData): Promise<Resultat> {
  const verif = await gardeFacturation();
  if (verif.error) return verif;

  const id = String(formData.get("tache_id") ?? "");
  const motif = String(formData.get("motif") ?? "").trim();
  const refus = refusAnnulation(motif);
  if (refus) return { error: refus };

  const { error } = await supabaseAdmin
    .from("taches_prestations")
    .update({ statut: "annulee", motif_annulation: motif })
    .eq("id", id)
    .is("facture_id", null);
  if (error) return { error: error.message };

  revalidatePath("/prestations");
  return { ok: true };
}

// ── Les prestations ponctuelles ───────────────────────────────────────────

/**
 * Une demande reçue par téléphone, ou une garde sur une plage de dates.
 *
 * Une prestation d'unité « journee » est une GARDE COMPLÈTE : elle génère une
 * tâche par jour de la période, chacune cochable, et bloque toute demande
 * concurrente sur le même chien. Le chien reste dans SON box — aucun box de la
 * pension n'est réservé, aucun tarif de pension ne s'applique.
 */
export async function ajouterPrestation(formData: FormData): Promise<Resultat> {
  const verif = await gardeFacturation();
  if (verif.error) return verif;

  const clientId = String(formData.get("client_id") ?? "");
  const prestationId = String(formData.get("prestation_id") ?? "");
  const chienId = String(formData.get("chien_id") ?? "") || null;
  const dateDebut = String(formData.get("date_debut") ?? "");
  const dateFin = String(formData.get("date_fin") ?? "") || dateDebut;
  const heure = String(formData.get("heure_prevue") ?? "") || null;
  const commentaire = String(formData.get("commentaire") ?? "").trim() || null;

  if (!clientId || !prestationId) return { error: "Choisissez le locataire et la prestation." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDebut)) return { error: "Date invalide." };
  if (dateFin < dateDebut) return { error: "La date de fin précède la date de début." };

  const [{ data: client }, { data: prestation }] = await Promise.all([
    supabaseAdmin.from("clients").select("id, locataire_box, box_loue").eq("id", clientId).maybeSingle(),
    supabaseAdmin.from("prestations").select("id, unite, prix, taux_tva, motif_tva, actif").eq("id", prestationId).maybeSingle(),
  ]);
  if (!client || !catalogueVisible(client)) {
    return { error: "Les prestations sont réservées aux locataires de box." };
  }
  if (!prestation?.actif) return { error: "Cette prestation n'est plus au catalogue." };

  const garde24h = estGarde(unitePrestation(prestation.unite as string));

  // Une garde en cours bloque les demandes concurrentes sur le même chien :
  // on ne prend pas deux fois en charge le même chien les mêmes jours.
  if (garde24h && chienId) {
    const conflit = await gardeQuiChevauche(chienId, dateDebut, dateFin);
    if (conflit) {
      return {
        error: `Ce chien est déjà sous garde le ${conflit.date} : annulez cette garde avant d'en poser une autre.`,
      };
    }
  }

  const jours = garde24h ? datesDe(dateDebut, dateFin) : [dateDebut];
  const groupeId = garde24h && jours.length > 1 ? crypto.randomUUID() : null;

  const { error } = await supabaseAdmin.from("taches_prestations").insert(
    jours.map((date) => ({
      date,
      heure_prevue: garde24h ? null : heure,
      client_id: clientId,
      chien_id: chienId,
      box: client.box_loue ?? null,
      prestation_id: prestationId,
      origine: "ponctuelle",
      facturable: true,
      // Le prix est celui du catalogue au jour de la commande, figé ici.
      prix_fige: Number(prestation.prix ?? 0),
      taux_tva: Number(prestation.taux_tva ?? 8.1),
      motif_tva: (prestation.motif_tva as string | null) ?? null,
      garde: garde24h,
      groupe_id: groupeId,
      commentaire,
      created_by: verif.userId ?? null,
    }))
  );
  if (error) return { error: error.message };

  revalidatePath("/prestations");
  revalidatePath(`/prestations/locataires/${clientId}`);
  return { ok: true };
}

/**
 * Annuler une garde entière : les jours non encore faits sont libérés et
 * sortent de la facture. Ceux déjà faits restent — ils racontent un travail
 * réellement accompli.
 */
export async function annulerGarde(formData: FormData): Promise<Resultat> {
  const verif = await gardeFacturation();
  if (verif.error) return verif;

  const groupeId = String(formData.get("groupe_id") ?? "");
  const motif = String(formData.get("motif") ?? "").trim();
  const refus = refusAnnulation(motif);
  if (refus) return { error: refus };
  if (!groupeId) return { error: "Garde introuvable." };

  const { error } = await supabaseAdmin
    .from("taches_prestations")
    .update({ statut: "annulee", motif_annulation: motif })
    .eq("groupe_id", groupeId)
    .eq("statut", "a_faire")
    .is("facture_id", null);
  if (error) return { error: error.message };

  revalidatePath("/prestations");
  return { ok: true };
}

// ── Les abonnements ───────────────────────────────────────────────────────

export async function attribuerFormule(formData: FormData): Promise<Resultat> {
  const verif = await gardeFacturation();
  if (verif.error) return verif;

  const clientId = String(formData.get("client_id") ?? "");
  const formuleId = String(formData.get("formule_id") ?? "");
  const dateDebut = String(formData.get("date_debut") ?? "") || aujourdhuiISO();

  const [{ data: client }, { data: formule }] = await Promise.all([
    supabaseAdmin.from("clients").select("id, locataire_box").eq("id", clientId).maybeSingle(),
    supabaseAdmin.from("formules").select("id, prix_mensuel, actif").eq("id", formuleId).maybeSingle(),
  ]);
  if (!client || !catalogueVisible(client)) {
    return { error: "Les formules sont réservées aux locataires de box." };
  }
  if (!formule?.actif) return { error: "Cette formule est désactivée." };

  // Un seul abonnement actif à la fois : le précédent se termine la veille.
  await supabaseAdmin
    .from("abonnements_prestations")
    .update({ statut: "termine", date_fin: dateDebut })
    .eq("client_id", clientId)
    .eq("statut", "actif");

  const { data: abo, error } = await supabaseAdmin
    .from("abonnements_prestations")
    .insert({
      client_id: clientId,
      formule_id: formuleId,
      date_debut: dateDebut,
      statut: "actif",
      // Le prix est FIGÉ ici : une formule qui change plus tard ne le touche pas.
      prix_mensuel_fige: Number(formule.prix_mensuel ?? 0),
      created_by: verif.userId ?? null,
    })
    .select("id")
    .single();
  if (error || !abo) return { error: error?.message ?? "Attribution impossible." };

  await regenererAbonnement(abo.id, aujourdhuiISO());
  revalidatePath(`/prestations/locataires/${clientId}`);
  return { ok: true };
}

/**
 * Les jours personnalisés d'une semaine : ce qui permet de jongler sans
 * changer d'abonnement. Ils REMPLACENT les jours de la formule pour cette
 * semaine-là, et la quantité hebdomadaire suit.
 */
export async function personnaliserSemaine(formData: FormData): Promise<Resultat> {
  const verif = await garde();
  if (verif.error) return verif;

  const abonnementId = String(formData.get("abonnement_id") ?? "");
  const semaine = String(formData.get("semaine") ?? "");
  const prestationId = String(formData.get("prestation_id") ?? "");
  const jours = joursValides(formData.getAll("jours") as string[]);

  if (!abonnementId || !semaine || !prestationId) return { error: "Demande incomplète." };

  const { data: abo } = await supabaseAdmin
    .from("abonnements_prestations")
    .select("id, client_id, jours_personnalises")
    .eq("id", abonnementId)
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
  await tracerEvenement({
    entite: "abonnement",
    entiteId: abonnementId,
    evenement: "jours_personnalises",
    apres: { semaine, prestation_id: prestationId, jours },
    userId: verif.userId ?? null,
  });

  revalidatePath(`/prestations/locataires/${abo.client_id}`);
  return { ok: true };
}

// ── La fiche du locataire ─────────────────────────────────────────────────

export async function enregistrerLocataire(formData: FormData): Promise<Resultat> {
  const verif = await gardeFacturation();
  if (verif.error) return verif;

  const clientId = String(formData.get("client_id") ?? "");
  const loyerBrut = String(formData.get("loyer_refacture") ?? "").trim();

  const { error } = await supabaseAdmin
    .from("clients")
    .update({
      locataire_box: formData.get("locataire_box") === "on",
      box_loue: String(formData.get("box_loue") ?? "").trim() || null,
      // Laissé à null tant que Sabrina ne l'a pas saisi : aucun montant deviné.
      loyer_refacture: loyerBrut === "" ? null : Number(loyerBrut),
      locataire_depuis: String(formData.get("locataire_depuis") ?? "") || null,
      locataire_jusqu_au: String(formData.get("locataire_jusqu_au") ?? "") || null,
    })
    .eq("id", clientId);
  if (error) return { error: error.message };

  revalidatePath(`/prestations/locataires/${clientId}`);
  revalidatePath("/prestations/locataires");
  return { ok: true };
}
