import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * L'e-mail « L'article que vous attendiez est revenu ».
 *
 * ── POURQUOI IL FALLAIT Y REVENIR ─────────────────────────────────────────
 *
 * Il avait été laissé de côté au lot APP 30 : c'est un e-mail de boutique, mais
 * pas un e-mail de commande. Résultat, il écrivait « 35.00 CHF TTC » et
 * renvoyait par un bouton vers une fiche article qui, elle, affiche « 35.– ».
 * La cliente cliquait donc d'un prix vers un autre prix, pour le même article.
 *
 * ── LE PIÈGE QUE CE FICHIER SURVEILLE ─────────────────────────────────────
 *
 * Le prix passe par `{prix}`, une variable du modèle MODIFIABLE depuis l'écran
 * des e-mails. Si quelqu'un écrit « {prix} CHF » dans son texte, la cliente
 * lira « 35.– CHF ». Le corps du message ne doit donc coller ni « CHF » ni
 * « TTC » autour de la variable — et le modèle par défaut, vérifié ici, ne le
 * fait pas.
 *
 * L'e-mail est RENDU, Resend et la base simulés : c'est le HTML qui part
 * vraiment qu'on lit, pas une fonction isolée.
 */

const H = vi.hoisted(() => ({
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

/**
 * Aucun modèle personnalisé en base : l'e-mail part donc avec son texte par
 * défaut, celui du code. C'est l'état réel — aucune ligne de ce type n'existe.
 */
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

import { envoyerEmailRetourEnStock } from "@/src/lib/email";
import { MODELE_RETOUR_EN_STOCK } from "@/src/lib/alertesStockLogique";

async function rendre(prix: number | string): Promise<string> {
  H.html = [];
  await envoyerEmailRetourEnStock({
    email: "cliente@exemple.ch",
    article: "Harnais Ruffwear",
    prix,
    articleId: "art-1",
    token: "jeton",
  });
  expect(H.html).toHaveLength(1);
  return H.html[0];
}

beforeEach(() => {
  H.html = [];
});

describe("le prix s'écrit comme sur la fiche vers laquelle l'e-mail renvoie", () => {
  it("un montant rond prend le tiret", async () => {
    const html = await rendre(35);
    expect(html).toContain("35.–");
    expect(html).not.toContain("35.00");
  });

  it("des centimes gardent leurs deux décimales", async () => {
    expect(await rendre(99.9)).toContain("99.90");
  });

  it("les milliers prennent l'apostrophe suisse", async () => {
    // L'ancien formateur passait par `Intl` en fr-CH, qui sépare les milliers
    // par une espace fine insécable. Elle disparaît dans certaines boîtes de
    // réception, et « 1 250.50 » devenait « 1250.50 » ou « 1 250.50 » selon le
    // client de messagerie. L'apostrophe, elle, ne bouge pas.
    const html = await rendre(1250.5);
    expect(html).toContain("1'250.50");
    expect(html).not.toContain(" ");
    expect(html).not.toContain(" 250");
  });
});

describe("plus de « CHF » ni de « TTC » autour du prix", () => {
  it("le bloc du prix ne porte plus aucune des deux mentions", async () => {
    const html = await rendre(35);
    // Le prix est le seul montant de cet e-mail : « CHF » et « TTC » n'y ont
    // donc aucun autre emploi possible.
    expect(html).not.toContain("CHF");
    expect(html).not.toContain("TTC");
  });

  it("le modèle par défaut n'écrit ni « CHF » ni « TTC » à côté de {prix}", () => {
    /**
     * C'est ce qui rend l'e-mail sûr : le texte par défaut ne cite même pas
     * {prix}. Si un jour il le cite, il ne doit pas le doubler d'une unité —
     * « 35.– CHF » est exactement ce qu'on vient d'éviter.
     */
    const tout = Object.values(MODELE_RETOUR_EN_STOCK).join(" ");
    expect(tout).not.toContain("CHF");
    expect(tout).not.toContain("TTC");
  });

  it("le nom de l'article et le lien sont intacts", async () => {
    // La mise en forme change, le message non.
    const html = await rendre(35);
    expect(html).toContain("Harnais Ruffwear");
    expect(html).toContain("/catalogue/art-1");
    expect(html).toContain("Voir l'article");
  });
});

describe("l'aperçu de l'écran d'édition montre le même format", () => {
  it("{prix} a une valeur d'exemple à la suisse, {montant} garde les décimales", () => {
    /**
     * Deux variables voisines et deux formats : {prix} est la variable de la
     * BOUTIQUE, {montant} celle des e-mails de pension et de facture. Un aperçu
     * qui les confondrait apprendrait le mauvais format à qui rédige.
     */
    const source = readFileSync(
      join(__dirname, "..", "app/(admin)/(espace-reglages)/emails/GestionEmails.tsx"),
      "utf8",
    );
    expect(source).toContain('prix: "35.–"');
    expect(source).toContain('montant: "120.00"');
  });
});
