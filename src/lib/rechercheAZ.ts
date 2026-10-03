/**
 * APP 73 — la recherche des listes Chiens et Clients : une barre qui filtre
 * pendant la frappe, et une rangée de lettres A … Z.
 *
 * Module pur : la règle de correspondance, la lettre d'une fiche, et la
 * traduction aller-retour avec l'adresse (?lettre=M&q=max). Le composant
 * (app/components/RechercheAZ.tsx) ne fait que l'appliquer.
 *
 * Pourquoi côté navigateur : 22 chiens et 38 clients en base au 03.10.2026,
 * données de test comprises. La liste est déjà lue en UNE requête par la page ;
 * filtrer sur le serveur demanderait un aller-retour à chaque lettre tapée,
 * pour trier quelques dizaines de lignes qu'on a déjà.
 */

export const LETTRES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export type EtatRecherche = { lettre: string | null; q: string; filtre: string | null };

/** Sans accents, sans majuscules, espaces resserrés : « Élodie » et « elodie » sont le même mot. */
export function normaliser(texte: string | null | undefined): string {
  return String(texte ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Les seuls chiffres : « 079 123 45 67 » et « +41 79 123 » se comparent ainsi. */
export function chiffres(texte: string | null | undefined): string {
  return String(texte ?? "").replace(/\D/g, "");
}

/** La lettre d'une fiche : la première lettre de la clé, sans accent. « Élodie » → E. */
export function lettreDe(cle: string | null | undefined): string | null {
  const premiere = normaliser(cle).charAt(0).toUpperCase();
  return LETTRES.includes(premiere) ? premiere : null;
}

export type EntreeRecherche = {
  id: string;
  /** Ce qui décide de la lettre : le nom du chien, le nom de famille du client. */
  cleLettre: string | null;
  /** Ce que la barre interroge. */
  textes: (string | null | undefined)[];
  /** Comparés chiffre à chiffre, espaces et indicatif compris. */
  telephones?: (string | null | undefined)[];
  /** Les filtres que la fiche porte (ex. « attente » : chien à valider). */
  drapeaux?: string[];
};

/**
 * La recherche correspond-elle à la fiche ? Chaque mot tapé doit se trouver
 * quelque part (« elodie mar » trouve Élodie Martin). Un mot qui contient des
 * chiffres se cherche aussi dans les téléphones, sans leurs espaces : « 079 123 »
 * et « 079123 » trouvent la même fiche — les deux mots « 079 » et « 123 » se
 * recollent pour cela.
 */
export function correspond(e: EntreeRecherche, q: string): boolean {
  const recherche = normaliser(q);
  if (!recherche) return true;
  const textes = e.textes.map(normaliser).filter(Boolean);
  const tels = (e.telephones ?? []).map(chiffres).filter(Boolean);

  // Tout le numéro tapé d'un bloc, espaces ôtés.
  const numero = chiffres(recherche);
  if (numero.length >= 3 && /^[\d\s+().\-/]+$/.test(recherche)) {
    return tels.some((t) => t.includes(numero)) || textes.some((t) => t.includes(recherche));
  }

  return recherche.split(" ").every((mot) =>
    textes.some((t) => t.includes(mot))
    || (chiffres(mot).length >= 3 && tels.some((t) => t.includes(chiffres(mot)))));
}

/** Les lettres qui ont au moins une fiche — les autres sont grisées. */
export function lettresAvecFiches(entrees: EntreeRecherche[]): Set<string> {
  const s = new Set<string>();
  for (const e of entrees) {
    const l = lettreDe(e.cleLettre);
    if (l) s.add(l);
  }
  return s;
}

/** Lettre, recherche et filtre se combinent : il faut passer les trois. */
export function filtrer<T extends EntreeRecherche>(entrees: T[], etat: EtatRecherche): T[] {
  return entrees.filter((e) =>
    (!etat.lettre || lettreDe(e.cleLettre) === etat.lettre)
    && (!etat.filtre || (e.drapeaux ?? []).includes(etat.filtre))
    && correspond(e, etat.q));
}

type Params = URLSearchParams | Record<string, string | string[] | undefined> | null | undefined;

function lire(p: Params, cle: string): string {
  if (!p) return "";
  if (p instanceof URLSearchParams) return p.get(cle) ?? "";
  const v = p[cle];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** L'état lu dans l'adresse. Une lettre ou un filtre inconnus sont ignorés. */
export function lireEtat(p: Params, filtresConnus: string[] = []): EtatRecherche {
  const lettre = lire(p, "lettre").toUpperCase();
  const filtre = lire(p, "filtre");
  return {
    lettre: LETTRES.includes(lettre) ? lettre : null,
    q: lire(p, "q").slice(0, 100),
    filtre: filtresConnus.includes(filtre) ? filtre : null,
  };
}

/** L'état écrit dans l'adresse : « lettre=M&q=max », ou rien. */
export function versQuery(etat: EtatRecherche): string {
  const q = new URLSearchParams();
  if (etat.lettre) q.set("lettre", etat.lettre);
  if (etat.q.trim()) q.set("q", etat.q.trim());
  if (etat.filtre) q.set("filtre", etat.filtre);
  return q.toString();
}

export function adresseListe(base: string, etat: EtatRecherche): string {
  const q = versQuery(etat);
  return q ? `${base}?${q}` : base;
}

/**
 * « ← Retour » d'une fiche : la liste, à l'endroit où on l'a quittée. La liste
 * passe son état à la fiche (?retour=lettre%3DM%26q%3Dmax) ; la fiche le
 * relit ICI, qui ne garde que les trois clés connues — jamais une adresse
 * arbitraire glissée dans le lien.
 */
export function hrefRetour(base: string, retour: string | string[] | null | undefined, filtresConnus: string[] = []): string {
  const brut = Array.isArray(retour) ? retour[0] : retour;
  if (!brut) return base;
  return adresseListe(base, lireEtat(new URLSearchParams(brut), filtresConnus));
}

/** « 12 chiens », « 1 client », « 0 chien ». */
export function compte(n: number, singulier: string, pluriel: string): string {
  return `${n} ${n > 1 ? pluriel : singulier}`;
}
