import * as Sentry from "@sentry/nextjs";

/**
 * Sentry ne parle QUE depuis la production, côté navigateur aussi.
 *
 * `VERCEL_ENV` n'existe pas dans le paquet du navigateur : next.config.ts la
 * recopie au build dans `NEXT_PUBLIC_ENVIRONNEMENT`, remplacée par sa valeur
 * au moment de la compilation. Un build local ou une preview donne autre chose
 * que « production » : rien ne part.
 */
Sentry.init({
  enabled: process.env.NEXT_PUBLIC_ENVIRONNEMENT === "production",
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "https://d175514d18155640cf4c666f0112433d@o4511620038197248.ingest.de.sentry.io/4511620125360208",
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
