import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import React from "react";
import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { deposerDocument } from "@/src/lib/depotImage";
import { getCoordonneesPaiement } from "@/src/lib/coordonneesPaiement";
import { lireParametresTva, affichage } from "@/src/lib/tva";
import { piedTva, ventilerPanier, type LigneVentilable } from "@/src/lib/tvaLogique";
import { genererQrBillSvg } from "@/src/lib/qrFacture";
import { FacturePdf, type LignePdf } from "@/src/lib/facturePdf";
import { montantsDuDocument, type AcompteRattache } from "@/src/lib/factureMontantsDocument";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { detailsConfigurationFacture } from "@/src/lib/personnalisation";

export const BUCKET_FACTURES = "factures";

type LigneBase = {
  ordre?: number | string;
  libelle: string;
  quantite: number | string;
  prix_unitaire: number | string;
  montant: number | string;
  /** La remise figée à la ligne (APP 16). Absente : la ligne est au prix plein. */
  prix_base?: number | string | null;
  remise_libelle?: string | null;
};

async function lireParametres(cles: string[]): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin.from("parametres").select("cle, valeur").in("cle", cles);
  const map: Record<string, string> = {};
  for (const r of (data ?? []) as { cle: string; valeur: string }[]) map[r.cle] = (r.valeur ?? "").trim();
  return map;
}

/**
 * Le logo du document, à la taille où il s'imprime.
 *
 * Il s'affiche sur 74 points de côté, soit un peu plus d'un pouce. Le fichier
 * source en fait 1254 : @react-pdf embarque les pixels TELS QU'ILS SONT, sans
 * jamais les réduire à la taille d'affichage — d'où 1,11 Mo de données d'image
 * dans un PDF qui n'a qu'une page de texte, et 96 % du poids du fichier pour
 * un carré d'un pouce.
 *
 * 320 pixels donnent 311 points par pouce à l'impression : au-delà de ce que
 * distingue une imprimante de bureau, et quatre fois la définition d'un écran.
 * La transparence est conservée — le fond du logo n'est pas blanc, il est
 * transparent, et un JPEG (qui n'a pas de couche alpha) le poserait sur du
 * noir.
 *
 * Lu et réduit une seule fois : le résultat sert à toutes les factures émises
 * par ce processus.
 */
const COTE_LOGO_PDF = 320;
let logoCache: string | null | undefined;

async function logoDataUri(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const fichier = path.join(process.cwd(), "public", "Logo.png");
    const buf = await readFile(fichier);
    const reduit = await sharp(buf)
      .resize(COTE_LOGO_PDF, COTE_LOGO_PDF, { fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    logoCache = `data:image/png;base64,${reduit.toString("base64")}`;
  } catch {
    logoCache = null;
  }
  return logoCache;
}

export type DonneesFacturePdf = {
  numero: string;
  type: string;
  exercice: number;
  clientEmail: string | null;
  clientPrenom: string | null;
};

/**
 * Génère le PDF d'une facture émise, le dépose dans le bucket privé et
 * enregistre son chemin et son empreinte. Un PDF déjà généré n'est JAMAIS
 * régénéré : c'est la pièce, elle ne bouge plus.
 */
export async function genererPdfFacture(
  factureId: string,
  userId?: string | null,
): Promise<DonneesFacturePdf | null> {
  const { data: f } = await supabaseAdmin
    .from("factures")
    .select(`
      id, numero, type, statut, date_facture, date_echeance, motif, exercice,
      montant_total, montant_paye, montant_restant, reference_qr, pdf_path,
      clients (prenom, nom, adresse, email)
    `)
    .eq("id", factureId)
    .maybeSingle();
  if (!f || !f.numero) return null;

  const client = f.clients as unknown as
    { prenom?: string; nom?: string; adresse?: string; email?: string } | null;
  const infos: DonneesFacturePdf = {
    numero: f.numero as string,
    type: (f.type as string) ?? "facture",
    exercice: (f.exercice as number) ?? new Date().getFullYear(),
    clientEmail: client?.email ?? null,
    clientPrenom: client?.prenom ?? null,
  };

  // Déjà généré : on ne le refait pas.
  if (f.pdf_path) return infos;

  const { data: lignesDb } = await supabaseAdmin
    .from("facture_lignes")
    .select("ordre, libelle, quantite, prix_unitaire, montant, taux_tva, motif_tva, prix_base, remise_libelle")
    .eq("facture_id", factureId)
    .order("ordre");

  // Un article sur mesure dit ses choix, sur une seule ligne sous la désignation.
  const details = await detailsConfigurationFacture(
    factureId,
    ((lignesDb ?? []) as LigneBase[]).map((l) => ({ ordre: l.ordre ?? 0, libelle: l.libelle })),
  );

  const lignes: LignePdf[] = ((lignesDb ?? []) as LigneBase[]).map((l) => ({
    libelle: l.libelle,
    detail: details.get(Number(l.ordre)) ?? null,
    quantite: Number(l.quantite),
    prix_unitaire: Number(l.prix_unitaire),
    montant: Number(l.montant),
    // Relue, jamais recalculée : une action terminée depuis ne change rien à
    // une facture déjà émise.
    prix_base: l.prix_base === null || l.prix_base === undefined ? null : Number(l.prix_base),
    remise_libelle: l.remise_libelle ?? null,
  }));

  const dateFacture = (f.date_facture as string) ?? null;

  const [coords, regime, params, logo] = await Promise.all([
    // La date de la pièce, pas celle du jour : un avoir de février porte
    // l identité de février, la facture de novembre celle de novembre.
    getCoordonneesPaiement(supabaseAdmin, (f.date_facture as string) ?? null),
    // Le régime EN VIGUEUR à la date de la pièce : une facture de l'an dernier
    // ne se relit pas avec le régime d'aujourd'hui.
    lireParametresTva(dateFacture),
    lireParametres(["delai_paiement_jours"]),
    logoDataUri(),
  ]);

  // La ventilation se lit sur les LIGNES, qui portent chacune leur taux figé.
  // Rien n'est recalculé : le port et la remise d'une commande en ligne ont
  // déjà été ventilés à l'émission, et ce sont des lignes comme les autres.
  const tva = piedTva(
    affichage(regime),
    ventilerPanier({ lignes: (lignesDb ?? []) as unknown as LigneVentilable[] }),
    dateFacture,
    ((lignesDb ?? []) as unknown as { motif_tva: string | null }[]).map((l) => l.motif_tva)
  );

  // Acomptes imputés : la même règle que la comptabilité, pour que le document
  // et le grand livre disent le même chiffre. Les acomptes versés sur la
  // réservation et rattachés à l'émission s'impriment un par un, avec leur date.
  const [{ data: acomptesRpc }, { data: rattachements }] = await Promise.all([
    supabaseAdmin.rpc("acomptes_a_imputer", { p_facture_id: factureId }),
    supabaseAdmin.from("paiements_resa").select("date_paiement, montant")
      .eq("facture_id", factureId).eq("mode", "rattachement"),
  ]);

  const total = Number(f.montant_total ?? 0);
  const montants = montantsDuDocument({
    type: (f.type as string) ?? "facture",
    total,
    montantPaye: Number(f.montant_paye ?? 0),
    montantRestant: f.montant_restant === null || f.montant_restant === undefined ? null : Number(f.montant_restant),
    acomptesImputes: Number(acomptesRpc ?? 0),
    rattachements: (rattachements ?? []) as AcompteRattache[],
  });

  const nomClient = `${client?.prenom ?? ""} ${client?.nom ?? ""}`.trim() || "Client";
  const adresseClient = (client?.adresse ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

  // Bulletin QR : avec le débiteur, et le RESTE — jamais le total. Rien à
  // verser, pas de bulletin.
  const bulletinSvg = montants.montantQr === null ? null : genererQrBillSvg({
    iban: coords.iban,
    titulaire: coords.titulaire,
    adresse: coords.adresse,
    montant: montants.montantQr,
    numeroFacture: f.numero as string,
    referenceStockee: (f.reference_qr as string) ?? null,
    debiteur: adresseClient.length > 0 ? { nom: nomClient, adresse: adresseClient } : null,
  });

  // Non assujettie : aucun numéro, aucune ventilation, et une phrase qui dit
  // pourquoi. Laisser entendre une TVA qu'on ne verse pas serait une faute
  // lourde — plus grave que de ne rien dire.
  // Le numéro de TVA suit l identité de la pièce, pas le réglage du jour.
  const numeroTva = coords.entite.numeroTva ?? tva?.numero ?? null;
  const mentionTva = numeroTva
    ? `N° TVA : ${numeroTva}`
    : "TVA non applicable — entreprise non assujettie (art. 10 LTVA).";

  const element = React.createElement(FacturePdf, {
    numero: f.numero as string,
    type: (f.type as string) ?? "facture",
    dateFacture: (f.date_facture as string) ?? "",
    dateEcheance: (f.date_echeance as string) ?? null,
    motif: (f.motif as string) ?? null,
    client: { nom: nomClient, adresse: adresseClient },
    emetteur: {
      nom: coords.titulaire,
      adresse: [
        [coords.adresse.rue, coords.adresse.numero].filter(Boolean).join(" "),
        [coords.adresse.npa, coords.adresse.ville].filter(Boolean).join(" "),
      ].filter(Boolean),
      email: coords.entite.email ?? "",
      telephone: coords.entite.telephone ?? "",
      ide: coords.entite.ide ?? "",
      mentionTva,
    },
    lignes,
    total,
    acomptesRecus: montants.acomptesRecus,
    acomptes: montants.acomptes,
    dejaPaye: montants.dejaPaye,
    reste: montants.reste,
    mentionReglee: montants.mentionReglee,
    delaiJours: parseInt(params.delai_paiement_jours || "30", 10) || 30,
    tva,
    logo,
    bulletinSvg,
  });

  const { renderToBuffer } = await import("@react-pdf/renderer");
  // Les types de renderToBuffer attendent un DocumentProps ; FacturePdf REND un
  // <Document>, mais TypeScript ne le voit pas à travers le composant.
  const buffer = await renderToBuffer(element as unknown as Parameters<typeof renderToBuffer>[0]);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const chemin = `${infos.exercice}/${f.numero}.pdf`;

  // Tout dépôt passe par la porte commune — ici celle des PDF, qui ne se
  // convertissent pas. Un fichier déjà présent n'est pas une erreur : le PDF
  // d'une facture est immuable.
  const depot = await deposerDocument({
    bucket: BUCKET_FACTURES,
    chemin,
    octets: buffer,
    type: "application/pdf",
    siDejaPresent: "garder",
  });
  if (!depot.ok) throw new Error(depot.error);

  await supabaseAdmin
    .from("factures")
    .update({ pdf_path: chemin, pdf_sha256: sha256 })
    .eq("id", factureId);

  await tracerEvenement({
    entite: "facture", entiteId: factureId, evenement: "pdf",
    apres: { chemin, sha256 },
    userId: userId ?? null,
  });

  return infos;
}

/** URL signée de courte durée vers le PDF stocké (aperçu et téléchargement). */
export async function urlSigneePdf(factureId: string, secondes = 120): Promise<string | null> {
  const { data: f } = await supabaseAdmin
    .from("factures").select("pdf_path").eq("id", factureId).maybeSingle();
  if (!f?.pdf_path) return null;

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_FACTURES)
    .createSignedUrl(f.pdf_path as string, secondes);
  if (error) {
    Sentry.captureException(error);
    return null;
  }
  return data?.signedUrl ?? null;
}

/**
 * Ce que dit la lecture d'un PDF stocké.
 *
 * Trois états, parce qu'un `null` qui veut dire deux choses ne permet à
 * personne de réagir correctement :
 *
 *   • `aucun_chemin` — la facture n'a pas de document. Ce n'est pas un
 *     incident : il n'y en a jamais eu. On peut en fabriquer un.
 *   • `illisible` — le chemin est écrit, l'objet n'est plus là. C'est une
 *     PERTE, et elle ne se répare pas en refabriquant : le document
 *     reconstruit différerait de celui que la cliente détient, et l'écriture
 *     de son empreinte écraserait `pdf_sha256`, seule trace de l'original.
 *   • `present` — les octets.
 */
export type LecturePdf =
  | { etat: "present"; octets: Buffer }
  | { etat: "aucun_chemin" }
  | { etat: "illisible"; raison: string };

export async function lirePdfFacture(factureId: string): Promise<LecturePdf> {
  const { data: f } = await supabaseAdmin
    .from("factures").select("pdf_path, numero").eq("id", factureId).maybeSingle();
  if (!f?.pdf_path) return { etat: "aucun_chemin" };

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_FACTURES)
    .download(f.pdf_path as string);

  if (error || !data) {
    const raison = error?.message ?? "objet absent du stockage";
    // Un objet perdu dans le bucket est une anomalie de conservation. Elle se
    // dit ici, au seul endroit qui la constate.
    Sentry.captureMessage("Document de facture illisible dans le stockage", {
      level: "error",
      tags: { endroit: "factureDocument.lirePdfFacture" },
      extra: { numero: (f.numero as string) ?? null, chemin: f.pdf_path, raison },
    });
    return { etat: "illisible", raison };
  }
  return { etat: "present", octets: Buffer.from(await data.arrayBuffer()) };
}

/**
 * Après l'émission : le PDF, son dépôt dans le bucket, et la trace au journal.
 *
 * Plus AUCUN e-mail ici. Une facture émise part le lendemain matin si elle est
 * encore impayée (cf. le cron quotidien), ou à la main depuis l'écran. Envoyer
 * à l'émission faisait partir une facture que le client venait souvent de
 * régler au comptoir, et doublait l'e-mail de confirmation d'une commande.
 *
 * Le nom reste : finaliser une émission, c'est en produire le document. Il n'a
 * jamais promis d'envoi. Ne throw jamais — une facture émise reste émise même
 * si le PDF manque ; l'écran permet de le régénérer.
 */
export async function finaliserEmission(
  factureId: string,
  userId?: string | null,
): Promise<{ error?: string }> {
  try {
    await genererPdfFacture(factureId, userId);
  } catch (e) {
    Sentry.captureException(e);
    console.error("finalisation emission facture:", e);
    return { error: MESSAGE_DOCUMENT_ABSENT };
  }

  // La génération peut échouer SANS lever : facture introuvable, dépôt refusé
  // en amont. Le seul fait qui compte est celui-ci — le chemin est-il écrit ?
  const { data } = await supabaseAdmin
    .from("factures").select("pdf_path").eq("id", factureId).maybeSingle();
  if (!data?.pdf_path) return { error: MESSAGE_DOCUMENT_ABSENT };
  return {};
}

/**
 * Ce qu'on dit quand le document manque.
 *
 * Deux choses vraies, et les deux comptent : la facture EST émise et porte son
 * numéro — on ne peut pas revenir en arrière, la numérotation doit rester
 * continue — et le document n'existe pas encore. Tant qu'il n'existe pas,
 * l'envoyer au client ferait partir un e-mail SANS la facture jointe.
 */
export const MESSAGE_DOCUMENT_ABSENT =
  "La facture est émise et porte son numéro, mais son document PDF n'a pas pu être créé. " +
  "Elle ne peut pas être envoyée au client tant qu'il manque. Réessayez : " +
  "le document sera fabriqué, et la tâche de nuit s'en charge sinon.";

/**
 * La facture est arrivée chez le client : on le note, une fois pour toutes.
 *
 * Appelée APRÈS un envoi réussi, et seulement là. `email_envoye_le` est ce que
 * l'envoi du matin regarde : une facture qui le porte ne repart jamais d'elle-
 * même. `exclureAuto` ferme la porte définitivement — c'est le cas d'une
 * commande en ligne dont le PDF est parti avec la confirmation.
 */
export async function marquerFactureEnvoyee(
  factureId: string,
  options: {
    destinataire: string;
    userId?: string | null;
    exclureAuto?: boolean;
    /** Par où l'envoi est passé, pour le journal. */
    via?: string;
  },
): Promise<void> {
  const maj: Record<string, unknown> = { email_envoye_le: new Date().toISOString() };
  if (options.exclureAuto) maj.envoi_auto_exclu = true;
  await supabaseAdmin.from("factures").update(maj).eq("id", factureId);

  await tracerEvenement({
    entite: "facture", entiteId: factureId, evenement: "envoi",
    apres: { destinataire: options.destinataire, via: options.via ?? "manuel" },
    userId: options.userId ?? null,
  });
}

/**
 * Envoie (ou renvoie) la facture par e-mail, PDF joint.
 *
 * Un envoi réussi pose `email_envoye_le`. Un envoi qui échoue ne pose rien :
 * la facture reste « jamais arrivée », et l'envoi du matin la reprendra si elle
 * est encore impayée.
 */
export async function envoyerFactureParEmail(
  factureId: string,
  userId?: string | null,
  options: { via?: string } = {},
): Promise<{ error?: string }> {
  const { data: f } = await supabaseAdmin
    .from("factures")
    .select("id, numero, date_facture, date_echeance, montant_total, montant_restant, clients (prenom, email)")
    .eq("id", factureId)
    .maybeSingle();
  if (!f?.numero) return { error: "Facture non émise." };

  const client = f.clients as unknown as { prenom?: string; email?: string } | null;
  if (!client?.email) return { error: "Ce client n'a pas d'adresse e-mail." };

  const { envoyerEmailFactureEmise } = await import("@/src/lib/email");
  let lecture = await lirePdfFacture(factureId);

  // Le PDF est JOINT à l'e-mail. Sans lui, le client recevait une annonce de
  // facture sans facture — et l'envoi était marqué fait, donc jamais repris.
  //
  // On ne fabrique QUE si rien n'a jamais existé. Sur un document perdu, on
  // refuse d'envoyer plutôt que d'envoyer une reconstruction : la cliente
  // comparerait deux pièces différentes portant le même numéro.
  if (lecture.etat === "aucun_chemin") {
    await finaliserEmission(factureId, userId ?? null);
    lecture = await lirePdfFacture(factureId);
  }
  const pdf = lecture.etat === "present" ? lecture.octets : null;
  if (!pdf) {
    // L'envoi du matin inscrit cet échec au journal et retentera demain :
    // `email_envoye_le` n'est posé qu'après un envoi réussi.
    return { error: "Le document de la facture est introuvable : rien n'a été envoyé." };
  }

  try {
    await envoyerEmailFactureEmise({
      email: client.email,
      prenom: client.prenom ?? "Client",
      numero: f.numero as string,
      date: (f.date_facture as string) ?? "",
      echeance: (f.date_echeance as string) ?? (f.date_facture as string) ?? "",
      montant: Number(f.montant_total ?? 0),
      pdf,
    });
  } catch (e) {
    Sentry.captureException(e);
    return { error: "L'envoi de l'e-mail a échoué." };
  }

  await marquerFactureEnvoyee(factureId, {
    destinataire: client.email,
    userId: userId ?? null,
    via: options.via,
  });
  return {};
}
