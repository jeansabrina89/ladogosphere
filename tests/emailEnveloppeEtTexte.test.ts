import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { texteDepuisHtml } from "@/src/lib/emailTexte";

/**
 * APP 55 — l'enveloppe des e-mails : à qui l'on répond, et la partie texte.
 *
 * ── DEUX MANQUES QUI NE SE VOYAIENT PAS ───────────────────────────────────
 *
 * 1. Répondre à un e-mail de la pension revenait à écrire à `noreply@`. La
 *    réponse partait, l'expéditeur la croyait lue, et elle n'arrivait nulle
 *    part. Rien, côté application, ne pouvait le signaler.
 *
 * 2. Resend ne fabrique AUCUNE version texte : vérifié dans le SDK installé
 *    (resend 6.12.4), `parseEmailToApiOptions` transmet `text` tel quel, et
 *    `CreateEmailOptions` exige au moins un de `html` / `text` / `react`, pas
 *    les trois. Nos e-mails partaient donc en HTML seul — ce que les filtres
 *    lisent comme un signe de courrier indésirable, et ce que les clients sans
 *    HTML affichent vide.
 *
 * Les deux se vérifient sur un e-mail RÉELLEMENT rendu, Resend simulé.
 */

type Envoi = {
  from?: string;
  replyTo?: string;
  to?: string;
  subject?: string;
  html?: string;
  text?: string;
};

const H = vi.hoisted(() => ({ envois: [] as Envoi[] }));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (p: Envoi) => {
        H.envois.push(p);
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
vi.mock("@/src/lib/entiteJuridiqueLogique", () => ({ raisonSocialeAffichee: () => "La Dogosphère" }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import {
  envoyerEmailReservationValidee,
  envoyerEmailSatisfactionEssai,
  envoyerEmailReservationAnnulee,
} from "@/src/lib/email";

beforeEach(() => {
  H.envois = [];
});

async function confirmation(): Promise<Envoi> {
  await envoyerEmailReservationValidee({
    email: "client@exemple.ch", prenom: "Camille",
    date_debut: "2026-10-05", date_fin: "2026-10-09", type: "sejour",
  });
  expect(H.envois).toHaveLength(1);
  return H.envois[0];
}

// ── A. L'adresse de réponse ────────────────────────────────────────────────

describe("toute réponse arrive sur info@", () => {
  it("la confirmation de réservation la porte", async () => {
    const envoi = await confirmation();
    expect(envoi.replyTo).toBe("info@ladogosphere.ch");
    // L'expéditeur technique n'a pas changé pour autant.
    expect(envoi.from).toContain("noreply@ladogosphere.ch");
  });

  it("les autres e-mails aussi : c’est l’enveloppe commune, pas un cas", async () => {
    await envoyerEmailSatisfactionEssai({
      email: "client@exemple.ch", prenom: "Camille", nom_chien: "Pixel",
    });
    await envoyerEmailReservationAnnulee({
      email: "client@exemple.ch", prenom: "Camille",
      date_debut: "2026-10-05", date_fin: "2026-10-09", type: "sejour",
    });
    expect(H.envois.length).toBeGreaterThanOrEqual(2);
    for (const envoi of H.envois) expect(envoi.replyTo).toBe("info@ladogosphere.ch");
  });

  it("IL N’EXISTE QU’UN SEUL ENDROIT QUI ENVOIE", () => {
    /**
     * L'assertion qui rend les deux précédentes suffisantes. Tant que
     * `resend.emails.send` n'est appelé qu'à un endroit, poser l'adresse de
     * réponse une fois la pose partout. Un second appel ailleurs — un message
     * libre, un ticket — repartirait sans elle, et personne ne s'en
     * apercevrait avant qu'une réponse se perde.
     */
    const racine = join(__dirname, "..");
    const sources: string[] = [];
    const parcourir = (dossier: string) => {
      for (const entree of readdirSync(dossier)) {
        if (entree === "node_modules" || entree.startsWith(".")) continue;
        const chemin = join(dossier, entree);
        if (statSync(chemin).isDirectory()) parcourir(chemin);
        else if (/\.tsx?$/.test(entree)) sources.push(chemin);
      }
    };
    parcourir(join(racine, "src"));
    parcourir(join(racine, "app"));

    const appelants = sources.filter((f) => /\bemails\.send\s*\(/.test(readFileSync(f, "utf8")));
    expect(appelants.map((f) => f.slice(racine.length + 1).replace(/\\/g, "/")))
      .toEqual(["src/lib/email.ts"]);
  });
});

// ── B. La version texte ────────────────────────────────────────────────────

describe("chaque e-mail part avec sa version texte", () => {
  it("envoyerEmail transmet bien `text`, et il n’est pas vide", async () => {
    const envoi = await confirmation();
    expect(typeof envoi.text).toBe("string");
    expect(envoi.text!.length).toBeGreaterThan(80);
    expect(envoi.text).toBe(texteDepuisHtml(envoi.html!));
  });

  it("sur l’e-mail réel : plus une balise, plus une entité", async () => {
    const envoi = await confirmation();
    const texte = envoi.text!;

    expect(texte, "aucune balise résiduelle").not.toContain("<");
    expect(texte).not.toContain(">");
    expect(texte).not.toContain("&nbsp;");
    expect(texte).not.toContain("&amp;");
    // Le CSS du gabarit ne doit pas se retrouver dans le message.
    expect(texte).not.toContain("font-family");
    expect(texte).not.toContain("background-color");
  });

  it("sur l’e-mail réel : les liens gardent leur adresse, jamais deux lignes vides", async () => {
    const envoi = await confirmation();
    const texte = envoi.text!;

    // Le lien légal du pied : un libellé, puis son adresse entre parenthèses.
    expect(texte).toMatch(/Confidentialité \(https:\/\/\S+\)/);
    expect(texte, "jamais deux lignes vides de suite").not.toMatch(/\n\s*\n\s*\n/);
    // Et le message est bien là.
    expect(texte).toContain("Camille");
  });
});

// ── La fonction pure, règle par règle ──────────────────────────────────────

describe("texteDepuisHtml", () => {
  it("le style et l’en-tête partent AVEC leur contenu", () => {
    const t = texteDepuisHtml("<head><title>X</title></head><style>p{color:red}</style><p>Bonjour</p>");
    expect(t).toBe("Bonjour");
  });

  it("un lien devient « libellé (url) »", () => {
    expect(texteDepuisHtml('<a href="https://exemple.ch/x">Voir la page</a>'))
      .toBe("Voir la page (https://exemple.ch/x)");
  });

  it("un libellé qui DIT DÉJÀ l’adresse ne se répète pas", () => {
    // « ladogosphere.ch (https://ladogosphere.ch) » se lit plus mal que l'adresse.
    expect(texteDepuisHtml('<a href="https://ladogosphere.ch">ladogosphere.ch</a>'))
      .toBe("https://ladogosphere.ch");
    // Et l'émoji de tête du pied de page ne doit pas empêcher de le voir.
    expect(texteDepuisHtml('<a href="https://ladogosphere.ch">🌐 ladogosphere.ch</a>'))
      .toBe("https://ladogosphere.ch");
  });

  it("une adresse e-mail perd son « mailto: »", () => {
    // « ✉️ x@y.ch (mailto:x@y.ch) » disait trois fois la même chose.
    expect(texteDepuisHtml('<a href="mailto:x@y.ch">✉️ x@y.ch</a>')).toBe("x@y.ch");
    // Un libellé qui n'est PAS l'adresse la garde, sans le préfixe technique.
    expect(texteDepuisHtml('<a href="mailto:x@y.ch">Écrivez-nous</a>'))
      .toBe("Écrivez-nous (x@y.ch)");
  });

  it("les retours à la ligne viennent des blocs et des <br>", () => {
    expect(texteDepuisHtml("<p>Un</p><p>Deux</p>")).toBe("Un\nDeux");
    expect(texteDepuisHtml("A<br/>B")).toBe("A\nB");
    expect(texteDepuisHtml("<h2>Titre</h2><div>Corps</div>")).toBe("Titre\nCorps");
  });

  it("les entités courantes se décodent", () => {
    expect(texteDepuisHtml("a&nbsp;b &quot;c&quot; d&#39;e &amp; f"))
      .toBe('a b "c" d\'e & f');
  });

  it("« &amp;nbsp; » reste le mot, il ne devient pas une espace", () => {
    /**
     * L'ordre de décodage est la seule chose délicate du module : si `&amp;`
     * se décodait en premier, cette chaîne deviendrait « a b » et le message
     * perdrait un mot sans rien dire.
     */
    expect(texteDepuisHtml("a &amp;nbsp; b")).toBe("a &nbsp; b");
  });

  it("une entité « &lt;p&gt; » écrite dans le texte SURVIT", () => {
    // Décoder avant de retirer les balises en aurait fait une vraie balise,
    // qu'on aurait supprimée.
    expect(texteDepuisHtml("<p>écrire &lt;p&gt; en clair</p>")).toBe("écrire <p> en clair");
  });

  it("les lignes vides se réduisent à une, les espaces de bout tombent", () => {
    expect(texteDepuisHtml("<p>  Un  </p>\n\n\n\n<p>   Deux</p>")).toBe("Un\n\nDeux");
  });

  it("rien du tout ne fait pas tomber la fonction", () => {
    expect(texteDepuisHtml("")).toBe("");
  });
});
