import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";

/**
 * La porte des tâches planifiées (vercel.json). Toutes les routes cron passent
 * par ici, et par ici seulement.
 *
 * - Sans `CRON_SECRET`, ou vide : REFUS (500), et une ligne dans les journaux.
 *   Avant, la comparaison se faisait avec la chaîne « Bearer undefined » : un
 *   environnement sans secret (poste local, preview oubliée) ouvrait les crons
 *   à quiconque envoyait cet en-tête.
 * - Avec le secret : l'en-tête `Authorization` doit valoir « Bearer <secret> »,
 *   comparé en temps constant sur deux tampons de même longueur. Longueur
 *   différente : refus, sans comparer.
 * - Différent : 401, et une alerte Sentry de niveau `warning` — au plus une par
 *   tâche et par fenêtre de dix minutes (voir alerterRefus).
 *
 * Rien n'est écrit dans `journal_evenements` : l'adresse d'un cron est
 * publique, et la table ne doit pas pouvoir se remplir depuis l'extérieur.
 *
 * Rend null quand la tâche peut tourner, sinon la réponse de refus.
 */

/** Une alerte par tâche et par tranche de dix minutes, pas davantage. */
export const FENETRE_ALERTE_MS = 10 * 60 * 1000;

/**
 * La dernière alerte émise, par tâche. En mémoire, au niveau du module : ni
 * table, ni dépendance. Une instance qui redémarre repart d'une ardoise
 * vierge et peut donc réémettre — c'est accepté, une alerte de trop vaut mieux
 * qu'une table ouverte à tous les vents.
 */
const derniereAlerte = new Map<string, number>();

/** Remet le compteur à zéro. Pour les tests, qui jouent plusieurs fenêtres. */
export function reinitialiserAlertesCron(): void {
  derniereAlerte.clear();
}

export type RaisonRefusCron = "entete_absent" | "secret_faux";

const RAISONS: Record<RaisonRefusCron, string> = {
  entete_absent: "en-tête Authorization absent",
  secret_faux: "secret incorrect",
};

/**
 * L'alerte d'un refus. Elle ne porte QUE le nom de la tâche et la raison :
 * jamais le secret attendu, jamais celui reçu, jamais un en-tête brut.
 *
 * Elle suit la coupure de Sentry (enabled hors production) : sans client
 * actif, l'appel ne fait rien. Hors production, rien ne part donc d'ici.
 */
function alerterRefus(nomTache: string, raison: RaisonRefusCron): void {
  const maintenant = Date.now();
  const precedente = derniereAlerte.get(nomTache);
  if (precedente !== undefined && maintenant - precedente < FENETRE_ALERTE_MS) return;
  derniereAlerte.set(nomTache, maintenant);

  Sentry.captureMessage(`Cron « ${nomTache} » refusé : ${RAISONS[raison]}.`, {
    level: "warning",
    tags: { tache: nomTache, raison },
  });
}

export function verifierCron(request: Request, nomTache: string): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.trim() === "") {
    const message = `Cron « ${nomTache} » refusé : CRON_SECRET absent ou vide.`;
    console.error(message);
    Sentry.captureMessage(message, "error");
    return Response.json({ error: "Tâche planifiée non configurée." }, { status: 500 });
  }

  const entete = request.headers.get("authorization");
  if (entete === null) {
    alerterRefus(nomTache, "entete_absent");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recu = Buffer.from(entete, "utf8");
  const attendu = Buffer.from(`Bearer ${secret}`, "utf8");
  if (recu.length !== attendu.length || !timingSafeEqual(recu, attendu)) {
    alerterRefus(nomTache, "secret_faux");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
