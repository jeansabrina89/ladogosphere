"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierAdmin } from "@/src/lib/permissions";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { lireParametresTva, tauxLegauxEnVigueur, tauxPrestation } from "@/src/lib/tva";
import { aujourdhuiISO } from "@/src/lib/dates";
import {
  codePrestationValide,
  libellePrestation,
  motifTvaPropre,
  normaliserNumeroTva,
  numeroTvaValide,
  refusTauxLegal,
  refusTauxTdfn,
  secteurValide,
  tauxDansLaListe,
} from "@/src/lib/tvaLogique";
import type { MethodeTva, Periodicite } from "@/src/lib/decompteTvaLogique";

/**
 * Le régime de TVA se règle ici, et nulle part ailleurs.
 *
 * Chaque enregistrement écrit une NOUVELLE ligne datée dans `parametres_tva` :
 * un régime s'historise, il ne s'écrase pas. Un décompte de l'an dernier doit
 * pouvoir se relire avec les taux de l'an dernier.
 *
 * Tout passe au journal, avec l'avant et l'après.
 */

export type RetourTva = { error?: string; message?: string };

/** Faute de session lisible, la trace reste attribuable à personne. */
const UTILISATEUR_INCONNU = "00000000-0000-0000-0000-000000000000";

const nb = (v: FormDataEntryValue | null): number => {
  const n = Number(String(v ?? "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
};
const txt = (v: FormDataEntryValue | null): string => String(v ?? "").trim();

export async function enregistrerRegimeTva(formData: FormData): Promise<RetourTva> {
  const acces = await verifierAdmin();
  if (acces.error) return { error: "Réservé à l'administratrice." };

  const assujettie = txt(formData.get("assujettie")) === "true";
  const dateDebut = txt(formData.get("date_debut")) || new Date().toISOString().slice(0, 10);
  const dateAssujettissement = txt(formData.get("date_assujettissement")) || null;
  const methode = txt(formData.get("methode")) as MethodeTva;
  const periodicite = txt(formData.get("periodicite")) as Periodicite;
  const libelle1 = txt(formData.get("libelle_secteur_1"));
  const libelle2 = txt(formData.get("libelle_secteur_2"));
  const taux1 = nb(formData.get("taux_tdfn_1"));
  const taux2brut = txt(formData.get("taux_tdfn_2"));
  const taux2 = taux2brut === "" ? null : nb(formData.get("taux_tdfn_2"));

  if (!["tdfn", "effective"].includes(methode)) return { error: "Choisissez la méthode de décompte." };
  if (!["semestrielle", "trimestrielle"].includes(periodicite)) {
    return { error: "Choisissez la périodicité du décompte." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDebut)) return { error: "La date d'effet est illisible." };

  if (assujettie && !dateAssujettissement) {
    return { error: "Indiquez la date d'assujettissement : c'est elle qui dit à partir de quelle pièce la TVA s'applique." };
  }

  // Le numéro se met en forme tout seul, mais on ne devine pas neuf chiffres.
  let numero: string | null = null;
  const numeroBrut = txt(formData.get("numero_tva"));
  if (numeroBrut) {
    numero = numeroTvaValide(numeroBrut) ? numeroBrut : normaliserNumeroTva(numeroBrut);
    if (!numero) {
      return { error: "Le numéro de TVA doit compter neuf chiffres, au format CHE-123.456.789 TVA." };
    }
  }
  if (assujettie && !numero) {
    return { error: "Indiquez le numéro de TVA : il figure sur toutes les factures d'une entreprise assujettie." };
  }

  // Le garde-fou qui compte : recopier 8,1 % dans le champ du forfait. Les
  // deux chiffres n'ont aucun rapport, et l'erreur ne se voit qu'au décompte —
  // des mois plus tard, quand le montant dû est faux.
  const legaux = await tauxLegauxEnVigueur(dateDebut);
  const refus1 = refusTauxTdfn(txt(formData.get("taux_tdfn_1")), { legauxEnVigueur: legaux });
  if (refus1) return { error: refus1 };
  const refus2 = refusTauxTdfn(taux2brut, { legauxEnVigueur: legaux });
  if (refus2) return { error: refus2 };
  if (taux2 !== null && taux2 > 0 && !libelle2) {
    return { error: "Nommez le secteur 2 : un taux sans secteur ne sait pas à quoi s'appliquer." };
  }

  const avant = await lireParametresTva(dateDebut);

  const ligne = {
    date_debut: dateDebut,
    assujettie,
    date_assujettissement: dateAssujettissement,
    numero_tva: numero,
    methode,
    periodicite,
    // Les taux de dette fiscale nette sont SAISIS. Zéro n'est pas un taux :
    // c'est un champ vide, et le décompte refusera de calculer tant qu'il
    // le reste.
    taux_tdfn_1: taux1,
    libelle_secteur_1: libelle1,
    taux_tdfn_2: taux2,
    libelle_secteur_2: libelle2 || null,
  };

  // Une seule ligne par date d'effet : réenregistrer le même jour corrige la
  // saisie du jour plutôt que d'empiler des versions.
  const { error } = await supabaseAdmin
    .from("parametres_tva")
    .upsert({ ...ligne, created_by: acces.userId ?? null }, { onConflict: "date_debut" });

  if (error) return { error: "Le régime n'a pas pu être enregistré." };

  await tracerEvenement({
    entite: "parametres_tva",
    entiteId: acces.userId ?? "00000000-0000-0000-0000-000000000000",
    evenement: "regime_tva",
    avant: {
      assujettie: avant.assujettie,
      numero: avant.numero,
      methode: avant.methode,
      periodicite: avant.periodicite,
      taux_tdfn_1: avant.tauxTdfn1,
      libelle_secteur_1: avant.libelleSecteur1,
      taux_tdfn_2: avant.tauxTdfn2,
      libelle_secteur_2: avant.libelleSecteur2,
      date_assujettissement: avant.dateAssujettissement,
    },
    apres: ligne,
    userId: acces.userId ?? null,
  });

  revalidatePath("/reglages/tva");
  revalidatePath("/comptabilite/tva");
  return { message: "Régime de TVA enregistré." };
}

/**
 * Le taux et le secteur d'une CATÉGORIE d'articles, appliqués d'un coup.
 *
 * C'est une commodité de départ, pas une fatalité : chaque fiche article garde
 * son taux propre, et le repasser ici ne touche aucune pièce déjà émise — les
 * lignes ont figé le leur.
 */
export async function appliquerCategorie(formData: FormData): Promise<RetourTva> {
  const acces = await verifierAdmin();
  if (acces.error) return { error: "Réservé à l'administratrice." };

  const categorie = txt(formData.get("categorie"));
  const secteur = secteurValide(formData.get("secteur_tdfn"));
  if (!categorie) return { error: "Catégorie inconnue." };
  if (!secteur) return { error: "Choisissez le secteur." };

  const autorises = await tauxLegauxEnVigueur(aujourdhuiISO());
  const brut = formData.get("taux_tva");
  const motif = motifTvaPropre(formData.get("motif_tva"), Number(brut));

  // La liste fermée décide, et le 0 % réclame son motif.
  const refus = refusTauxLegal(brut, { autorises, motif });
  if (refus) return { error: refus };
  const taux = tauxDansLaListe(brut, autorises)!;

  const { data: avant } = await supabaseAdmin
    .from("articles").select("id, taux_tva, secteur_tdfn, motif_tva").eq("categorie", categorie);

  const { error } = await supabaseAdmin
    .from("articles")
    .update({ taux_tva: taux, motif_tva: motif, secteur_tdfn: secteur })
    .eq("categorie", categorie);
  if (error) return { error: "La catégorie n'a pas pu être mise à jour." };

  const anciens = [...new Set(((avant ?? []) as { taux_tva: number | string }[]).map((a) => Number(a.taux_tva)))];

  await tracerEvenement({
    entite: "article",
    entiteId: acces.userId ?? UTILISATEUR_INCONNU,
    evenement: "tva_categorie",
    avant: { categorie, taux_tva: anciens },
    apres: { categorie, taux_tva: taux, motif_tva: motif, secteur_tdfn: secteur, articles: (avant ?? []).length },
    userId: acces.userId ?? null,
  });

  revalidatePath("/reglages/tva");
  revalidatePath("/boutique/articles");
  return { message: `${(avant ?? []).length} article(s) mis à jour.` };
}

/**
 * Le taux d'une PRESTATION : adhésion, abonnement, séjour, journée d'essai…
 *
 * Il s'écrit avec une DATE D'EFFET — aujourd'hui — et l'ancienne ligne reste :
 * les pièces déjà émises gardent leur taux, et une facture de l'an dernier se
 * relit avec le taux de l'an dernier. Un changement ne vaut jamais pour le
 * passé.
 */
export async function appliquerPrestation(formData: FormData): Promise<RetourTva> {
  const acces = await verifierAdmin();
  if (acces.error) return { error: "Réservé à l'administratrice." };

  const code = codePrestationValide(formData.get("code"));
  if (!code) return { error: "Prestation inconnue." };

  const aujourdhui = aujourdhuiISO();
  const autorises = await tauxLegauxEnVigueur(aujourdhui);
  const brut = formData.get("taux_tva");
  const motif = motifTvaPropre(formData.get("motif_tva"), Number(brut));

  const refus = refusTauxLegal(brut, { autorises, motif });
  if (refus) return { error: refus };
  const taux = tauxDansLaListe(brut, autorises)!;

  const avant = await tauxPrestation(code, aujourdhui);
  if (avant.taux === taux && (avant.motif ?? "") === (motif ?? "")) {
    return { message: "Ce taux est déjà celui en vigueur." };
  }

  // Une seule ligne par date d'effet : rechanger d'avis le même jour corrige
  // la saisie du jour plutôt que d'empiler des versions.
  const { error } = await supabaseAdmin.from("taux_prestation").upsert(
    { code, date_debut: aujourdhui, taux, motif_exonere: motif, created_by: acces.userId ?? null },
    { onConflict: "code,date_debut" }
  );
  if (error) return { error: "Le taux n'a pas pu être enregistré." };

  await tracerEvenement({
    entite: "parametres_tva",
    entiteId: acces.userId ?? UTILISATEUR_INCONNU,
    evenement: "tva_prestation",
    avant: { code, taux: avant.taux, motif: avant.motif, depuis: avant.dateDebut },
    apres: { code, taux, motif, depuis: aujourdhui },
    userId: acces.userId ?? null,
  });

  revalidatePath("/reglages/tva");
  return {
    message: `${libellePrestation(code)} : ${String(taux).replace(".", ",")} % à partir du ${aujourdhui}. ` +
      "Les pièces déjà émises ne bougent pas.",
  };
}
