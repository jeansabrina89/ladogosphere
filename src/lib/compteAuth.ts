/**
 * Retrouver le compte Auth d'une adresse e-mail.
 *
 * Le code cherchait ce compte en listant TOUS les comptes puis en filtrant en
 * mémoire. Deux défauts, et le second est celui qui a mordu :
 *
 *   · `listUsers()` ne rend que la première page — cinquante comptes. Au
 *     cinquante et unième, la recherche se met à échouer sans prévenir ;
 *   · l'erreur était jetée. `const { data } = await listUsers()` laisse tomber
 *     `error`. Quand l'API répond 500, `data.users` vaut `[]`, et un tableau
 *     vide se lit exactement comme « aucun compte ne correspond ».
 *
 * On ne liste donc plus rien : on demande à l'API LE compte de cette adresse,
 * par son filtre. Et toute erreur remonte — l'appelant refuse plutôt que de
 * créer une fiche à moitié rattachée.
 */

/** Un compte trouvé, aucun compte, ou une recherche qui a échoué. */
export type ResultatCompteAuth =
  | { ok: true; id: string | null }
  | { ok: false; message: string };

export type CompteBrut = { id?: string | null; email?: string | null };

export const MESSAGE_CLE_ABSENTE =
  "La clé de service Supabase manque côté serveur : impossible de vérifier si un " +
  "compte existe déjà pour cette adresse.";

export function messageRechercheImpossible(detail: string): string {
  return (
    "Impossible de vérifier si un compte existe déjà pour cette adresse " +
    `(${detail}). La fiche n'a pas été créée — réessayez, ou prévenez si cela persiste.`
  );
}

/** Une adresse comparable : sans espaces, sans casse. */
export function normaliserEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

/**
 * Le compte qui porte EXACTEMENT cette adresse.
 *
 * Le filtre de l'API cherche une sous-chaîne : demander « jean@x.ch » peut
 * rendre « jean@x.ch » et « paul+jean@x.ch ». On ne garde que l'égalité, à la
 * casse près — sans quoi une fiche se rattacherait au compte d'un autre.
 */
export function choisirCompte(
  comptes: readonly CompteBrut[] | null | undefined,
  email: string
): string | null {
  const cible = normaliserEmail(email);
  if (cible === "") return null;
  const trouve = (comptes ?? []).find((u) => normaliserEmail(u.email) === cible);
  return trouve?.id ? String(trouve.id) : null;
}

type Options = {
  url?: string;
  cle?: string;
  fetchImpl?: typeof fetch;
};

/**
 * Cherche le compte Auth d'une adresse, sans jamais échouer en silence.
 *
 * Rend `{ ok: true, id: null }` quand l'adresse n'a pas de compte — c'est un
 * résultat, pas une panne. Rend `{ ok: false }` dès que la recherche n'a pas
 * pu se faire : clé absente, réseau, ou réponse d'erreur de l'API.
 */
export async function compteAuthParEmail(
  email: string,
  options: Options = {}
): Promise<ResultatCompteAuth> {
  const cible = normaliserEmail(email);
  if (cible === "") return { ok: true, id: null };

  const url = options.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const cle = options.cle ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !cle) return { ok: false, message: MESSAGE_CLE_ABSENTE };

  const appeler = options.fetchImpl ?? fetch;
  let reponse: Response;
  try {
    reponse = await appeler(
      `${url.replace(/\/+$/, "")}/auth/v1/admin/users?filter=${encodeURIComponent(cible)}`,
      { headers: { apikey: cle, Authorization: `Bearer ${cle}` } }
    );
  } catch (e: unknown) {
    return { ok: false, message: messageRechercheImpossible(String((e as Error)?.message ?? e)) };
  }

  if (!reponse.ok) {
    return { ok: false, message: messageRechercheImpossible(`réponse ${reponse.status}`) };
  }

  let corps: unknown;
  try {
    corps = await reponse.json();
  } catch {
    return { ok: false, message: messageRechercheImpossible("réponse illisible") };
  }

  const comptes = Array.isArray(corps)
    ? (corps as CompteBrut[])
    : ((corps as { users?: CompteBrut[] })?.users ?? null);
  if (!Array.isArray(comptes)) {
    return { ok: false, message: messageRechercheImpossible("réponse inattendue") };
  }

  return { ok: true, id: choisirCompte(comptes, cible) };
}
