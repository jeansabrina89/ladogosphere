import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * APP 37 — les liens légaux au pied des e-mails transactionnels.
 *
 * ── CE QUE CE FICHIER SURVEILLE ───────────────────────────────────────────
 *
 * Un e-mail part et ne revient pas. Quand le pied perd un lien, personne ne
 * s'en aperçoit : la cliente ne sait pas ce qui aurait dû s'y trouver, et
 * l'expéditrice ne relit pas ses propres envois. C'est le contraire d'un écran,
 * qu'on rouvre tous les jours.
 *
 * ── DEUX NIVEAUX, ET POURQUOI ─────────────────────────────────────────────
 *
 * Le pied COURANT est lu sur un e-mail RÉELLEMENT RENDU — Resend et la base
 * simulés, mais le HTML est celui qui partirait. Le pied des e-mails de
 * COMMANDE est lu sur `piedLiensLegaux`, parce que rendre une confirmation de
 * commande demande huit tables, un client et un PDF. La dette de test de
 * `emettreFactureCommande` dit déjà ce que coûte un décor qu'on ne monte
 * jamais : mieux vaut vérifier la pièce que ne rien vérifier.
 */

const H = vi.hoisted(() => ({ html: [] as string[] }));

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
  function from() {
    const chain = {
      select: () => chain,
      eq: () => chain,
      insert: () => Promise.resolve({ error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    };
    return chain;
  }
  return { supabaseAdmin: { from } };
});

vi.mock("@/src/lib/entiteJuridique", () => ({ entiteA: async () => ({}) }));
vi.mock("@/src/lib/entiteJuridiqueLogique", () => ({
  raisonSocialeAffichee: () => "La Dogosphère",
}));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { envoyerEmailRetourEnStock, piedLiensLegaux } from "@/src/lib/email";
import { LIEN_CONFIDENTIALITE, LIEN_CONDITIONS_VENTE } from "@/src/lib/liensLegaux";

/** Un e-mail courant, rendu pour de vrai. Aucun envoi réel : Resend est simulé. */
async function unEmailRendu(): Promise<string> {
  H.html = [];
  await envoyerEmailRetourEnStock({
    email: "cliente@exemple.ch",
    article: "Harnais Ruffwear",
    prix: 35,
    articleId: "art-1",
    token: "jeton",
  });
  expect(H.html).toHaveLength(1);
  return H.html[0];
}

beforeEach(() => {
  H.html = [];
});

describe("le pied de TOUT e-mail renvoie à la politique de confidentialité", () => {
  it("le lien est là, avec la bonne adresse", async () => {
    const html = await unEmailRendu();
    expect(html).toContain(`href="${LIEN_CONFIDENTIALITE}"`);
    expect(html).toContain(">Confidentialité</a>");
  });

  it("il pointe vers le SITE, jamais vers l'application", async () => {
    /**
     * `SITE_URL` de ce module désigne `reservation.ladogosphere.ch`, d'où
     * partent les liens vers une facture. Une page légale n'y est pas.
     */
    const html = await unEmailRendu();
    expect(html).toContain("https://ladogosphere.ch/confidentialite");
    expect(html).not.toContain("reservation.ladogosphere.ch/confidentialite");
  });

  it("un e-mail qui n'est PAS un achat ne cite pas les conditions de vente", async () => {
    // Un retour en stock n'engage rien : rien n'est commandé, rien n'est dû.
    // Un pied qui cite tout ne se lit plus.
    const html = await unEmailRendu();
    expect(html).not.toContain("Conditions de vente");
    expect(html).not.toContain(LIEN_CONDITIONS_VENTE);
  });

  it("le reste du pied n'a pas bougé", async () => {
    const html = await unEmailRendu();
    expect(html).toContain("🌐 ladogosphere.ch");
    expect(html).toContain("ladogosphere@gmail.com");
    expect(html).toContain("Tous droits réservés");
  });
});

describe("l'e-mail qui scelle un achat cite AUSSI les conditions de vente", () => {
  it("les deux liens, avec les deux bonnes adresses", () => {
    const pied = piedLiensLegaux(true);
    expect(pied).toContain(`href="${LIEN_CONFIDENTIALITE}"`);
    expect(pied).toContain(`href="${LIEN_CONDITIONS_VENTE}"`);
    expect(pied).toContain(">Confidentialité</a>");
    expect(pied).toContain(">Conditions de vente</a>");
  });

  it("sans achat, le second lien disparaît — et le premier reste", () => {
    const pied = piedLiensLegaux(false);
    expect(pied).toContain(LIEN_CONFIDENTIALITE);
    expect(pied).not.toContain(LIEN_CONDITIONS_VENTE);
    expect(pied).not.toContain("Conditions de vente");
  });

  it("la confirmation de commande demande bien la variante achat", () => {
    /**
     * Elle la demande INCONDITIONNELLEMENT, et non selon que le PDF de la
     * facture a pu être fabriqué : le même e-mail ne doit pas dire deux choses
     * différentes selon qu'une pièce a pu être produite ou non — c'est
     * précisément le cas que la dette de test d'`emettreFactureCommande`
     * garde ouvert.
     */
    const source = readFileSync(join(process.cwd(), "src/lib/email.ts"), "utf8");
    const debut = source.indexOf("export async function envoyerEmailCommandeConfirmee");
    const fin = source.indexOf("export async function envoyerEmailCommandeExpediee");
    expect(debut).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(debut);
    const corps = source.slice(debut, fin);
    expect(corps).toContain("{ conditionsVente: true }");
    expect(corps).not.toMatch(/conditionsVente:\s*pdfJoint/);
  });

  it("le style est celui du pied, pas celui de l'application", () => {
    /**
     * `#4AAEA0` sans soulignement, comme l'adresse du site juste au-dessus.
     * Ce n'est pas `#1F6E5B`, retenu dans l'APPLICATION au lot APP 36 pour son
     * contraste : deux couleurs de lien côte à côte dans un pied de six lignes
     * se verraient plus que l'écart qu'elles corrigent.
     */
    const pied = piedLiensLegaux(true);
    expect(pied).toContain("color:#4AAEA0");
    expect(pied).not.toContain("#1F6E5B");
  });
});
