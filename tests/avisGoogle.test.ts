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

import { envoyerEmailSatisfactionEssai, envoyerEmailReservationValidee } from "@/src/lib/email";

/**
 * Le suivi après la journée d'essai — le SEUL e-mail qui porte le lien dans
 * son corps (APP 53), et donc le seul dont le pied de page ne le répète pas.
 */
async function rendreSuivi(): Promise<string> {
  H.html = [];
  await envoyerEmailSatisfactionEssai({ email: "client@exemple.ch", prenom: "Camille", nom_chien: "Pixel" });
  expect(H.html).toHaveLength(1);
  return H.html[0];
}

/**
 * Un e-mail ordinaire, pour éprouver le PIED DE PAGE commun.
 *
 * Ces tests passaient par le suivi d'essai, qui était alors un e-mail comme
 * les autres. Il ne l'est plus : le garder ici aurait fait croire que le pied
 * de page avait changé pour tout le monde. La confirmation de réservation ne
 * porte aucun lien d'avis dans son contenu — c'est ce qu'il faut pour regarder
 * le pied, et rien d'autre.
 */
async function rendreConfirmation(): Promise<string> {
  H.html = [];
  await envoyerEmailReservationValidee({
    email: "client@exemple.ch", prenom: "Camille",
    date_debut: "2026-10-05", date_fin: "2026-10-09", type: "sejour",
  });
  expect(H.html).toHaveLength(1);
  return H.html[0];
}

beforeEach(() => {
  H.avis = "";
});

describe("le pied de page de tous les e-mails", () => {
  const rendre = rendreConfirmation;

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

// ── APP 53 : le suivi après la journée d'essai ─────────────────────────────

/** Le lien tel qu'il se lit dans la phrase, depuis APP 55. */
const LIEN_CORPS = "nous laisser un avis sur Google";

describe("le suivi après essai porte le lien dans son corps", () => {
  it("sans réglage : le message d’avant, moins la liste des ennuis", async () => {
    const html = await rendreSuivi();

    // Ce qui a été retiré : on n'énumère plus ce qui aurait pu mal se passer.
    expect(html).not.toContain("interpellée");
    expect(html).not.toContain("fatigue, appétit, comportement");
    // Ce qui le remplace.
    expect(html).toContain(
      "Nous restons à votre disposition pour toute question ou tout renseignement complémentaire.",
    );
    // Aucun lien d'avis nulle part, ni corps ni pied : le réglage est vide.
    expect(html).not.toContain(LIBELLE_AVIS_GOOGLE);
    expect(html).not.toContain("Google");
    // Et le pied de page reste celui de tout le monde.
    expect(html).toContain("🌐 ladogosphere.ch");
    expect(html).toContain("Confidentialité");
  });

  it("avec réglage : UNE seule fois, dans le corps, et le pied ne le répète pas", async () => {
    /**
     * Le cœur du lot. Deux fois le même lien à dix lignes d'écart se lirait
     * comme une insistance — or ce message n'en est pas une.
     *
     * APP 55 — la forme a changé : le lien tenait une ligne à lui, avec étoile
     * et gras ; il est redescendu DANS la phrase. Ce test visait
     * `LIBELLE_AVIS_GOOGLE`, qui ne sert plus qu'au pied de page ; il vise
     * désormais le membre de phrase.
     */
    H.avis = "https://g.page/r/CabcDEF/review";
    const html = await rendreSuivi();

    expect(html.split(LIEN_CORPS), "une seule occurrence").toHaveLength(2);
    // Dans le CORPS : donc AVANT la signature, pas sous l'adresse du site.
    expect(html.indexOf(LIEN_CORPS)).toBeLessThan(html.indexOf("🌐 ladogosphere.ch"));
    // La phrase exacte, lien compris.
    expect(html).toContain(
      'Si vous avez un moment, vous pouvez aussi <a href="https://g.page/r/CabcDEF/review"' +
      ' style="color:#2E8B7E; text-decoration:underline;">nous laisser un avis sur Google</a>.',
    );
    // Le reste du pied de page n'a pas bougé pour autant.
    expect(html).toContain("Confidentialité");
  });

  it("SOBRE : ni étoile, ni gras, ni ligne à part", async () => {
    /**
     * APP 55. Dans un message qui prend des nouvelles d'un chien, un lien mis
     * en avant se lit comme une demande. Ces trois absences sont la décision.
     */
    H.avis = "https://g.page/r/CabcDEF/review";
    const html = await rendreSuivi();

    expect(html, "pas d'étoile dans le corps").not.toContain("★");
    expect(html, "le libellé du pied ne sert pas de membre de phrase").not.toContain(LIBELLE_AVIS_GOOGLE);
    expect(html).not.toContain("<strong");
    expect(html).not.toContain("font-weight:bold; text-decoration:none;\">nous laisser");
    // Le lien est DANS la phrase : du texte le précède sur la même ligne.
    expect(html).toMatch(/vous pouvez aussi <a\b/);
  });

  it("un réglage douteux ne met de lien NI dans le corps NI au pied", async () => {
    for (const valeur of ["http://g.page/r/x", "javascript:alert(1)", "pas un lien"]) {
      H.avis = valeur;
      const html = await rendreSuivi();
      expect(html, valeur).not.toContain(LIBELLE_AVIS_GOOGLE);
      expect(html, valeur).not.toContain(LIEN_CORPS);
      expect(html, valeur).not.toContain("Si vous avez un moment");
    }
  });

  it("LES AUTRES E-MAILS GARDENT LEUR PIED DE PAGE", async () => {
    /**
     * L'assertion inverse, et la plus importante : la suppression du pied vaut
     * pour CET e-mail seulement. Sans cela, on aurait retiré le lien d'avis de
     * toute la correspondance en croyant corriger une répétition.
     */
    H.avis = "https://g.page/r/CabcDEF/review";
    const html = await rendreConfirmation();

    expect(html).toContain(LIBELLE_AVIS_GOOGLE);
    // Au pied : APRÈS l'adresse du site, et pas dans le corps.
    expect(html.indexOf(LIBELLE_AVIS_GOOGLE)).toBeGreaterThan(html.indexOf("🌐 ladogosphere.ch"));
    expect(html).not.toContain(LIEN_CORPS);
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
