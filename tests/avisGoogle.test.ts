import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  LIBELLE_AVIS_GOOGLE,
  MESSAGE_LIEN_AVIS_INVALIDE,
  ligneAvisGooglePiedDePage,
  validerLienAvisGoogle,
} from "@/src/lib/avisGoogle";

/**
 * Le lien d'avis Google au pied de chaque e-mail.
 *
 * Vide : aucun e-mail ne change. Rempli : une ligne, sous « ladogosphere.ch ».
 * Le test passe par un VRAI e-mail rendu, Resend et la base simulés : c'est le
 * pied de page commun qu'on regarde, pas une fonction isolée.
 */

const H = vi.hoisted(() => ({
  avis: "",
  html: [] as string[],
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (p: { html: string }) => {
        H.html.push(p.html);
        return { data: { id: "re_test" }, error: null };
      },
    };
  },
}));

vi.mock("@/src/lib/supabase-admin", () => {
  function from(table: string) {
    let cle = "";
    const chain = {
      select: () => chain,
      eq: (col: string, val: string) => { if (col === "cle") cle = val; return chain; },
      insert: () => Promise.resolve({ error: null }),
      maybeSingle: () => Promise.resolve({
        data: table === "parametres" && cle === "avis_google_url" ? { valeur: H.avis } : null,
        error: null,
      }),
    };
    return chain;
  }
  return { supabaseAdmin: { from } };
});

vi.mock("@/src/lib/entiteJuridique", () => ({ entiteA: async () => ({}) }));
vi.mock("@/src/lib/entiteJuridiqueLogique", () => ({ raisonSocialeAffichee: () => "La Dogosphère" }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import { envoyerEmailSatisfactionEssai } from "@/src/lib/email";

async function rendre(): Promise<string> {
  H.html = [];
  await envoyerEmailSatisfactionEssai({ email: "client@exemple.ch", prenom: "Camille", nom_chien: "Pixel" });
  expect(H.html).toHaveLength(1);
  return H.html[0];
}

beforeEach(() => {
  H.avis = "";
});

describe("le pied de page de tous les e-mails", () => {
  it("réglage vide : aucune mention d’avis, nulle part", async () => {
    const html = await rendre();
    expect(html).toContain("🌐 ladogosphere.ch");
    expect(html).not.toMatch(/\bavis\b/i);
    expect(html).not.toContain("Google");
    expect(html).not.toContain(LIBELLE_AVIS_GOOGLE);
  });

  it("réglage rempli : la ligne apparaît, sous ladogosphere.ch, vers ce lien", async () => {
    H.avis = "https://g.page/r/CabcDEF/review";
    const html = await rendre();
    expect(html).toContain(LIBELLE_AVIS_GOOGLE);
    expect(html).toContain('href="https://g.page/r/CabcDEF/review"');
    // Juste après la ligne du site, et une seule fois.
    expect(html.indexOf(LIBELLE_AVIS_GOOGLE)).toBeGreaterThan(html.indexOf("🌐 ladogosphere.ch"));
    expect(html.split(LIBELLE_AVIS_GOOGLE)).toHaveLength(2);
  });

  it("vide, le pied de page est identique à l’octet près à celui d’avant", async () => {
    const sansReglage = await rendre();
    H.avis = "   ";
    const blanc = await rendre();
    expect(blanc).toBe(sansReglage);
  });

  it("une valeur douteuse écrite en base sans passer par l’écran n’apparaît pas", async () => {
    for (const valeur of ["http://g.page/r/x", "javascript:alert(1)", "pas un lien"]) {
      H.avis = valeur;
      const html = await rendre();
      expect(html, valeur).not.toContain(LIBELLE_AVIS_GOOGLE);
    }
  });
});

describe("la saisie", () => {
  it("accepte un lien https complet", () => {
    expect(validerLienAvisGoogle("https://g.page/r/CabcDEF/review")).toEqual({
      ok: true, valeur: "https://g.page/r/CabcDEF/review",
    });
  });

  it("accepte le vide : c’est retirer le lien", () => {
    expect(validerLienAvisGoogle("")).toEqual({ ok: true, valeur: "" });
    expect(validerLienAvisGoogle("   ")).toEqual({ ok: true, valeur: "" });
  });

  it("refuse tout ce qui n’est pas une adresse https, avec le message", () => {
    for (const valeur of [
      "http://g.page/r/x", "g.page/r/x", "javascript:alert(1)", "https://localhost/x",
      "https://g.page/r/ avec espace", "ftp://g.page/r/x",
    ]) {
      expect(validerLienAvisGoogle(valeur), valeur).toEqual({ ok: false, message: MESSAGE_LIEN_AVIS_INVALIDE });
    }
  });

  it("la ligne n’est qu’un lien de pied de page : ni bouton, ni encadré", () => {
    const ligne = ligneAvisGooglePiedDePage("https://g.page/r/x");
    expect(ligne).toMatch(/^<p style="margin:4px 0 0 0; font-size:13px;"><a href="[^"]+" style="color:#4AAEA0; text-decoration:none;">★ Donner votre avis sur Google<\/a><\/p>$/);
    expect(ligneAvisGooglePiedDePage("")).toBe("");
    expect(ligneAvisGooglePiedDePage(null)).toBe("");
  });

  it("un guillemet ne peut pas sortir de l’attribut", () => {
    const ligne = ligneAvisGooglePiedDePage('https://g.page/r/x?"onmouseover=1');
    expect(ligne).not.toContain('"onmouseover');
  });
});
