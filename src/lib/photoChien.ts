import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { lireAppelant } from "@/src/lib/garde";

/**
 * La seule porte vers une photo de chien (S-05).
 *
 * Le bucket `chiens-photos` était PUBLIC : le chemin d'une photo suffisait à
 * l'ouvrir, et ces chemins circulaient dans les pages. Une photo de chien est
 * une donnée personnelle rattachée à un propriétaire identifiable — elle se
 * sert comme une facture, par une URL signée de courte durée, fabriquée ici
 * après vérification du droit de voir CE chien.
 *
 * Trois règles portent la sûreté de cette fonction, et chacune a son test :
 *
 *  1. **Elle prend un identifiant de chien, jamais un chemin.** Un chemin venu
 *     du navigateur désignerait n'importe quel objet du bucket, y compris celui
 *     d'un autre client : la garde serait enjambée sans être touchée. Le chemin
 *     est LU en base, à partir de l'identifiant.
 *  2. **Le droit se lit dans la session**, par `lireAppelant()` — jamais dans un
 *     paramètre. Le personnel actif voit tous les chiens (c'est ce que dit déjà
 *     la politique `personnel_select_chiens`, et ce que font les écrans) ; un
 *     client ne voit que les siens, par `clients.auth_user_id`.
 *  3. **Aucun autre endroit du code n'appelle `createSignedUrl` sur ce bucket.**
 *     Un test relit le dépôt et le garde : deux portes, c'est une porte de trop.
 */

export const BUCKET_CHIENS = "chiens-photos";

/** Une heure. Assez pour charger une page et ses images, trop peu pour circuler. */
export const DUREE_URL_PHOTO = 3600;

/**
 * Ce qui ressemble à un chemin d'objet plutôt qu'à un identifiant.
 *
 * Un UUID ne contient ni `/`, ni `.`, ni `http`. Refuser explicitement vaut
 * mieux que laisser la lecture en base échouer : le message dit alors ce qui
 * s'est passé, et le test peut le vérifier.
 */
function ressembleAUnChemin(valeur: string): boolean {
  return valeur.includes("/") || valeur.includes(".") || valeur.toLowerCase().startsWith("http");
}

export type UrlPhotoChien =
  | { url: string }
  | { url: null; motif: "non_connecte" | "refuse" | "sans_photo" | "identifiant_invalide" };

/**
 * L'URL signée de la photo d'un chien, ou le motif du refus.
 *
 * Renvoie `{ url: null, motif }` plutôt que de lever : un écran qui affiche
 * vingt chiens ne doit pas tomber parce que l'un d'eux n'a pas de photo.
 */
export async function urlSigneePhotoChien(chienId: string): Promise<UrlPhotoChien> {
  if (!chienId || ressembleAUnChemin(chienId)) {
    return { url: null, motif: "identifiant_invalide" };
  }

  const appelant = await lireAppelant();
  if (!appelant || !appelant.actif) return { url: null, motif: "non_connecte" };

  const { data: chien } = await supabaseAdmin
    .from("chiens")
    .select("id, client_id, photo_principale")
    .eq("id", chienId)
    .maybeSingle();
  if (!chien) return { url: null, motif: "refuse" };

  const estPersonnel = appelant.role === "admin" || appelant.role === "employe";
  if (!estPersonnel) {
    // Un client : sa fiche vient de sa SESSION, et le chien doit être le sien.
    const { data: fiche } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("auth_user_id", appelant.userId)
      .maybeSingle();
    if (!fiche || chien.client_id !== fiche.id) return { url: null, motif: "refuse" };
  }

  const chemin = chien.photo_principale as string | null;
  if (!chemin) return { url: null, motif: "sans_photo" };

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_CHIENS)
    .createSignedUrl(chemin, DUREE_URL_PHOTO);
  if (error || !data?.signedUrl) {
    Sentry.captureException(error ?? new Error("URL signée de photo de chien introuvable"));
    return { url: null, motif: "sans_photo" };
  }
  return { url: data.signedUrl };
}

/**
 * Les URL signées de plusieurs chiens d'un coup, pour les listes.
 *
 * Le droit est vérifié chien par chien — c'est `urlSigneePhotoChien` qui le
 * fait, et elle seule. Grouper ici n'ouvre donc rien : cela évite seulement
 * d'écrire la même boucle dans chaque écran.
 */
export async function urlsSigneesPhotosChiens(
  chienIds: readonly string[],
): Promise<Map<string, string>> {
  const resultat = new Map<string, string>();
  const uniques = [...new Set(chienIds.filter(Boolean))];
  await Promise.all(
    uniques.map(async (id) => {
      const r = await urlSigneePhotoChien(id);
      if (r.url) resultat.set(id, r.url);
    }),
  );
  return resultat;
}

/**
 * Oublier un objet du bucket — et ne JAMAIS faire échouer le geste pour autant.
 *
 * Une photo de chien est une donnée personnelle : quand elle est remplacée ou
 * que la fiche disparaît, l'objet ne doit pas rester dans le bucket. Il n'est
 * plus référencé par rien, donc plus signable, donc invisible — mais il est
 * toujours là, et « invisible » n'est pas « effacé ».
 *
 * ── POURQUOI CETTE FONCTION NE LÈVE PAS ───────────────────────────────────
 *
 * Le geste de l'utilisateur a déjà réussi quand on arrive ici : la nouvelle
 * photo est enregistrée, ou la fiche est supprimée. Faire échouer la requête
 * parce que le ménage a raté afficherait une erreur pour une opération qui, du
 * point de vue de la cliente, s'est parfaitement passée — et l'inviterait à
 * recommencer un geste déjà fait.
 *
 * L'échec est donc journalisé, et l'objet reste à nettoyer. C'est un choix
 * assumé : un octet oublié dans un bucket coûte moins qu'une suppression de
 * fiche qui semble avoir échoué alors qu'elle a eu lieu.
 *
 * ── L'ORDRE, QUI EST TOUT ─────────────────────────────────────────────────
 *
 * Cette fonction s'appelle APRÈS que le remplaçant est déposé ET enregistré,
 * jamais avant. Une panne entre les deux laisserait sinon un chien sans photo,
 * et la photo perdue pour de bon.
 */
export async function oublierPhotoChien(
  chemin: string | null | undefined,
  contexte: { chienId?: string | null; motif: string },
): Promise<{ supprime: boolean }> {
  const c = String(chemin ?? "").trim();
  // Rien à faire, et ce n'est pas une anomalie : un chien peut n'avoir jamais
  // eu de photo.
  if (!c) return { supprime: false };

  try {
    const { error } = await supabaseAdmin.storage.from(BUCKET_CHIENS).remove([c]);
    if (error) {
      // Journalisé, pas relancé. L'objet reste à nettoyer, et on sait lequel.
      Sentry.captureMessage(
        `Photo de chien non supprimée du bucket (${contexte.motif}) : ${c} — ${error.message}`,
        "warning",
      );
      console.error("oublierPhotoChien:", contexte.motif, c, error.message);
      return { supprime: false };
    }
    return { supprime: true };
  } catch (err) {
    Sentry.captureException(err);
    console.error("oublierPhotoChien:", contexte.motif, c, err);
    return { supprime: false };
  }
}
