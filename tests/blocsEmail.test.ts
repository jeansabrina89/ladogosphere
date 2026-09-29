import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  accesBlocs,
  interpolerBloc,
  texteBloc,
  valeurBloc,
} from "@/src/lib/blocsEmail";
import { DEFAUTS_MODELES, LIBELLES_BLOCS, MODELES_META } from "@/src/lib/email";
import { texteDepuisHtml } from "@/src/lib/emailTexte";

/**
 * APP 60 — le mécanisme des blocs.
 *
 * L'identité « avant / après » est éprouvée ailleurs, sur les vingt-et-un
 * e-mails rendus (`tests/blocsEmailIdentite.test.ts`). Ce fichier-ci garde la
 * mécanique : d'où vient un texte, ce qui arrive quand on le change, et ce qui
 * arrive quand on essaie d'y glisser autre chose qu'un texte.
 */

const DEFAUTS = { phrase: "Bonjour {prenom}, voici votre séjour.", lignes: ["✔ Un", "✔ Deux"] };

// ── D'où vient un texte ───────────────────────────────────────────────────

describe("la base si elle dit quelque chose, le défaut sinon", () => {
  it("base vide : le défaut", () => {
    expect(valeurBloc(null, DEFAUTS, "phrase")).toBe(DEFAUTS.phrase);
    expect(valeurBloc({}, DEFAUTS, "phrase")).toBe(DEFAUTS.phrase);
  });

  it("base remplie : la base", () => {
    expect(valeurBloc({ phrase: "Autre chose." }, DEFAUTS, "phrase")).toBe("Autre chose.");
  });

  it("UN CHAMP VIDÉ REVIENT AU DÉFAUT, il ne vide pas l’e-mail", () => {
    /**
     * Le seul moyen de faire disparaître un paragraphe est de changer le code.
     * C'est voulu : un e-mail amputé d'une phrase entière ne se remarque pas,
     * et on l'enverrait des mois avant que quelqu'un s'en aperçoive.
     */
    expect(valeurBloc({ phrase: "" }, DEFAUTS, "phrase")).toBe(DEFAUTS.phrase);
    expect(valeurBloc({ phrase: "   " }, DEFAUTS, "phrase")).toBe(DEFAUTS.phrase);
    expect(valeurBloc({ lignes: [] }, DEFAUTS, "lignes")).toEqual(DEFAUTS.lignes);
    expect(valeurBloc({ lignes: ["", "  "] }, DEFAUTS, "lignes")).toEqual(DEFAUTS.lignes);
  });

  it("UNE CLÉ INCONNUE EN BASE EST IGNORÉE", () => {
    // La base ne peut pas inventer un texte que le code n'attend pas.
    const acces = accesBlocs({ inventee: "Surprise !" }, DEFAUTS, {});
    expect(acces.b("inventee")).toBe("");
    expect(acces.b("phrase")).toContain("voici votre séjour");
  });

  it("une liste garde ses lignes non vides, dans l’ordre", () => {
    expect(valeurBloc({ lignes: ["✔ A", "", "✔ B"] }, DEFAUTS, "lignes")).toEqual(["✔ A", "✔ B"]);
  });
});

// ── Les variables ─────────────────────────────────────────────────────────

describe("les variables marchent comme dans les quatre champs", () => {
  it("{prenom} est remplacé", () => {
    expect(interpolerBloc("Bonjour {prenom} !", { prenom: "Camille" })).toBe("Bonjour Camille !");
  });

  it("une variable absente s’efface, elle ne laisse pas d’accolades", () => {
    expect(interpolerBloc("Bonjour {inconnu} !", {})).toBe("Bonjour  !");
  });

  it("dans un bloc de base comme dans un défaut", () => {
    const acces = accesBlocs({ phrase: "Salut {prenom} !" }, DEFAUTS, { prenom: "Camille" });
    expect(acces.b("phrase")).toBe("Salut Camille !");
    const parDefaut = accesBlocs(null, DEFAUTS, { prenom: "Camille" });
    expect(parDefaut.b("phrase")).toBe("Bonjour Camille, voici votre séjour.");
  });

  it("et dans chaque ligne d’une liste", () => {
    const acces = accesBlocs({ lignes: ["✔ Pour {prenom}"] }, DEFAUTS, { prenom: "Camille" });
    expect(acces.l("lignes")).toEqual(["✔ Pour Camille"]);
  });
});

// ── L'échappement ─────────────────────────────────────────────────────────

describe("rien d’autre que du texte ne sort d’un bloc", () => {
  it("UNE BALISE INTERDITE EST ÉCHAPPÉE, pas exécutée", () => {
    const t = texteBloc("<script>alert(1)</script>", {});
    expect(t).not.toContain("<script>");
    expect(t).toContain("&lt;script&gt;");
  });

  it("un lien ne peut pas être glissé", () => {
    const t = texteBloc('<a href="https://ailleurs.ch">cliquez</a>', {});
    expect(t).not.toContain("<a ");
    expect(t).toContain("&lt;a href=&quot;");
  });

  it("<strong> PASSE : c’est la seule balise des quatre champs d’origine", () => {
    /**
     * Vérifié dans `DEFAUTS_MODELES` : les quatre champs n'emploient que
     * `<strong>`, nu ou avec une couleur. Les blocs suivent la même règle —
     * plus strictement, puisque tout le reste est échappé alors que les quatre
     * champs, eux, restent bruts.
     */
    expect(texteBloc("sous <strong>24 heures</strong>.", {})).toBe("sous <strong>24 heures</strong>.");
    expect(texteBloc('<strong style="color:#4AAEA0;">confirmée</strong>', {}))
      .toBe('<strong style="color:#4AAEA0;">confirmée</strong>');
  });

  it("une couleur inventée dans le style NE passe pas", () => {
    // La borne est un code hexadécimal de six chiffres, et rien d'autre.
    const t = texteBloc('<strong style="color:expression(alert(1));">x</strong>', {});
    expect(t).not.toContain("<strong style");
    expect(t).toContain("&lt;strong style=&quot;");
  });

  it("une esperluette reste une esperluette", () => {
    expect(texteBloc("Dupont & Fils", {})).toBe("Dupont &amp; Fils");
  });
});

// ── Les libellés, et la cohérence des deux listes ─────────────────────────

describe("chaque bloc a son libellé français", () => {
  it("aucune clé n’est laissée sans libellé", () => {
    /**
     * L'écran n'affiche que les blocs qui ont un libellé : une clé oubliée ici
     * serait invisible, donc non modifiable, sans que rien ne le signale. Ce
     * test est la seule chose qui empêche les deux listes de dériver.
     */
    const manquants: string[] = [];
    for (const { type } of MODELES_META) {
      const blocs = DEFAUTS_MODELES[type]?.blocs ?? {};
      for (const cle of Object.keys(blocs)) {
        if (!LIBELLES_BLOCS[type]?.[cle]) manquants.push(`${type}/${cle}`);
      }
    }
    expect(manquants, "blocs sans libellé").toEqual([]);
  });

  it("et aucun libellé ne vise une clé qui n’existe pas", () => {
    // L'inverse : un libellé orphelin afficherait un champ sans effet.
    const orphelins: string[] = [];
    for (const [type, libelles] of Object.entries(LIBELLES_BLOCS)) {
      const blocs = DEFAUTS_MODELES[type]?.blocs ?? {};
      for (const cle of Object.keys(libelles)) {
        if (!(cle in blocs)) orphelins.push(`${type}/${cle}`);
      }
    }
    expect(orphelins, "libellés orphelins").toEqual([]);
  });

  it("aucun libellé n’est une clé technique", () => {
    for (const [type, libelles] of Object.entries(LIBELLES_BLOCS)) {
      for (const [cle, libelle] of Object.entries(libelles)) {
        expect(libelle, `${type}/${cle}`).not.toBe(cle);
        expect(libelle, `${type}/${cle}`).not.toMatch(/_/);
      }
    }
  });
});

// ── L'e-mail rendu, avec un bloc changé ───────────────────────────────────

type LigneModele = { sujet: null; titre: null; intro: null; message_final: null; blocs: Record<string, unknown> };

const H = vi.hoisted(() => ({ html: [] as string[], blocs: {} as Record<string, unknown> }));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (p: { html: string }) => { H.html.push(p.html); return { data: { id: "x" }, error: null }; },
    };
  },
}));

vi.mock("@/src/lib/supabase-admin", () => {
  function from(table: string) {
    /**
     * La doublure RESPECTE la liste des colonnes demandées.
     *
     * Sans cela, elle rendait `blocs` même quand la requête ne le demandait
     * pas : on pouvait retirer la colonne du `select` sans qu'aucun test ne
     * bronche. Une mutation l'a montré, et c'est exactement le genre d'oubli
     * qui ne se voit qu'en production — l'e-mail partirait avec les textes
     * d'origine, sans erreur.
     */
    let colonnes: string[] = [];
    const c = {
      select: (cols?: string) => {
        colonnes = String(cols ?? "").split(",").map((x) => x.trim()).filter(Boolean);
        return c;
      },
      eq: () => c, order: () => c, limit: () => c,
      insert: () => Promise.resolve({ error: null }),
      maybeSingle: async () => {
        if (table !== "modeles_email") return { data: null, error: null };
        const complet = {
          sujet: null, titre: null, intro: null, message_final: null, blocs: H.blocs,
        } as Record<string, unknown>;
        const retenu: Record<string, unknown> = {};
        for (const col of colonnes) if (col in complet) retenu[col] = complet[col];
        return { data: retenu as unknown as LigneModele, error: null };
      },
      single: async () => ({ data: null, error: null }),
      in: () => ({
        then: <T,>(f: (v: { data: unknown[]; error: null }) => T) =>
          Promise.resolve({ data: [] as unknown[], error: null }).then(f),
      }),
      then: <T,>(f: (v: { data: unknown[]; error: null }) => T) =>
        Promise.resolve({ data: [] as unknown[], error: null }).then(f),
    };
    return c;
  }
  return { supabaseAdmin: { from } };
});

vi.mock("@/src/lib/entiteJuridique", () => ({ entiteA: async () => ({}) }));
vi.mock("@/src/lib/entiteJuridiqueLogique", () => ({ raisonSocialeAffichee: () => "La Dogosphère Sàrl" }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import { envoyerEmailRappelCotisation, envoyerEmailConfirmationDemande } from "@/src/lib/email";

beforeEach(() => {
  H.html = [];
  H.blocs = {};
});

async function rendreAdhesion(): Promise<string> {
  await envoyerEmailRappelCotisation({
    email: "client@exemple.ch", prenom: "Camille", nom: "Rey",
    date_fin: "2026-08-31", montant: 200,
    iban: "CH00 0000 0000 0000 0000 0", titulaire: "Sabrina Jean", variante: "echue",
  });
  expect(H.html).toHaveLength(1);
  return H.html[0];
}

describe("un bloc changé part dans l’e-mail", () => {
  it("un titre d’encadré", async () => {
    H.blocs = { avantages_titre: "🐾 Ce que l'adhésion vous donne" };
    const html = await rendreAdhesion();
    expect(html).toContain("🐾 Ce que l'adhésion vous donne");
    expect(html).not.toContain("🐾 Avantages membres");
  });

  it("UNE LISTE, avec une ligne en plus", async () => {
    H.blocs = { avantages_lignes: ["✔ Un", "✔ Deux", "✔ Trois", "✔ Quatre"] };
    const html = await rendreAdhesion();
    for (const l of ["✔ Un", "✔ Deux", "✔ Trois", "✔ Quatre"]) expect(html).toContain(l);
    expect(html).not.toContain("Remise membre sur certains rayons");
  });

  it("une variable dans un bloc changé", async () => {
    H.blocs = { avantages_titre: "Pour {prenom}" };
    expect(await rendreAdhesion()).toContain("Pour Camille");
  });

  it("une balise interdite dans un bloc changé est ÉCHAPPÉE", async () => {
    H.blocs = { avantages_titre: '<img src=x onerror="alert(1)">' };
    const html = await rendreAdhesion();
    // Le gabarit a ses propres `<img>` (le logo) : on vise l'injection, pas la
    // balise en général.
    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("une clé inconnue en base ne change rien", async () => {
    H.blocs = { cle_qui_nexiste_pas: "Bonjour" };
    const html = await rendreAdhesion();
    expect(html).toContain("🐾 Avantages membres");
    expect(html).not.toContain("Bonjour</p>");
  });

  it("LA VERSION TEXTE SUIT le bloc changé", async () => {
    /**
     * `texteDepuisHtml` (APP 55) travaille sur le HTML produit : elle suit donc
     * sans rien savoir des blocs. Le test le vérifie plutôt que de le supposer.
     */
    H.blocs = { avantages_titre: "🐾 Ce que l'adhésion vous donne" };
    const texte = texteDepuisHtml(await rendreAdhesion());
    expect(texte).toContain("🐾 Ce que l'adhésion vous donne");
    expect(texte).not.toContain("<");
  });

  it("et un bloc d’un AUTRE e-mail ne se mélange pas", async () => {
    H.blocs = { attente: "⏳ Réponse sous 48 heures." };
    await envoyerEmailConfirmationDemande({
      email: "client@exemple.ch", prenom: "Camille",
      date_debut: "2027-03-05", date_fin: "2027-03-09", type: "sejour",
    });
    expect(H.html[0]).toContain("⏳ Réponse sous 48 heures.");
  });
});

// ── Le geste d'enregistrement ─────────────────────────────────────────────

describe("l’enregistrement efface plutôt que d’écrire du vide", () => {
  const src = readFileSync(join(__dirname, "..", "app/api/emails/modeles/route.ts"), "utf8");

  it("une clé vide n’est PAS écrite : c’est « Revenir au texte d’origine »", () => {
    expect(src).toContain("function blocsANettoyer");
    expect(src).toContain('if (typeof valeur === "string" && valeur.trim() !== "") propres[cle] = valeur;');
    expect(src).toContain("if (lignes.length > 0) propres[cle] = lignes;");
  });

  it("les blocs partent avec les quatre champs, sous la même garde", () => {
    expect(src).toContain("ligne.blocs = blocsANettoyer(body?.blocs);");
    // La garde d'origine n'a pas bougé : même permission, même journal.
    expect(src).toContain('exigerAdmin("modele_email")');
    expect(src.indexOf('exigerAdmin("modele_email")')).toBeLessThan(src.indexOf("blocsANettoyer(body?.blocs)"));
  });

  it("l’écran offre le retour à l’origine, et l’ajout d’une ligne", () => {
    const ecran = readFileSync(
      join(__dirname, "..", "app/(admin)/(espace-reglages)/emails/GestionEmails.tsx"), "utf8",
    );
    expect(ecran).toContain("Autres textes de cet e-mail");
    expect(ecran).toContain("Revenir au texte d&apos;origine");
    expect(ecran).toContain("+ Ajouter une ligne");
    // Il n'affiche que les blocs qui ont un libellé.
    expect(ecran).toContain("Object.keys(email.blocsDefaut).filter((c) => email.libellesBlocs[c])");
  });

  it("la migration ajoute la colonne sans rien casser", () => {
    const sql = readFileSync(
      join(__dirname, "..", "supabase/migrations/20260929225234_app60_blocs_email.sql"), "utf8",
    );
    expect(sql).toMatch(/add column if not exists blocs jsonb not null default '\{\}'::jsonb/);
  });
});
