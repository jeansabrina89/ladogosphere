import * as Sentry from "@sentry/nextjs";

/**
 * Sentry ne parle QUE depuis la production.
 *
 * `VERCEL_ENV` vaut « production » sur le déploiement de production, et
 * « preview » ou « development » ailleurs. Absente — poste local, `npm test`,
 * `next build` à la main — la condition est fausse : aucun événement n'est
 * émis, le DSN fût-il renseigné. C'est `enabled` qui coupe, et non le DSN :
 * le code reste identique partout, seule la sortie change.
 */
Sentry.init({
  enabled: process.env.VERCEL_ENV === "production",
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "https://d175514d18155640cf4c666f0112433d@o4511620038197248.ingest.de.sentry.io/4511620125360208",
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
