"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { aujourdhuiISO } from "@/src/lib/dates";
import { entiteCourante, nomFamilleTitulaire } from "@/src/lib/entiteJuridique";
import {
  formeJuridique,
  normaliserIde,
  refusDateChangement,
  refusRaisonSociale,
  veille,
} from "@/src/lib/entiteJuridiqueLogique";

type Resultat = { error?: string; ok?: boolean };

/**
 * L'identité juridique : la corriger, ou en préparer une nouvelle.
 *
 * Deux gestes très différents, et c'est voulu :
 *
 *   · CORRIGER l'entité en vigueur — on complète un IDE, on rectifie une
 *     adresse. Rien ne change de date ;
 *   · PRÉPARER un changement — une nouvelle entité prend effet à une date
 *     future, et l'ancienne se ferme la veille. Rien ne bascule avant.
 *
 * Le passage lui-même — clôture, bilan d'ouverture, transfert des débiteurs et
 * des encaissements d'avance — n'est PAS ici. Voir APP 19.
 */

function champs(formData: FormData) {
  const lire = (cle: string) => String(formData.get(cle) ?? "").trim() || null;
  return {
    forme: formeJuridique(String(formData.get("forme") ?? "")),
    raison_sociale: String(formData.get("raison_sociale") ?? "").trim(),
    adresse_rue: lire("adresse_rue"),
    adresse_numero: lire("adresse_numero"),
    adresse_npa: lire("adresse_npa"),
    adresse_ville: lire("adresse_ville"),
    adresse_pays: lire("adresse_pays") ?? "CH",
    // Un IDE approché n'est pas repris : il finirait sur une facture avec
    // l'air d'être juste.
    ide: normaliserIde(lire("ide")),
    numero_tva: lire("numero_tva"),
    iban: lire("iban"),
    qr_iban: lire("qr_iban"),
    email: lire("email"),
    telephone: lire("telephone"),
  };
}

async function refusIdentite(
  valeurs: ReturnType<typeof champs>,
  userId: string | null
): Promise<string | null> {
  const nomFamille = await nomFamilleTitulaire(userId);
  const refus = refusRaisonSociale({
    forme: valeurs.forme,
    raisonSociale: valeurs.raison_sociale,
    nomFamille,
  });
  if (refus) return refus;
  const ideSaisi = String(valeurs.ide ?? "");
  if (ideSaisi !== "" && !normaliserIde(ideSaisi)) {
    return "L'IDE doit avoir la forme CHE-###.###.### .";
  }
  return null;
}

/** Corriger l'identité en vigueur, sans toucher aux dates. */
export async function corrigerEntite(formData: FormData): Promise<Resultat> {
  const acces = await exigerAdminPage();

  const courante = await entiteCourante();
  if (!courante?.id) return { error: "Aucune entité enregistrée." };

  const valeurs = champs(formData);
  const refus = await refusIdentite(valeurs, acces.userId ?? null);
  if (refus) return { error: refus };

  const { error } = await supabaseAdmin
    .from("entites_juridiques")
    .update(valeurs)
    .eq("id", courante.id);
  if (error) return { error: error.message };

  await tracerEvenement({
    entite: "entite_juridique",
    entiteId: courante.id,
    evenement: "identite_corrigee",
    avant: { raison_sociale: courante.raisonSociale, ide: courante.ide, forme: courante.forme },
    apres: { raison_sociale: valeurs.raison_sociale, ide: valeurs.ide, forme: valeurs.forme },
    userId: acces.userId ?? null,
  });

  revalidatePath("/reglages/entreprise");
  return { ok: true };
}

/**
 * Préparer le changement d'entité.
 *
 * La date doit coïncider avec le début d'un exercice. Un changement en cours
 * d'exercice oblige à deux clôtures partielles et à un bilan intermédiaire :
 * c'est possible, mais c'est un chantier comptable à part, pas un réglage.
 */
export async function preparerChangement(formData: FormData): Promise<Resultat> {
  const acces = await exigerAdminPage();

  const date = String(formData.get("date_debut") ?? "").trim();
  const courante = await entiteCourante();

  const refusDate = refusDateChangement({
    date,
    aujourdhui: aujourdhuiISO(),
    dateDebutActuelle: courante?.dateDebut ?? null,
  });
  if (refusDate) return { error: refusDate };

  const valeurs = champs(formData);
  const refus = await refusIdentite(valeurs, acces.userId ?? null);
  if (refus) return { error: refus };

  // L'ancienne se ferme la VEILLE : les deux plages se touchent sans se
  // chevaucher, et la contrainte d'exclusion le vérifie en base.
  if (courante?.id) {
    const { error: errFin } = await supabaseAdmin
      .from("entites_juridiques")
      .update({ date_fin: date })
      .eq("id", courante.id);
    if (errFin) return { error: errFin.message };
  }

  const { data: creee, error } = await supabaseAdmin
    .from("entites_juridiques")
    .insert({ ...valeurs, date_debut: date, created_by: acces.userId ?? null })
    .select("id")
    .single();
  if (error || !creee) {
    // On rouvre l'ancienne : un échec ne doit pas laisser un trou de dates.
    if (courante?.id) {
      await supabaseAdmin
        .from("entites_juridiques")
        .update({ date_fin: courante.dateFin })
        .eq("id", courante.id);
    }
    return { error: error?.message ?? "Création impossible." };
  }

  await tracerEvenement({
    entite: "entite_juridique",
    entiteId: creee.id,
    evenement: "changement_prepare",
    avant: courante
      ? { forme: courante.forme, raison_sociale: courante.raisonSociale, jusqu_au: veille(date) }
      : null,
    apres: { forme: valeurs.forme, raison_sociale: valeurs.raison_sociale, des_le: date },
    motif: "Changement d'entité préparé. Le passage comptable reste à faire (APP 19).",
    userId: acces.userId ?? null,
  });

  revalidatePath("/reglages/entreprise");
  return { ok: true };
}

/** Annuler un changement pas encore entré en vigueur. */
export async function annulerChangement(entiteId: string): Promise<Resultat> {
  const acces = await exigerAdminPage();

  const { data: future } = await supabaseAdmin
    .from("entites_juridiques")
    .select("id, date_debut")
    .eq("id", entiteId)
    .maybeSingle();
  if (!future) return { error: "Entité introuvable." };
  if (String(future.date_debut) <= aujourdhuiISO()) {
    return { error: "Cette entité est déjà en vigueur : elle ne s'annule pas." };
  }

  const { error } = await supabaseAdmin.from("entites_juridiques").delete().eq("id", entiteId);
  if (error) return { error: error.message };

  // La précédente redevient ouverte.
  const { data: precedente } = await supabaseAdmin
    .from("entites_juridiques")
    .select("id")
    .lt("date_debut", String(future.date_debut))
    .order("date_debut", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (precedente) {
    await supabaseAdmin
      .from("entites_juridiques")
      .update({ date_fin: null })
      .eq("id", precedente.id);
  }

  await tracerEvenement({
    entite: "entite_juridique",
    entiteId,
    evenement: "changement_annule",
    motif: "Changement d'entité annulé avant sa date d'effet.",
    userId: acces.userId ?? null,
  });

  revalidatePath("/reglages/entreprise");
  return { ok: true };
}
