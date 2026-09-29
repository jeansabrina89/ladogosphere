"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { aujourdhuiISO } from "@/src/lib/dates";
import { entiteCourante } from "@/src/lib/entiteJuridique";
import {
  formeJuridique,
  normaliserIde,
  refusDateChangement,
  refusRaisonSociale,
  veille,
} from "@/src/lib/entiteJuridiqueLogique";
import {
  CLE_DATE_OUVERTURE,
  dateOuvertureUtilisable,
  dateOuvertureValide,
} from "@/src/lib/ouvertureLogique";
import {
  CLES_HORAIRES,
  LIBELLES_HORAIRES,
  refusHoraire,
  type Horaires,
} from "@/src/lib/horaires";
import {
  CLES_VERSIONS_CONDITIONS,
  refusVersionConditions,
} from "@/src/lib/acceptationsConditionsLogique";

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
    // Le nom du titulaire n'existe qu'en raison individuelle : la base refuse
    // qu'une société en porte un, et l'écran ne le demande pas.
    titulaire_nom:
      formeJuridique(String(formData.get("forme") ?? "")) === "raison_individuelle"
        ? String(formData.get("titulaire_nom") ?? "").trim() || null
        : null,
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

function refusIdentite(valeurs: ReturnType<typeof champs>): string | null {
  const refus = refusRaisonSociale({
    forme: valeurs.forme,
    raisonSociale: valeurs.raison_sociale,
    titulaireNom: valeurs.titulaire_nom,
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
  const refus = refusIdentite(valeurs);
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
  const refus = refusIdentite(valeurs);
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

/**
 * APP 56 — la date d'ouverture de la pension et de la boutique en ligne.
 *
 * Elle vit dans `parametres`, sous `date_ouverture`, et nulle part ailleurs :
 * elle a déjà changé une fois (15 octobre 2026 → 1er mars 2027), et écrite en
 * dur elle se serait retrouvée dans un bandeau, un refus serveur, un
 * avertissement et un panier — quatre endroits à retrouver, dont un resterait
 * en arrière sans que rien ne le dise.
 *
 * Elle est ici, dans l'écran Entreprise, parce que c'est une décision de la
 * maison, pas un réglage de boutique : elle ferme AUSSI les réservations.
 *
 * Vider le champ est le geste normal du jour de l'ouverture : la valeur vide
 * veut dire « aucune restriction », et tout redevient normal sans toucher au
 * code. La table n'accepte pas de valeur nulle : on écrit la chaîne vide.
 */
export async function enregistrerDateOuverture(formData: FormData): Promise<Resultat> {
  const acces = await exigerAdminPage();

  const saisie = String(formData.get("date_ouverture") ?? "").trim();
  if (!dateOuvertureValide(saisie)) {
    return { error: "Indiquez une date valide (JJ.MM.AAAA), ou laissez vide." };
  }
  const valeur = saisie === "" ? "" : dateOuvertureUtilisable(saisie);

  const { data: avant } = await supabaseAdmin
    .from("parametres").select("valeur").eq("cle", CLE_DATE_OUVERTURE).maybeSingle();

  const { data: ligne, error } = await supabaseAdmin
    .from("parametres")
    .upsert(
      { cle: CLE_DATE_OUVERTURE, valeur, updated_at: new Date().toISOString() },
      { onConflict: "cle" },
    )
    .select("id")
    .single();
  if (error || !ligne) return { error: error?.message ?? "Enregistrement impossible." };

  await tracerEvenement({
    entite: "parametre",
    entiteId: ligne.id as string,
    evenement: "date_ouverture",
    avant: { valeur: (avant?.valeur as string | null) ?? "" },
    apres: { valeur },
    userId: acces.userId ?? null,
  });

  // Tout ce qui lit la date : le tunnel, le panier, le formulaire du personnel.
  revalidatePath("/reglages/entreprise");
  revalidatePath("/mon-compte/reservations/nouvelle");
  revalidatePath("/catalogue/panier");
  revalidatePath("/reservations/nouvelle");

  return { ok: true };
}

/**
 * APP 59 — les horaires d'accueil.
 *
 * Cinq réglages posés ensemble : ils se lisent ensemble, ils se corrigent
 * ensemble. En enregistrer trois puis refuser le quatrième laisserait des
 * horaires à moitié changés, et les e-mails annonceraient un mélange des deux.
 * La validation passe donc AVANT toute écriture.
 */
export async function enregistrerHoraires(
  formData: FormData,
): Promise<Resultat & { champ?: string }> {
  const acces = await exigerAdminPage();

  const saisie = {} as Record<keyof Horaires, string>;
  for (const { cle, libelle } of LIBELLES_HORAIRES) {
    const valeur = String(formData.get(cle) ?? "").trim();
    const refus = refusHoraire(valeur);
    if (refus) return { error: `${libelle} : ${refus}`, champ: cle };
    saisie[cle] = valeur;
  }

  for (const { cle } of LIBELLES_HORAIRES) {
    const cleBase = CLES_HORAIRES[cle];
    const { data: avant } = await supabaseAdmin
      .from("parametres").select("valeur").eq("cle", cleBase).maybeSingle();

    const { data: ligne, error } = await supabaseAdmin
      .from("parametres")
      .upsert({ cle: cleBase, valeur: saisie[cle], updated_at: new Date().toISOString() },
              { onConflict: "cle" })
      .select("id")
      .single();
    if (error || !ligne) return { error: error?.message ?? "Enregistrement impossible." };

    const ancienne = (avant?.valeur as string | null) ?? "";
    if (ancienne !== saisie[cle]) {
      await tracerEvenement({
        entite: "parametre",
        entiteId: ligne.id as string,
        evenement: cleBase,
        avant: { valeur: ancienne },
        apres: { valeur: saisie[cle] },
        userId: acces.userId ?? null,
      });
    }
  }

  // Tout ce qui lit les horaires : les e-mails partent à la demande, mais les
  // écrans se rendent une fois.
  revalidatePath("/reglages/entreprise");
  revalidatePath("/reservations/nouvelle");
  revalidatePath("/mon-compte/reservations/nouvelle");

  return { ok: true };
}

/**
 * APP 59 — les versions des conditions.
 *
 * Deux dates, posées ensemble et validées avant toute écriture : enregistrer
 * l'une puis refuser l'autre laisserait les deux documents en désaccord, et
 * c'est précisément le désaccord que ce réglage sert à éviter.
 */
export async function enregistrerVersionsConditions(formData: FormData): Promise<Resultat> {
  const acces = await exigerAdminPage();

  const saisie: Record<string, string> = {};
  for (const [champ, cle] of Object.entries(CLES_VERSIONS_CONDITIONS)) {
    const valeur = String(formData.get(cle) ?? "").trim();
    const refus = refusVersionConditions(valeur);
    if (refus) return { error: `${champ === "pension" ? "Conditions de la pension" : "Conditions de vente"} : ${refus}` };
    saisie[cle] = valeur;
  }

  for (const cle of Object.values(CLES_VERSIONS_CONDITIONS)) {
    const { data: avant } = await supabaseAdmin
      .from("parametres").select("valeur").eq("cle", cle).maybeSingle();

    const { data: ligne, error } = await supabaseAdmin
      .from("parametres")
      .upsert({ cle, valeur: saisie[cle], updated_at: new Date().toISOString() }, { onConflict: "cle" })
      .select("id")
      .single();
    if (error || !ligne) return { error: error?.message ?? "Enregistrement impossible." };

    const ancienne = (avant?.valeur as string | null) ?? "";
    if (ancienne !== saisie[cle]) {
      await tracerEvenement({
        entite: "parametre",
        entiteId: ligne.id as string,
        evenement: cle,
        avant: { valeur: ancienne },
        apres: { valeur: saisie[cle] },
        userId: acces.userId ?? null,
      });
    }
  }

  revalidatePath("/reglages/entreprise");
  return { ok: true };
}
