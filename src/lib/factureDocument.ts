import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import React from "react";
import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { getCoordonneesPaiement } from "@/src/lib/coordonneesPaiement";
import { lireParametresTva, affichage } from "@/src/lib/tva";
import { piedTva, ventilerPanier, type LigneVentilable } from "@/src/lib/tvaLogique";
import { genererQrBillSvg } from "@/src/lib/qrFacture";
import { FacturePdf, type LignePdf } from "@/src/lib/facturePdf";
import { tracerEvenement } from "@/src/lib/journalEvenements";

export const BUCKET_FACTURES = "factures";

type LigneBase = {
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

/** Le logo est embarqué en data URI : @react-pdf ne va pas chercher sur le réseau. */
async function logoDataUri(): Promise<string | null> {
  try {
    const fichier = path.join(process.cwd(), "public", "Logo.png");
    const buf = await readFile(fichier);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
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
export async function genererPdfFacture(factureId: string): Promise<DonneesFacturePdf | null> {
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
    .select("libelle, quantite, prix_unitaire, montant, taux_tva, motif_tva, prix_base, remise_libelle")
    .eq("facture_id", factureId)
    .order("ordre");

  const lignes: LignePdf[] = ((lignesDb ?? []) as LigneBase[]).map((l) => ({
    libelle: l.libelle,
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
  // et le grand livre disent le même chiffre.
  const { data: acomptesRpc } = await supabaseAdmin
    .rpc("acomptes_a_imputer", { p_facture_id: factureId });
  let acomptes = Math.round(Number(acomptesRpc ?? 0) * 100) / 100;

  const total = Number(f.montant_total ?? 0);
  const dejaPaye = Number(f.montant_paye ?? 0);
  acomptes = Math.min(Math.max(acomptes, 0), total);

  const nomClient = `${client?.prenom ?? ""} ${client?.nom ?? ""}`.trim() || "Client";
  const adresseClient = (client?.adresse ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

  // Bulletin QR : avec le débiteur, cette fois.
  const bulletinSvg = f.type === "avoir" ? null : genererQrBillSvg({
    iban: coords.iban,
    titulaire: coords.titulaire,
    adresse: coords.adresse,
    montant: Math.max(Number(f.montant_restant ?? total), 0),
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
    acomptes,
    dejaPaye: Math.max(dejaPaye - acomptes, 0),
    reste: Number(f.montant_restant ?? total),
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

  const { error: erreurDepot } = await supabaseAdmin.storage
    .from(BUCKET_FACTURES)
    .upload(chemin, buffer, { contentType: "application/pdf", upsert: false });

  // Un fichier déjà présent n'est pas une erreur : le PDF est immuable.
  if (erreurDepot && !/exists/i.test(erreurDepot.message)) throw erreurDepot;

  await supabaseAdmin
    .from("factures")
    .update({ pdf_path: chemin, pdf_sha256: sha256 })
    .eq("id", factureId);

  await tracerEvenement({
    entite: "facture", entiteId: factureId, evenement: "pdf",
    apres: { chemin, sha256 },
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

/** Contenu du PDF stocké, pour la pièce jointe d'un e-mail. */
export async function telechargerPdf(factureId: string): Promise<Buffer | null> {
  const { data: f } = await supabaseAdmin
    .from("factures").select("pdf_path").eq("id", factureId).maybeSingle();
  if (!f?.pdf_path) return null;

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_FACTURES)
    .download(f.pdf_path as string);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Après l'émission : PDF, dépôt dans le bucket, e-mail au client avec la pièce
 * jointe, et trace dans le journal. Ne throw jamais — une facture émise reste
 * émise même si l'envoi échoue ; le bouton « Renvoyer par e-mail » rattrape.
 */
export async function finaliserEmission(
  factureId: string,
  userId?: string | null,
): Promise<void> {
  try {
    const infos = await genererPdfFacture(factureId);
    if (!infos) return;
    if (infos.type === "avoir") return; // l'avoir a son propre envoi
    await envoyerFactureParEmail(factureId, userId);
  } catch (e) {
    Sentry.captureException(e);
    console.error("finalisation emission facture:", e);
  }
}

/** Envoie (ou renvoie) la facture par e-mail, PDF joint. */
export async function envoyerFactureParEmail(
  factureId: string,
  userId?: string | null,
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
  const pdf = await telechargerPdf(factureId);

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

  await tracerEvenement({
    entite: "facture", entiteId: factureId, evenement: "envoi",
    apres: { destinataire: client.email }, userId: userId ?? null,
  });
  return {};
}
