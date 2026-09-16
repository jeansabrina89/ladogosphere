/**
 * Qui a fait le geste — ses initiales, son nom — tel que l'écran le montre.
 *
 * UN seul endroit pour cette règle. Les initiales s'affichent sur la fiche de
 * réservation, les chiens du jour, les factures et les ventes : si chaque écran
 * les calculait à sa façon, « SJ » ici et « SA » là désigneraient la même
 * personne, et le journal ne servirait plus à rien.
 *
 * Le calcul des initiales existe aussi en SQL (`public.calculer_initiales`),
 * parce qu'un compte du personnel doit recevoir les siennes à sa création, où
 * qu'elle se fasse. Les deux suivent exactement la même règle, et un test les
 * confronte sur les mêmes cas.
 *
 * Module pur : ni base, ni requête. JAMAIS importé depuis l'espace client.
 */

/** Deux ou trois lettres majuscules, sans accent. */
export const FORMAT_INITIALES = /^[A-Z]{2,3}$/;

export const MESSAGE_INITIALES_INVALIDES =
  "Les initiales tiennent en 2 ou 3 lettres, sans accent ni chiffre (par exemple « SJ »).";
export const MESSAGE_INITIALES_PRISES =
  "Ces initiales sont déjà celles d'une autre personne de l'équipe.";

/**
 * Accents retirés lettre par lettre. La table est écrite en toutes lettres,
 * et la même se retrouve en SQL : `normalize("NFD")` en retirerait d'autres, et
 * les deux calculs finiraient par diverger sur un nom étranger.
 */
const SANS_ACCENT: Record<string, string> = {
  À: "A", Â: "A", Ä: "A", Á: "A", Ã: "A", Å: "A",
  Ç: "C",
  É: "E", È: "E", Ê: "E", Ë: "E",
  Í: "I", Ì: "I", Î: "I", Ï: "I",
  Ñ: "N",
  Ó: "O", Ò: "O", Ô: "O", Ö: "O", Õ: "O",
  Ú: "U", Ù: "U", Û: "U", Ü: "U",
  Ý: "Y", Ÿ: "Y",
};

/** Les lettres A–Z d'un texte, en majuscules, accents retirés, rien d'autre. */
export function lettresMajuscules(texte: string | null | undefined): string {
  return [...String(texte ?? "").toUpperCase()]
    .map((c) => SANS_ACCENT[c] ?? c)
    .filter((c) => c >= "A" && c <= "Z")
    .join("");
}

export type IdentitePersonnel = {
  prenom?: string | null;
  nom?: string | null;
  email?: string | null;
};

/**
 * Les initiales à essayer, dans l'ordre.
 *
 * 1. Prénom et nom : première lettre de chacun (« SJ »). En cas de collision,
 *    la deuxième lettre du nom s'ajoute (« SJE »), puis la troisième, et ainsi
 *    de suite ; puis la deuxième lettre du prénom (« SAJ »).
 * 2. Prénom seul ou nom seul : ses deux premières lettres, puis une troisième.
 * 3. Ni l'un ni l'autre : les deux premières lettres de l'adresse e-mail.
 * 4. En dernier recours : les deux premières lettres retenues, suivies de A à Z.
 */
export function candidatsInitiales(identite: IdentitePersonnel): string[] {
  const p = lettresMajuscules(identite.prenom);
  const n = lettresMajuscules(identite.nom);
  const e = lettresMajuscules(String(identite.email ?? "").split("@")[0]);

  const candidats: string[] = [];
  const troisieme = (base: string, source: string, depuis: number) => {
    for (let k = depuis; k < source.length; k++) candidats.push(base + source[k]);
  };

  if (p.length >= 1 && n.length >= 1) {
    candidats.push(p[0] + n[0]);
    troisieme(p[0] + n[0], n, 1);
    if (p.length >= 2) candidats.push(p[0] + p[1] + n[0]);
  } else if (p.length >= 2) {
    candidats.push(p.slice(0, 2));
    troisieme(p.slice(0, 2), p, 2);
  } else if (n.length >= 2) {
    candidats.push(n.slice(0, 2));
    troisieme(n.slice(0, 2), n, 2);
  } else if (e.length >= 2) {
    candidats.push(e.slice(0, 2));
    troisieme(e.slice(0, 2), e, 2);
  }

  const base = (candidats[0] ?? "XX").slice(0, 2);
  if (candidats.length === 0) candidats.push(base);
  for (let c = 65; c <= 90; c++) candidats.push(base + String.fromCharCode(c));

  return [...new Set(candidats)].filter((c) => FORMAT_INITIALES.test(c));
}

/** Les premières initiales libres pour cette personne. */
export function calculerInitiales(
  identite: IdentitePersonnel,
  prises: Iterable<string>,
): string {
  const occupees = new Set([...prises].map((i) => i.toUpperCase()));
  const candidats = candidatsInitiales(identite);
  return candidats.find((c) => !occupees.has(c)) ?? candidats[candidats.length - 1];
}

/** Relit une saisie : majuscules, sans espace. Ne corrige rien d'autre. */
export function normaliserInitiales(saisie: string | null | undefined): string {
  return String(saisie ?? "").trim().toUpperCase();
}

/** Refus d'une saisie d'initiales, ou null si elle est acceptable. */
export function refusInitiales(saisie: string, prisesParAutres: Iterable<string>): string | null {
  const i = normaliserInitiales(saisie);
  if (!FORMAT_INITIALES.test(i)) return MESSAGE_INITIALES_INVALIDES;
  if (new Set([...prisesParAutres].map((x) => x.toUpperCase())).has(i)) return MESSAGE_INITIALES_PRISES;
  return null;
}

// ── À l'écran ──────────────────────────────────────────────────────────────

/** Ce qu'on sait d'un profil pour l'afficher comme auteur d'un geste. */
export type ProfilAuteur = {
  initiales?: string | null;
  prenom?: string | null;
  nom?: string | null;
  email?: string | null;
  role?: string | null;
};

/**
 * Les initiales d'un profil. Celles enregistrées d'abord ; à défaut — un
 * profil lu avant la reprise, un compte en cours de création —, la première
 * proposition de la règle, pour ne jamais afficher un vide.
 */
export function initialesDe(profil: ProfilAuteur | null | undefined): string {
  const enregistrees = normaliserInitiales(profil?.initiales);
  if (FORMAT_INITIALES.test(enregistrees)) return enregistrees;
  return candidatsInitiales(profil ?? {})[0] ?? "??";
}

/** Le nom complet, pour le survol. Repli sur l'adresse, jamais un vide. */
export function nomCompletDe(profil: ProfilAuteur | null | undefined): string {
  const nom = [profil?.prenom, profil?.nom].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ");
  return nom || String(profil?.email ?? "").trim() || "Personne inconnue";
}

export type AuteurAffiche = {
  /** Ce qui s'écrit dans la ligne : « SJ », « automatique » ou « client ». */
  texte: string;
  /** Ce qui s'affiche au survol, ou null. */
  titre: string | null;
  genre: "personnel" | "automatique" | "client";
};

/**
 * Comment un auteur s'écrit dans un historique.
 *
 * - Aucun compte : le geste est parti tout seul (un cron, un envoi du matin) —
 *   « automatique ». Sauf s'il vient d'un client sans session, par un lien
 *   reçu par e-mail : le journal le dit alors, et c'est « client ».
 * - Un compte client : « client ». Jamais son nom : l'historique d'une
 *   réservation n'a pas à exposer qui est derrière un compte.
 * - Le personnel : ses initiales, et son nom complet au survol.
 */
export function auteurAffiche(
  profil: ProfilAuteur | null | undefined,
  options: { parClientSansCompte?: boolean } = {},
): AuteurAffiche {
  if (!profil) {
    return options.parClientSansCompte
      ? { texte: "client", titre: null, genre: "client" }
      : { texte: "automatique", titre: null, genre: "automatique" };
  }
  if (profil.role !== "admin" && profil.role !== "employe") {
    return { texte: "client", titre: null, genre: "client" };
  }
  return { texte: initialesDe(profil), titre: nomCompletDe(profil), genre: "personnel" };
}
