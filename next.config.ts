import { withSentryConfig } from "@sentry/nextjs";

const nextConfig = {
  /**
   * La boutique en ligne a quitté /mon-compte : son adresse disait « espace
   * client » alors qu'elle est publique. Les anciennes adresses continuent de
   * mener au bon endroit — un lien d'e-mail déjà parti, un favori, un partage
   * ne doivent pas tomber sur une page absente.
   *
   * 301 et non 308 : c'est ce qui a été demandé, et ces adresses ne sont
   * atteintes qu'en GET.
   */
  async redirects() {
    return [
      { source: "/mon-compte/boutique", destination: "/catalogue", statusCode: 301 },
      { source: "/mon-compte/boutique/panier", destination: "/catalogue/panier", statusCode: 301 },
      { source: "/mon-compte/boutique/:id", destination: "/catalogue/:id", statusCode: 301 },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: "la-dogosphere",
  project: "javascript-nextjs",
  silent: !process.env.CI,
});
