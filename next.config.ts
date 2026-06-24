import { withSentryConfig } from "@sentry/nextjs";

const nextConfig = {};

export default withSentryConfig(nextConfig, {
  org: "la-dogosphere",
  project: "javascript-nextjs",
  silent: !process.env.CI,
});
