import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "https://d175514d18155640cf4c666f0112433d@o4511620038197248.ingest.de.sentry.io/4511620125360208",
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
