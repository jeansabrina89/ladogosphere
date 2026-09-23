import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";

/**
 * La porte des tâches planifiées (vercel.json). Toutes les routes cron passent
 * par ici, et par ici seulement.
 *
 * Trois sorties, et trois bruits différents :
 *
 * - `CRON_SECRET` absent ou vide : REFUS (500), console et alerte Sentry de
 *   niveau `error`. Avant, la comparaison se faisait avec la chaîne « Bearer
 *   undefined » : un environnement sans secret ouvrait les crons à quiconque
 *   envoyait cet en-tête.
 * - En-tête `Authorization` ABSENT : 401, et RIEN d'autre. C'est le bruit de
 *   fond d'une adresse publique — sondes, robots, scanners. Une alerte par
 *   passage ne dirait rien de neuf et noierait ce qui compte.
 * - En-tête PRÉSENT mais secret faux : 401, alerte Sentry de niveau `warning`,
 *   et une ligne au journal. Là, quelqu'un a essayé une clé : c'est un fait,
 *   il se garde.
 *
 * Ce qui part ne contient JAMAIS le secret attendu, le secret reçu, l'en-tête
 * brut ni sa longueur : seulement le nom de la tâche et la raison.
 *
 * Il n'y a plus de limitation en mémoire. Celle du 18c-ter comptait par
 * instance : en production, deux appels à quatre-vingts secondes d'écart ont
 * produit deux alertes, chaque instance serverless démarrant avec un compteur
 * vide. Un garde-fou qui ne tient qu'en test vaut moins que pas de garde-fou,
 * puisqu'il fait croire qu'on est couvert.
 *
 * Rend null quand la tâche peut tourner, sinon la réponse de refus.
 */

/** Un refus sans session : la trace existe, sans auteur. */
const AUCUN = "00000000-0000-0000-0000-000000000000";

export async function verifierCron(request: Request, nomTache: string): Promise<Response | null> {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.trim() === "") {
    const message = `Cron « ${nomTache} » refusé : CRON_SECRET absent ou vide.`;
    console.error(message);
    Sentry.captureMessage(message, "error");
    return Response.json({ error: "Tâche planifiée non configurée." }, { status: 500 });
  }

  const entete = request.headers.get("authorization");
  // Pas d'en-tête : le bruit d'une adresse publique. On referme, sans un mot.
  if (entete === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recu = Buffer.from(entete, "utf8");
  const attendu = Buffer.from(`Bearer ${secret}`, "utf8");
  if (recu.length !== attendu.length || !timingSafeEqual(recu, attendu)) {
    Sentry.captureMessage(`Cron « ${nomTache} » refusé : secret incorrect.`, {
      level: "warning",
      tags: { tache: nomTache, raison: "secret_faux" },
    });
    // La trace passe par la clé de service, derrière cette garde : aucune
    // politique n'est contournée, et rien de sensible n'est écrit. Le module
    // se charge ICI : la porte doit rester lisible sans clé de service (tests).
    try {
      const { tracerEvenement } = await import("@/src/lib/journalEvenements");
      await tracerEvenement({
        entite: "acces",
        entiteId: AUCUN,
        evenement: "refus",
        apres: { action: "cron", tache: nomTache, motif: "secret_faux" },
        userId: null,
      });
    } catch {
      // Une trace manquante ne change pas la réponse : le refus reste un refus.
    }
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
