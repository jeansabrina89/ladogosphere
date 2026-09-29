import { echapperHtml } from "@/src/lib/avisGoogle";

/**
 * La signature au pied de chaque e-mail, réglée dans Réglages → E-mails.
 *
 * ── POURQUOI UN RÉGLAGE ───────────────────────────────────────────────────
 *
 * Elle était écrite en dur dans `emailTemplate` : nom, fonction, adresse,
 * e-mail et site. Changer une ligne demandait une mise en ligne. Un numéro de
 * téléphone qu'on voudrait ajouter, une adresse qui bouge, une personne qui
 * change de fonction — rien de tout cela n'est un sujet de code (décision de
 * Sabrina, 29.09.2026).
 *
 * ── LA RAISON SOCIALE N'EST PAS ICI ───────────────────────────────────────
 *
 * Elle vient de Réglages → Entreprise, et elle est DATÉE : une pièce émise
 * garde l'identité de sa date. La dupliquer ici en ferait une seconde source,
 * qui finirait par dire autre chose que les factures.
 *
 * ── LES VALEURS DE DÉPART SONT LA SIGNATURE ACTUELLE ──────────────────────
 *
 * Au caractère près. Le jour du déploiement, aucun e-mail ne change — et un
 * test compare le HTML rendu à celui d'avant le lot. C'est la seule façon de
 * transformer du code en réglage sans rien casser au passage : on ne demande
 * pas à quelqu'un de retaper ce qui marchait.
 */

export type Signature = {
  nom: string;
  fonction: string;
  adresse: string;
  email: string;
  telephone: string;
  site: string;
};

/** Les clés dans `parametres`, dans l'ordre où les lignes s'affichent. */
export const CLES_SIGNATURE = {
  nom: "signature_nom",
  fonction: "signature_fonction",
  adresse: "signature_adresse",
  email: "signature_email",
  telephone: "signature_telephone",
  site: "signature_site",
} as const;

/** La signature d'avant ce lot, mot pour mot. */
export const SIGNATURE_DEFAUT: Signature = {
  nom: "Sabrina Jean",
  fonction: "Responsable",
  adresse: "Sion, Valais, Suisse",
  email: "ladogosphere@gmail.com",
  telephone: "",
  site: "https://ladogosphere.ch",
};

// ── La validation ─────────────────────────────────────────────────────────

export type RefusSignature = { champ: keyof Signature; message: string };

const LIMITE_LONGUE = 120;

/** Le téléphone : chiffres, espaces, « + » et « . », et rien d'autre. */
const TELEPHONE_OK = /^[0-9 +.]*$/;
const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Le refus, ou `null`. Un seul champ nommé à la fois : une liste de six
 * reproches se lit moins bien qu'un seul, et on corrige de toute façon l'un
 * après l'autre.
 */
export function refusSignature(s: Signature): RefusSignature | null {
  const nom = s.nom.trim();
  if (nom === "") return { champ: "nom", message: "Le nom est obligatoire." };
  if (nom.length > 80) {
    return { champ: "nom", message: "Le nom ne doit pas dépasser 80 caractères." };
  }
  if (s.fonction.trim().length > LIMITE_LONGUE) {
    return { champ: "fonction", message: "La fonction ne doit pas dépasser 120 caractères." };
  }
  if (s.adresse.trim().length > LIMITE_LONGUE) {
    return { champ: "adresse", message: "L'adresse ne doit pas dépasser 120 caractères." };
  }

  const email = s.email.trim();
  if (email === "") return { champ: "email", message: "L'e-mail affiché est obligatoire." };
  if (!EMAIL_OK.test(email)) {
    return { champ: "email", message: "L'e-mail affiché n'est pas valide." };
  }

  const tel = s.telephone.trim();
  if (tel !== "" && !TELEPHONE_OK.test(tel)) {
    return {
      champ: "telephone",
      message: "Le téléphone ne peut contenir que des chiffres, des espaces, « + » et « . ».",
    };
  }

  const site = s.site.trim();
  if (site !== "" && !site.startsWith("https://")) {
    return { champ: "site", message: "Le site doit commencer par https://." };
  }
  return null;
}

/** Une saisie quelconque, mise en forme. Les espaces de bout tombent. */
export function signatureDepuisSaisie(brut: unknown): Signature {
  const o = (brut ?? {}) as Record<string, unknown>;
  const lire = (cle: string) => String(o[cle] ?? "").trim();
  return {
    nom: lire(CLES_SIGNATURE.nom),
    fonction: lire(CLES_SIGNATURE.fonction),
    adresse: lire(CLES_SIGNATURE.adresse),
    email: lire(CLES_SIGNATURE.email),
    telephone: lire(CLES_SIGNATURE.telephone),
    site: lire(CLES_SIGNATURE.site),
  };
}

// ── La lecture, tolérante ─────────────────────────────────────────────────

/**
 * La signature telle qu'elle vit en base, avec repli sur les valeurs de départ.
 *
 * Deux cas bien distincts, et c'est délibéré :
 *
 *  · une clé ABSENTE, ou une valeur qui ne passe pas la validation, revient à
 *    la valeur de départ — une base vide ou abîmée rend la signature d'avant
 *    ce lot, jamais un pied de page mutilé ;
 *  · une clé PRÉSENTE avec une valeur vide est respectée, pour les champs qui
 *    ont le droit d'être vides. Sans quoi on ne pourrait jamais retirer une
 *    fonction ou une adresse : les effacer les ferait revenir.
 *
 * Le nom et l'e-mail n'ont pas ce droit : vides, ils reprennent leur valeur de
 * départ. Une signature sans nom ne se distingue pas d'une panne.
 */
export function signatureDepuisReglages(valeurs: Map<string, string>): Signature {
  const facultatif = (cle: string, defaut: string) => {
    if (!valeurs.has(cle)) return defaut;
    return String(valeurs.get(cle) ?? "").trim();
  };
  const obligatoire = (cle: string, defaut: string) => {
    const v = facultatif(cle, defaut);
    return v === "" ? defaut : v;
  };

  const brute: Signature = {
    nom: obligatoire(CLES_SIGNATURE.nom, SIGNATURE_DEFAUT.nom),
    fonction: facultatif(CLES_SIGNATURE.fonction, SIGNATURE_DEFAUT.fonction),
    adresse: facultatif(CLES_SIGNATURE.adresse, SIGNATURE_DEFAUT.adresse),
    email: obligatoire(CLES_SIGNATURE.email, SIGNATURE_DEFAUT.email),
    telephone: facultatif(CLES_SIGNATURE.telephone, SIGNATURE_DEFAUT.telephone),
    site: facultatif(CLES_SIGNATURE.site, SIGNATURE_DEFAUT.site),
  };

  // Une valeur illisible écrite à la main en base ne doit pas sortir dans un
  // e-mail : le champ fautif reprend sa valeur de départ, les autres tiennent.
  const refus = refusSignature(brute);
  if (!refus) return brute;
  return { ...brute, [refus.champ]: SIGNATURE_DEFAUT[refus.champ] };
}

// ── Le rendu ──────────────────────────────────────────────────────────────

/** « https://ladogosphere.ch/ » → « ladogosphere.ch ». */
export function siteAffiche(site: string): string {
  return site.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/** « +41 27 000 00 00 » → « +41270000000 » : un lien `tel:` ne prend pas d'espaces. */
export function telephoneLien(telephone: string): string {
  return telephone.replace(/[^0-9+]/g, "");
}

const INDENT = " ".repeat(20);
const LIEN = 'style="color:#4AAEA0; text-decoration:none;"';

/**
 * Le bloc HTML de la signature, sans les liens légaux ni la ligne d'avis, qui
 * viennent dessous et ne changent pas.
 *
 * L'indentation et la forme des lignes sont celles d'avant ce lot, au
 * caractère près — y compris la DERNIÈRE ligne, qui porte `margin:0` là où les
 * autres portent `margin:0 0 4px 0`. C'est ce détail qui rend la comparaison
 * « avant / après » possible, et donc le déploiement sûr.
 *
 * Tout ce qui vient du réglage est échappé : un « < » ou un guillemet saisi
 * dans un champ ne sort pas de sa balise.
 */
export function signatureHtml(s: Signature, raisonSociale: string): string {
  const e = echapperHtml;
  const lignes: string[] = [];

  lignes.push(
    `<p style="{MARGE} font-weight:bold; color:#1B2B5E; font-size:14px;">${e(s.nom)}</p>`,
  );

  const fonction = s.fonction.trim();
  lignes.push(
    `<p style="{MARGE} color:#6B7280; font-size:13px;">` +
    `${e(raisonSociale)}${fonction === "" ? "" : ` — ${e(fonction)}`}</p>`,
  );

  if (s.adresse.trim() !== "") {
    lignes.push(
      `<p style="{MARGE} color:#6B7280; font-size:13px;">📍 ${e(s.adresse.trim())}</p>`,
    );
  }

  const lienDansParagraphe = (href: string, texte: string) =>
    `<p style="{MARGE} font-size:13px;">\n${INDENT}  ` +
    `<a href="${href}" ${LIEN}>${texte}</a>\n${INDENT}</p>`;

  const email = s.email.trim();
  if (email !== "") {
    lignes.push(lienDansParagraphe(`mailto:${e(email)}`, `✉️ ${e(email)}`));
  }

  const tel = s.telephone.trim();
  if (tel !== "") {
    lignes.push(lienDansParagraphe(`tel:${e(telephoneLien(tel))}`, `📞 ${e(tel)}`));
  }

  const site = s.site.trim();
  if (site !== "") {
    lignes.push(lienDansParagraphe(e(site), `🌐 ${e(siteAffiche(site))}`));
  }

  // La dernière ligne ne pousse rien après elle : pas de marge basse.
  return lignes
    .map((l, i) => l.replace("{MARGE}", i === lignes.length - 1 ? "margin:0;" : "margin:0 0 4px 0;"))
    .join(`\n${INDENT}`);
}
