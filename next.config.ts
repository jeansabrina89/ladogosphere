import { withSentryConfig } from "@sentry/nextjs";

/** Le déploiement de production, et lui seul. Absent en local et en preview. */
const EN_PRODUCTION = process.env.VERCEL_ENV === "production";

/**
 * Les en-têtes de sécurité, servis sur TOUTES les routes (C-09).
 *
 * Pas de Content-Security-Policy ici : posée à l'aveugle, elle casse des
 * écrans en production. Elle demande d'être éprouvée en report-only d'abord,
 * et c'est un lot à elle seule.
 *
 * Les valeurs ont été choisies après avoir cherché ce que l'application fait
 * réellement, pas d'après une liste toute faite :
 *
 * - `DENY` et non `SAMEORIGIN` : le dépôt ne contient aucun `<iframe>`,
 *   `<embed>` ni `<object>`. Les PDF de factures ne sont pas encadrés — ils
 *   sont servis par une redirection vers une URL signée, donc sur un autre
 *   domaine, que cet en-tête ne gouverne pas.
 * - `camera=(self)` : trois formulaires ouvrent l'appareil photo par
 *   `<input capture="environment">` — un justificatif de dépense, la photo
 *   d'un article, une pièce jointe. Les fermer reviendrait à obliger à
 *   photographier d'abord, téléverser ensuite.
 * - `clipboard-write=(self)` : trois boutons copient — un mot de passe
 *   d'employé, un jeton d'e-mail de test, une adresse de contact.
 * - tout le reste à `()` : ni géolocalisation, ni micro, ni `getUserMedia`,
 *   ni paiement dans le navigateur, ni plein écran. Vérifié, pas supposé.
 *
 * HSTS sans `preload` : l'inscription à la liste de préchargement est une
 * décision qu'on ne défait pas en un jour, et elle engage tous les
 * sous-domaines. `includeSubDomains` suffit ici.
 */
export const ENTETES_SECURITE = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "autoplay=()",
      "camera=(self)",
      "clipboard-write=(self)",
      "display-capture=()",
      "encrypted-media=()",
      "fullscreen=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "payment=()",
      "screen-wake-lock=()",
      "usb=()",
      "xr-spatial-tracking=()",
    ].join(", "),
  },
];

const nextConfig = {
  /** Ne pas annoncer le serveur : ça ne protège de rien, ça renseigne. */
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: ENTETES_SECURITE }];
  },

  env: {
    /**
     * VERCEL_ENV recopiée au build pour le NAVIGATEUR, qui ne lit que ce qui
     * est inscrit dans son paquet. Elle sert à couper Sentry hors production
     * (instrumentation-client.ts). Aucune variable n'est ajoutée sur Vercel :
     * c'est le build qui la fabrique.
     */
    NEXT_PUBLIC_ENVIRONNEMENT: process.env.VERCEL_ENV ?? "development",
  },
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
  // Les source maps ne se téléversent QU'EN PRODUCTION : un build local ou une
  // preview n'a rien à envoyer, et n'a pas de jeton pour le faire.
  sourcemaps: { disable: !EN_PRODUCTION },
});
