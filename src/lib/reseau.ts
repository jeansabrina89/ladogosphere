import * as Sentry from "@sentry/nextjs";

/**
 * Rattraper un échec RÉSEAU, et rendre l'écran à son utilisateur.
 *
 * Nos écrans traitent déjà l'erreur que le serveur RÉPOND — « cette date est
 * prise », « il ne reste que deux exemplaires ». Ils ne traitent pas l'échec
 * d'infrastructure : réseau coupé, réponse illisible, module non chargé. Dans
 * ce cas, la promesse est rejetée, personne ne la rattrape, et l'écran reste
 * figé dans son attente — le bouton grisé, la liste vide, sans un mot.
 *
 * D'où deux familles, et deux phrases :
 *   • « serveur » : la demande est partie, la réponse dit non. Le message vient
 *     du serveur, c'est une décision métier.
 *   • « reseau » : la demande n'est pas partie, ou la réponse est inexploitable.
 *     Rien n'a été décidé — il faut réessayer.
 * L'utilisateur doit pouvoir les distinguer : « ma demande est refusée » n'est
 * pas « ma demande n'est pas partie ».
 *
 * Le retour à un état utilisable n'est pas laissé à la bonne volonté de
 * l'appelant : `retour` est OBLIGATOIRE — un paramètre facultatif s'oublie,
 * et c'est justement l'oubli qu'on corrige ici. `toujours` s'exécute dans un
 * `finally`, échec comme succès : c'est là qu'on éteint le chargement et
 * qu'on réactive le bouton. Un endroit qui n'a honnêtement rien à remettre
 * passe `{}` : c'est alors une décision visible, pas un oubli.
 *
 * La trace part dans Sentry au niveau `error`, avec l'ENDROIT (« Ententes.charger »)
 * et rien d'autre : ni nom, ni adresse, ni contenu de formulaire, ni identifiant
 * — l'endroit suffit à retrouver l'appel. Sentry étant coupé hors production
 * (18c-bis), ces traces ne partent que depuis la production.
 */

/** Ce qu'on dit quand la demande n'est pas partie. */
export const MESSAGE_RESEAU =
  "On n'a pas pu joindre le serveur. Vérifiez votre connexion, puis réessayez.";

/** Ce qu'on dit quand le serveur a répondu, mais sans rien d'exploitable. */
export const MESSAGE_SERVEUR =
  "Le serveur n'a pas pu traiter la demande. Réessayez dans un instant.";

export type FamilleEchec = "reseau" | "serveur";

export type Echec = { ok: false; famille: FamilleEchec; message: string };
export type Succes<T> = { ok: true; valeur: T };
export type Resultat<T> = Succes<T> | Echec;

export type Retour = {
  /** Ce qui remet l'écran en état : chargement éteint, bouton réactivé. Toujours exécuté. */
  toujours?: () => void;
  /** La phrase à poser à l'écran. Appelée seulement en cas d'échec. */
  siEchec?: (message: string, famille: FamilleEchec) => void;
  /** Remplace la phrase par défaut quand le contexte demande autre chose. */
  message?: string;
};

function tracer(endroit: string, famille: FamilleEchec, statut?: number): void {
  // Aucune donnée personnelle : l'endroit et, s'il existe, le code HTTP.
  Sentry.captureMessage(`Échec ${famille} — ${endroit}`, {
    level: "error",
    tags: { endroit, famille },
    ...(statut ? { extra: { statut } } : {}),
  });
}

/**
 * Exécute une opération asynchrone et rattrape son rejet.
 *
 *   const r = await tenterReseau("Ententes.charger", () => fetch(...), {
 *     toujours: () => setChargement(false),
 *     siEchec: (message) => setErreur(message),
 *   });
 *   if (!r.ok) return;
 *   …r.valeur
 */
export async function tenterReseau<T>(
  endroit: string,
  operation: () => Promise<T>,
  retour: Retour,
): Promise<Resultat<T>> {
  try {
    return { ok: true, valeur: await operation() };
  } catch {
    tracer(endroit, "reseau");
    const message = retour.message ?? MESSAGE_RESEAU;
    retour.siEchec?.(message, "reseau");
    return { ok: false, famille: "reseau", message };
  } finally {
    retour.toujours?.();
  }
}

/**
 * Le cas courant : appeler notre API et lire sa réponse JSON.
 *
 * Trois sorties, et chacune dit laquelle : la réponse attendue ; le refus du
 * serveur, avec SA phrase quand il en donne une ; l'échec réseau.
 */
export async function appelerApi<T = unknown>(
  endroit: string,
  url: string,
  init: RequestInit,
  retour: Retour,
): Promise<Resultat<T>> {
  try {
    const reponse = await fetch(url, init);

    if (!reponse.ok) {
      // Le serveur a répondu : c'est une décision, pas une panne. On reprend sa
      // phrase si elle existe — elle est écrite pour l'utilisateur.
      const corps = await reponse.json().catch(() => null);
      const message = (corps as { error?: string } | null)?.error ?? MESSAGE_SERVEUR;
      tracer(endroit, "serveur", reponse.status);
      retour.siEchec?.(message, "serveur");
      return { ok: false, famille: "serveur", message };
    }

    // Une réponse vide est une réponse valable (204, DELETE…).
    const texte = await reponse.text();
    const valeur = (texte ? JSON.parse(texte) : null) as T;
    return { ok: true, valeur };
  } catch {
    tracer(endroit, "reseau");
    const message = retour.message ?? MESSAGE_RESEAU;
    retour.siEchec?.(message, "reseau");
    return { ok: false, famille: "reseau", message };
  } finally {
    retour.toujours?.();
  }
}
