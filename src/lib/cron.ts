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
 * - En-tête PRÉSENT mais secret faux : 401, une ligne au journal, et une
 *   alerte Sentry de niveau `warning` — mais UNE SEULE PAR TÂCHE ET PAR JOUR.
 *   C'est l'écriture qui décide : l'insertion « ne rien faire en cas de
 *   conflit » (index unique partiel sur tâche + jour, migration
 *   20260923124740) dit si elle a créé la ligne. Seule la première du jour est
 *   créée, et c'est elle qui alerte. Une seule écriture, aucune lecture
 *   préalable, rien en mémoire : la base est le seul endroit que toutes les
 *   instances partagent.
 *
 * Ce qui part ne contient JAMAIS le secret attendu, le secret reçu, l'en-tête
 * brut ni sa longueur : seulement le nom de la tâche et la raison.
 *
 * La limitation du 18c-ter comptait en mémoire, par instance : en production,
 * deux appels à quatre-vingts secondes d'écart ont produit deux alertes,
 * chaque instance serverless démarrant avec un compteur vide. La borne en base
 * décrite ci-dessus l'a remplacée.
 *
 * Rend null quand la tâche peut tourner, sinon la réponse de refus.
 */

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
    // L'écriture décide, et elle seule : la fonction n'insère qu'une ligne par
    // tâche et par jour, et dit si celle-ci vient d'être créée. Le module de
    // base se charge ICI, pour que la porte reste lisible sans clé de service.
    let premiere = true;
    try {
      const { supabaseAdmin } = await import("@/src/lib/supabase-admin");
      const { data, error } = await supabaseAdmin.rpc("tracer_refus_cron", { p_tache: nomTache });
      // Une trace impossible ne doit pas rendre la tentative muette : si
      // l'écriture échoue, on alerte plutôt que de se taire.
      premiere = error ? true : data === true;
    } catch {
      premiere = true;
    }

    if (premiere) {
      Sentry.captureMessage(`Cron « ${nomTache} » refusé : secret incorrect.`, {
        level: "warning",
        tags: { tache: nomTache, raison: "secret_faux" },
      });
    }

    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
