import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { politiqueCsp, endpointRapportsCsp } from "@/src/lib/csp";

/**
 * La CSP en observation (C-09, APP 29).
 *
 * ── CE QUE CE FICHIER GARDE AVANT TOUT : LE NOM DE L'EN-TÊTE ──────────────
 *
 * `Content-Security-Policy-Report-Only` rapporte. `Content-Security-Policy`
 * bloque. Un caractère de différence, et l'écran d'une cliente s'affiche à
 * moitié sans qu'aucune erreur ne paraisse — on ne l'apprend que par téléphone.
 *
 * Le passage en bloquante est une DÉCISION, prise dans un lot à part, après deux
 * semaines de rapports. Pas un effet de bord d'une relecture.
 */

const ENV = {
  supabaseUrl: "https://lljxyrbocdqerricggfc.supabase.co",
  sentryDsn: "https://abc123@o456.ingest.sentry.io/789",
};

describe("l'en-tête est en OBSERVATION, pas bloquant", () => {
  const config = () => readFileSync(join(__dirname, "..", "next.config.ts"), "utf8");

  it("le nom porte bien « Report-Only »", () => {
    expect(config()).toContain('key: "Content-Security-Policy-Report-Only"');
  });

  it("et AUCUN en-tête bloquant n'est servi", () => {
    /**
     * La mutation qu'on redoute : quelqu'un retire « -Report-Only » en croyant
     * finir le travail. Ce test rougit alors, et le message dit pourquoi.
     */
    const c = config();
    expect(
      c,
      "une CSP bloquante ne se pose pas au passage : elle casse des écrans en " +
      "silence, et le passage est un lot à part (voir docs/SECURITE.md)",
    ).not.toMatch(/key:\s*"Content-Security-Policy"/);
  });

  it("la politique est construite depuis l'environnement, pas écrite en dur", () => {
    // L'origine Supabase et le DSN changent avec le projet. En dur, ils
    // divergeraient le jour d'une migration de projet.
    const c = config();
    expect(c).toMatch(/politiqueCsp\(\{[\s\S]*NEXT_PUBLIC_SUPABASE_URL/);
    expect(c).toMatch(/NEXT_PUBLIC_SENTRY_DSN/);
  });
});

describe("chaque source, et la raison qui la met là", () => {
  const p = () => politiqueCsp(ENV);

  it("le socle retombe sur nous", () => {
    // Une directive oubliée retombe ici, donc du bon côté.
    expect(p()).toContain("default-src 'self'");
  });

  it("les images : nous, data:, blob:, et Supabase — pas un de plus", () => {
    /**
     * `data:` pour les images encodées (dont les QR de facture) ; `blob:` pour
     * l'aperçu d'une photo AVANT téléversement, que le navigateur fabrique
     * localement ; Supabase pour le bucket public de la boutique ET les URL
     * signées du bucket privé des chiens (lot 24) — même origine pour les deux.
     */
    expect(p()).toContain(`img-src 'self' data: blob: ${ENV.supabaseUrl}`);
  });

  it("les polices viennent de NOUS, et c'est contre-intuitif", () => {
    /**
     * `next/font/google` télécharge la police AU BUILD et la sert depuis notre
     * domaine : rien ne part vers fonts.gstatic.com quand la page s'affiche.
     * L'autoriser serait ouvrir une origine dont on n'a pas besoin.
     */
    expect(p()).toContain("font-src 'self'");
    expect(p(), "aucune origine Google").not.toMatch(/gstatic|googleapis/);
  });

  it("les requêtes sortantes : Supabase en https ET en wss, plus Sentry", () => {
    const politique = p();
    expect(politique).toContain(`connect-src 'self' ${ENV.supabaseUrl}`);
    // Le temps réel parle en WebSocket. L'autoriser coûte une ligne ; le
    // découvrir en panne coûte une soirée.
    expect(politique).toContain("wss://lljxyrbocdqerricggfc.supabase.co");
    // Sans Sentry ici, on perdrait la remontée d'erreurs le jour où la CSP bloque
    // — donc au moment où on en a le plus besoin.
    expect(politique).toContain("https://*.sentry.io");
    expect(politique).toContain("https://*.ingest.sentry.io");
  });

  it("ce qui est interdit l'est parce qu'on a vérifié ne pas s'en servir", () => {
    // Vérifié au lot 23 : aucun <iframe>, <embed> ni <object> dans le dépôt. Les
    // PDF de facture sont servis par redirection, jamais encadrés.
    const politique = p();
    expect(politique).toContain("frame-src 'none'");
    expect(politique).toContain("object-src 'none'");
    expect(politique).toContain("frame-ancestors 'none'");
  });

  it("base-uri et form-action : deux détournements discrets fermés", () => {
    /**
     * `<base>` réécrirait la cible de toutes les URL relatives de la page.
     * `form-action` empêche un script injecté de renvoyer un mot de passe
     * ailleurs. Ni l'un ni l'autre ne demande plus qu'une balise.
     */
    expect(p()).toContain("base-uri 'self'");
    expect(p()).toContain("form-action 'self'");
  });

  it("les deux `unsafe-inline` sont là, et ils sont ÉCRITS comme des dettes", () => {
    /**
     * Pour les SCRIPTS, c'en est une : Next injecte des scripts inline pour
     * l'hydratation, et s'en passer demande des nonces — un chantier à lui seul.
     * C'est la moitié de ce qu'une CSP protège, et c'est le premier point à
     * reprendre au lot bloquant.
     *
     * Pour les STYLES, c'est un fait du dépôt : les écrans sont habillés par des
     * centaines de `style={{ … }}` inline. Les retirer serait un autre projet.
     *
     * Ce test ne les interdit pas — il vérifie que le module DIT pourquoi ils
     * sont là. Un `unsafe-inline` sans raison écrite devient un `unsafe-inline`
     * qu'on ne retire jamais.
     */
    const politique = p();
    expect(politique).toContain("script-src 'self' 'unsafe-inline'");
    expect(politique).toContain("style-src 'self' 'unsafe-inline'");

    const source = readFileSync(join(__dirname, "..", "src/lib/csp.ts"), "utf8");
    expect(source, "la dette des scripts doit être nommée").toMatch(/dette/i);
    expect(source).toMatch(/nonces?/i);
  });

  it("`unsafe-eval` n'y est PAS : Next n'en a pas besoin en production", () => {
    // S'il manque, un rapport le dira pendant les deux semaines. C'est exactement
    // ce qu'on cherche à apprendre.
    expect(p()).not.toContain("unsafe-eval");
  });
});

describe("les rapports partent vers Sentry", () => {
  it("l'endpoint se déduit du DSN, sans rien écrire en dur", () => {
    /**
     * Un DSN a la forme `https://<clé>@<hôte>/<projet>`. Sentry expose
     * `/api/<projet>/security/` exprès pour les rapports de CSP, et accepte le
     * format que les navigateurs envoient sans transformation.
     */
    expect(endpointRapportsCsp(ENV.sentryDsn))
      .toBe("https://o456.ingest.sentry.io/api/789/security/?sentry_key=abc123");
    expect(politiqueCsp(ENV)).toContain("report-uri https://o456.ingest.sentry.io/api/789/security/");
  });

  it("sans DSN : pas de report-uri, et la politique reste valide", () => {
    /**
     * Le cas du développement local. Les violations paraissent alors dans la
     * console du navigateur — utile — mais rien ne les collecte : on n'envoie pas
     * à Sentry ce qu'on casse en développant.
     */
    const sansDsn = politiqueCsp({ supabaseUrl: ENV.supabaseUrl });
    expect(sansDsn).not.toContain("report-uri");
    expect(sansDsn).toContain("default-src 'self'");
  });

  it("un DSN illisible ne fait pas tomber le build", () => {
    // Une variable mal recopiée ne doit pas empêcher de déployer : la politique
    // part sans collecte, et c'est mieux que pas de politique du tout.
    for (const mauvais of ["", "pas-une-url", "https://sans-cle.sentry.io/", undefined]) {
      expect(endpointRapportsCsp(mauvais)).toBeNull();
    }
  });

  it("une URL Supabase illisible non plus", () => {
    const p = politiqueCsp({ supabaseUrl: "pas-une-url", sentryDsn: ENV.sentryDsn });
    expect(p).toContain("img-src 'self' data: blob:");
    expect(p).toContain("connect-src 'self'");
  });
});

describe("le plan est écrit", () => {
  it("docs/SECURITE.md dit les deux semaines et le lot à part", () => {
    /**
     * Une observation sans date de fin ne se termine jamais : la CSP resterait en
     * report-only pour toujours, et on se croirait protégés.
     */
    const doc = readFileSync(join(__dirname, "..", "docs/SECURITE.md"), "utf8");
    expect(doc).toMatch(/Report-Only/);
    expect(doc).toMatch(/deux semaines/i);
    expect(doc, "la date de début, pour savoir quand relire").toMatch(/27\.09\.2026|27 septembre 2026/);
  });
});
