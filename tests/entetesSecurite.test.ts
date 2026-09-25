import { describe, it, expect, vi } from "vitest";

/**
 * C-09 — les cinq en-têtes de sécurité, et l'effacement de X-Powered-By.
 *
 * Ce test lit la configuration que `next.config.ts` exporte réellement, pas
 * une copie : si quelqu'un retire un en-tête, ou remet `poweredByHeader`, il
 * rougit. Un en-tête absent ne se voit pas à l'écran — rien ne casse, rien
 * n'alerte, et on ne s'en aperçoit qu'à l'audit suivant.
 *
 * Pas de Content-Security-Policy : elle reste à éprouver en report-only, et
 * ce test ne l'exige donc pas.
 */

// `withSentryConfig` enveloppe la configuration : on le neutralise pour que le
// test lise la configuration elle-même, sans monter l'instrumentation.
vi.mock("@sentry/nextjs", () => ({
  withSentryConfig: (config: unknown) => config,
}));

const ATTENDUS: Record<string, RegExp> = {
  "Strict-Transport-Security": /^max-age=63072000; includeSubDomains$/,
  "X-Content-Type-Options": /^nosniff$/,
  "X-Frame-Options": /^DENY$/,
  "Referrer-Policy": /^strict-origin-when-cross-origin$/,
  "Permissions-Policy": /geolocation=\(\)/,
};

describe("les en-têtes de sécurité sont servis sur toutes les routes", () => {
  it("les cinq en-têtes sont là, avec leur valeur", async () => {
    const config = (await import("../next.config")).default as {
      headers?: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]>;
    };
    expect(config.headers, "next.config.ts n'expose plus headers()").toBeTypeOf("function");

    const regles = await config.headers!();
    const toutes = regles.find((r) => r.source === "/:path*");
    expect(toutes, "aucune règle ne couvre toutes les routes").toBeDefined();

    const servis = new Map(toutes!.headers.map((h) => [h.key, h.value]));
    for (const [cle, forme] of Object.entries(ATTENDUS)) {
      expect(servis.has(cle), `en-tête manquant : ${cle}`).toBe(true);
      expect(servis.get(cle), `valeur inattendue pour ${cle}`).toMatch(forme);
    }
  });

  it("X-Powered-By est coupé", async () => {
    const config = (await import("../next.config")).default as { poweredByHeader?: boolean };
    expect(
      config.poweredByHeader,
      "poweredByHeader n'est pas false : la réponse annonce le serveur",
    ).toBe(false);
  });

  it("la Permissions-Policy laisse ouvert ce que l'application utilise vraiment", async () => {
    const { ENTETES_SECURITE } = await import("../next.config");
    const politique = ENTETES_SECURITE.find((h) => h.key === "Permissions-Policy")!.value;

    // L'appareil photo sert à trois formulaires (`<input capture>`), le
    // presse-papiers à trois boutons de copie : les fermer casserait un geste.
    expect(politique, "l'appareil photo est fermé, alors que trois formulaires s'en servent")
      .toContain("camera=(self)");
    expect(politique, "le presse-papiers est fermé, alors que trois boutons copient")
      .toContain("clipboard-write=(self)");

    // Ce que l'application n'utilise nulle part reste fermé.
    for (const inutilisee of ["geolocation", "microphone", "payment", "usb"]) {
      expect(politique, `${inutilisee} devrait être fermée`).toContain(`${inutilisee}=()`);
    }
  });

  it("aucune Content-Security-Policy n'est posée dans ce lot", async () => {
    const { ENTETES_SECURITE } = await import("../next.config");
    const cles = ENTETES_SECURITE.map((h) => h.key.toLowerCase());
    expect(cles).not.toContain("content-security-policy");
    expect(cles).not.toContain("content-security-policy-report-only");
  });
});
