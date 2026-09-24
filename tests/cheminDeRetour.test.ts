import { describe, it, expect, vi } from "vitest";
import { cheminDeRetourSur } from "@/src/lib/cheminDeRetour";

/**
 * C-10 — la redirection ouverte de `/auth/confirm?next=`.
 *
 * `new URL(next, origin)` ignore la base dès que `next` est absolu : un lien
 * de confirmation portant le domaine de la pension pouvait déposer le
 * visiteur sur un site tiers, après l'avoir authentifié. C'est le vecteur
 * d'hameçonnage le plus commode qui soit — il porte une adresse en laquelle
 * la cliente a confiance.
 *
 * `startsWith("/")` ne suffit pas : « //evil.com » commence par une barre et
 * sort quand même, le navigateur le lisant comme un protocole relatif.
 */

const ORIGINE = "https://ladogosphere.ch";

describe("ce qui reste sur le site", () => {
  it("un chemin ordinaire passe", () => {
    expect(cheminDeRetourSur("/tableau-de-bord", ORIGINE)).toBe("/tableau-de-bord");
  });

  it("un chemin avec paramètres passe, tel quel", () => {
    expect(cheminDeRetourSur("/reservations?x=1", ORIGINE)).toBe("/reservations?x=1");
  });

  it("une ancre et un chemin profond passent", () => {
    expect(cheminDeRetourSur("/mon-compte/chiens/42#photos", ORIGINE))
      .toBe("/mon-compte/chiens/42#photos");
  });

  it("une URL absolue VERS LE SITE passe, réduite à son chemin", () => {
    expect(cheminDeRetourSur(`${ORIGINE}/catalogue`, ORIGINE)).toBe("/catalogue");
  });
});

describe("ce qui sort du site est refusé", () => {
  const dehors = [
    ["une URL absolue", "https://evil.com"],
    ["le protocole relatif", "//evil.com"],
    ["la barre inversée", "/\\evil.com"],
    ["la barre inversée en tête", "\\/evil.com"],
    ["un schéma sans barres", "http:evil.com"],
    ["du script", "javascript:alert(1)"],
    ["une donnée embarquée", "data:text/html,<script>"],
    ["une chaîne vide", ""],
  ];

  for (const [nom, valeur] of dehors) {
    it(`${nom} — « ${valeur} » — retombe sur la page par défaut`, () => {
      expect(
        cheminDeRetourSur(valeur, ORIGINE),
        `« ${valeur} » a été accepté : le visiteur authentifié part chez un tiers`,
      ).toBe("/");
    });
  }

  it("absent, c'est la page par défaut", () => {
    expect(cheminDeRetourSur(null, ORIGINE)).toBe("/");
    expect(cheminDeRetourSur(undefined, ORIGINE)).toBe("/");
  });

  it("un autre sous-domaine est un autre site", () => {
    expect(cheminDeRetourSur("https://admin.ladogosphere.ch/x", ORIGINE)).toBe("/");
  });

  it("le même hôte en clair n'est pas la même origine", () => {
    expect(cheminDeRetourSur("http://ladogosphere.ch/x", ORIGINE)).toBe("/");
  });
});

// ── La route elle-même : les deux redirections (lignes 38 et 44) ────────────

const H = vi.hoisted(() => ({ verifyOtp: true, exchange: true }));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], setAll: () => {} }) }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      verifyOtp: async () => ({ error: H.verifyOtp ? null : { message: "invalide" } }),
      exchangeCodeForSession: async () => ({ error: H.exchange ? null : { message: "invalide" } }),
    },
  }),
}));

describe("la route de confirmation ne sort pas du site", () => {
  const appel = async (query: string) => {
    const { GET } = await import("@/app/(public)/auth/confirm/route");
    return GET({ url: `https://ladogosphere.ch/auth/confirm${query}` } as never);
  };

  it("le jeton par lien : « next » hostile est ignoré", async () => {
    H.verifyOtp = true;
    const r = await appel("?token_hash=abc&type=recovery&next=https://evil.com");
    expect(
      new URL(r.headers.get("location")!).origin,
      "la visiteuse authentifiée est renvoyée chez un tiers",
    ).toBe("https://ladogosphere.ch");
  });

  it("le code d'échange : « //evil.com » est ignoré aussi", async () => {
    H.exchange = true;
    const r = await appel("?code=xyz&next=//evil.com");
    expect(new URL(r.headers.get("location")!).origin).toBe("https://ladogosphere.ch");
  });

  it("un « next » légitime est respecté", async () => {
    H.verifyOtp = true;
    const r = await appel("?token_hash=abc&type=recovery&next=/mon-compte");
    expect(r.headers.get("location")).toBe("https://ladogosphere.ch/mon-compte");
  });
});
