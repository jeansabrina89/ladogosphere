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

/**
 * Les versions en vigueur, réglées dans Réglages → Entreprise (APP 59).
 *
 * Elles étaient deux constantes de `liensLegaux.ts`, et il fallait un lot pour
 * reporter une date que Sabrina change sur le site quand elle veut. Entre les
 * deux, les clientes acceptaient sous l'ancien numéro sans que rien ne le dise.
 *
 * Elles sont PASSÉES EN ARGUMENT plutôt que lues ici : ce module est pur, et
 * c'est ce qui permet de l'éprouver sans base. L'appelant les lit une fois.
 */
export type VersionsConditions = { pension: string; vente: string };

export const CLES_VERSIONS_CONDITIONS = {
  pension: "conditions_pension_version",
  vente: "conditions_vente_version",
} as const;

/** Les versions relevées sur le site le 29.09.2026. */
export const VERSIONS_CONDITIONS_DEFAUT: VersionsConditions = {
  pension: "2026-09-29",
  vente: "2026-09-29",
};

const VERSION_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Une date ISO, ou "" : une version illisible ne vaut pas mieux qu'aucune. */
export function versionUtilisable(valeur: string | null | undefined): string {
  const t = String(valeur ?? "").trim().slice(0, 10);
  if (!VERSION_ISO.test(t)) return "";
  const d = new Date(t + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t ? t : "";
}

/** La saisie est-elle acceptable ? Le vide ne l'est pas : une version se dit. */
export function refusVersionConditions(valeur: string | null | undefined): string | null {
  if (String(valeur ?? "").trim() === "") return "Indiquez la date de dernière mise à jour.";
  return versionUtilisable(valeur) === "" ? "Indiquez une date valide (JJ.MM.AAAA)." : null;
}

/**
 * Les versions telles qu'elles vivent en base, avec repli.
 *
 * Une clé absente OU illisible reprend la valeur de départ : une base muette
 * ne doit pas faire passer tout le monde pour « à jour », ni l'inverse.
 */
export function versionsDepuisReglages(valeurs: Map<string, string>): VersionsConditions {
  const lire = (cle: string, defaut: string) => versionUtilisable(valeurs.get(cle)) || defaut;
  return {
    pension: lire(CLES_VERSIONS_CONDITIONS.pension, VERSIONS_CONDITIONS_DEFAUT.pension),
    vente: lire(CLES_VERSIONS_CONDITIONS.vente, VERSIONS_CONDITIONS_DEFAUT.vente),
  };
}

/** La version en vigueur d'un document. */
export function versionCourante(
  document: DocumentConditions,
  versions: VersionsConditions = VERSIONS_CONDITIONS_DEFAUT,
): string {
  return document === "pension" ? versions.pension : versions.vente;
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
  versions: VersionsConditions = VERSIONS_CONDITIONS_DEFAUT,
): EtatConditions {
  const pourCeDocument = acceptations
    .filter((a) => a.document === document)
    .sort((a, b) => String(b.acceptee_le).localeCompare(String(a.acceptee_le)));

  const derniere = pourCeDocument[0];
  if (!derniere) return { etat: "jamais" };
  return derniere.version === versionCourante(document, versions)
    ? { etat: "a_jour", acceptation: derniere }
    : { etat: "ancienne", acceptation: derniere };
}

/** Le repère à montrer au personnel, ou rien si tout va bien. */
export function repereConditions(
  acceptations: readonly Acceptation[],
  document: DocumentConditions = "pension",
  versions: VersionsConditions = VERSIONS_CONDITIONS_DEFAUT,
): string | null {
  const e = etatConditions(acceptations, document, versions);
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
