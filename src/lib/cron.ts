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
 * - Différent : 401.
 *
 * Rend null quand la tâche peut tourner, sinon la réponse de refus.
 */
export function verifierCron(request: Request, nomTache: string): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.trim() === "") {
    const message = `Cron « ${nomTache} » refusé : CRON_SECRET absent ou vide.`;
    console.error(message);
    Sentry.captureMessage(message, "error");
    return Response.json({ error: "Tâche planifiée non configurée." }, { status: 500 });
  }

  const recu = Buffer.from(request.headers.get("authorization") ?? "", "utf8");
  const attendu = Buffer.from(`Bearer ${secret}`, "utf8");
  if (recu.length !== attendu.length || !timingSafeEqual(recu, attendu)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
