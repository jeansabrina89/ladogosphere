import {
  VERSION_CONDITIONS_PENSION,
  VERSION_CONDITIONS_VENTE,
} from "@/src/lib/liensLegaux";

/**
 * L'acceptation des conditions : les règles, sans la base (APP 42).
 *
 * ── POURQUOI ON GARDE CETTE TRACE ─────────────────────────────────────────
 *
 * Les conditions vivent sur le site, et rien ne disait qui les avait acceptées.
 * Le jour d'un désaccord — un chien rendu plus tôt, une commande contestée — il
 * n'y aurait eu que la parole de chacun. On garde donc QUI, QUOI, QUAND, et
 * DANS QUELLE VERSION.
 *
 * ── CE QUI NE BLOQUE JAMAIS ───────────────────────────────────────────────
 *
 * Le personnel. Sabrina prend une réservation au téléphone pendant qu'un chien
 * aboie : lui refuser l'enregistrement parce qu'un papier n'est pas signé
 * l'obligerait à contourner l'outil, et la trace serait perdue pour de bon. On
 * l'AVERTIT, elle fait signer à l'arrivée. Une version périmée n'arrête rien
 * non plus : elle se signale, elle ne barre pas la route.
 */

export type DocumentConditions = "pension" | "vente";
export type ModeAcceptation = "en_ligne" | "papier";

export type Acceptation = {
  document: string;
  version: string;
  acceptee_le: string;
  mode: string;
  /** Les initiales de qui a saisi le papier. Vide en ligne. */
  saisiePar?: string | null;
};

/** La version en vigueur d'un document. Une seule source : liensLegaux. */
export function versionCourante(document: DocumentConditions): string {
  return document === "pension" ? VERSION_CONDITIONS_PENSION : VERSION_CONDITIONS_VENTE;
}

// ── Les textes, écrits une fois ────────────────────────────────────────────

export const CASE_CONDITIONS_PENSION = "J'ai lu et j'accepte les conditions de la pension.";
export const CASE_CONDITIONS_VENTE = "J'ai lu et j'accepte les conditions de vente.";

/** Le mot qui porte le lien, dans chaque case. */
export const LIEN_CASE_PENSION = "conditions de la pension";
export const LIEN_CASE_VENTE = "conditions de vente";

export const REFUS_CONDITIONS_PENSION = "Veuillez accepter les conditions de la pension.";
export const REFUS_CONDITIONS_VENTE = "Veuillez accepter les conditions de vente.";

/** Ce que le personnel lit quand rien n'a jamais été signé. */
export const ALERTE_JAMAIS_SIGNEES =
  "Conditions de la pension pas encore signées : à faire signer à l'arrivée.";

/** Ce qu'il lit quand une version plus ancienne a été acceptée. */
export function alerteAncienneVersion(version: string): string {
  return `Conditions acceptées dans une ancienne version (du ${formatVersion(version)}).`;
}

/** « 2026-09-29 » → « 29.09.2026 ». La forme que Sabrina lit partout. */
export function formatVersion(version: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((version ?? "").trim());
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (version ?? "");
}

// ── L'état d'un client, face à un document ─────────────────────────────────

export type EtatConditions =
  | { etat: "jamais" }
  | { etat: "ancienne"; acceptation: Acceptation }
  | { etat: "a_jour"; acceptation: Acceptation };

/**
 * Où en est ce client pour ce document.
 *
 * La DERNIÈRE acceptation fait foi, jamais la plus ancienne : un client qui a
 * signé le papier en 2025 puis coché la case en 2026 est à jour.
 */
export function etatConditions(
  acceptations: readonly Acceptation[],
  document: DocumentConditions,
): EtatConditions {
  const pourCeDocument = acceptations
    .filter((a) => a.document === document)
    .sort((a, b) => String(b.acceptee_le).localeCompare(String(a.acceptee_le)));

  const derniere = pourCeDocument[0];
  if (!derniere) return { etat: "jamais" };
  return derniere.version === versionCourante(document)
    ? { etat: "a_jour", acceptation: derniere }
    : { etat: "ancienne", acceptation: derniere };
}

/** Le repère à montrer au personnel, ou rien si tout va bien. */
export function repereConditions(
  acceptations: readonly Acceptation[],
  document: DocumentConditions = "pension",
): string | null {
  const e = etatConditions(acceptations, document);
  if (e.etat === "jamais") return ALERTE_JAMAIS_SIGNEES;
  if (e.etat === "ancienne") return alerteAncienneVersion(e.acceptation.version);
  return null;
}

/** La ligne lue par le CLIENT dans « Mes informations ». Rien si jamais accepté. */
export function ligneAcceptationClient(
  acceptations: readonly Acceptation[],
  document: DocumentConditions,
): string | null {
  const e = etatConditions(acceptations, document);
  if (e.etat === "jamais") return null;
  const quoi = document === "pension" ? "Conditions de la pension" : "Conditions de vente";
  const quand = formatDateAcceptation(e.acceptation.acceptee_le);
  return `${quoi} acceptées le ${quand} (version du ${formatVersion(e.acceptation.version)})`;
}

/** « 2026-09-29T08:12:00Z » → « 29.09.2026 ». */
export function formatDateAcceptation(iso: string): string {
  return formatVersion(String(iso ?? "").slice(0, 10));
}

/** Ce que le PERSONNEL lit sur la fiche client, pour un document. */
export function resumeAcceptationPersonnel(
  acceptations: readonly Acceptation[],
  document: DocumentConditions,
): string {
  const e = etatConditions(acceptations, document);
  if (e.etat === "jamais") return "Jamais acceptées";

  const a = e.acceptation;
  const par = a.mode === "papier"
    ? `sur papier${a.saisiePar ? `, saisi par ${a.saisiePar}` : ""}`
    : "en ligne";
  const vieille = e.etat === "ancienne" ? " — ancienne version" : "";
  return `Le ${formatDateAcceptation(a.acceptee_le)} (version du ${formatVersion(a.version)}), ${par}${vieille}`;
}
