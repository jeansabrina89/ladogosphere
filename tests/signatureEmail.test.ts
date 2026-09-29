import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CLES_SIGNATURE,
  SIGNATURE_DEFAUT,
  refusSignature,
  signatureDepuisReglages,
  signatureDepuisSaisie,
  signatureHtml,
  siteAffiche,
  telephoneLien,
  type Signature,
} from "@/src/lib/signatureEmail";
import { texteDepuisHtml } from "@/src/lib/emailTexte";

/**
 * APP 58 — la signature des e-mails devient un réglage.
 *
 * ── LE RISQUE DU LOT, ET CE QUI LE COUVRE ─────────────────────────────────
 *
 * Transformer du code en réglage casse toujours au même endroit : le jour du
 * déploiement, la valeur lue n'est pas tout à fait celle qui était écrite, et
 * la signature de chaque e-mail change sans que personne l'ait demandé. Le
 * premier test compare donc le HTML rendu, au caractère près, à celui d'avant
 * le lot — indentation et marges comprises.
 *
 * Le second risque est la panne : une base qui ne répond pas ne doit pas
 * empêcher un e-mail de partir, ni le faire partir amputé de son pied de page.
 */

const RAISON = "La Dogosphère Sàrl";

/** La signature telle qu'elle était écrite en dur dans `emailTemplate`. */
const AVANT_LE_LOT = `<p style="margin:0 0 4px 0; font-weight:bold; color:#1B2B5E; font-size:14px;">Sabrina Jean</p>
                    <p style="margin:0 0 4px 0; color:#6B7280; font-size:13px;">${RAISON} — Responsable</p>
                    <p style="margin:0 0 4px 0; color:#6B7280; font-size:13px;">📍 Sion, Valais, Suisse</p>
                    <p style="margin:0 0 4px 0; font-size:13px;">
                      <a href="mailto:ladogosphere@gmail.com" style="color:#4AAEA0; text-decoration:none;">✉️ ladogosphere@gmail.com</a>
                    </p>
                    <p style="margin:0; font-size:13px;">
                      <a href="https://ladogosphere.ch" style="color:#4AAEA0; text-decoration:none;">🌐 ladogosphere.ch</a>
                    </p>`;

const S = (p: Partial<Signature> = {}): Signature => ({ ...SIGNATURE_DEFAUT, ...p });

// ── Le jour du déploiement ────────────────────────────────────────────────

describe("avec les valeurs de départ, RIEN ne change", () => {
  it("le HTML est identique à celui d’avant le lot, au caractère près", () => {
    /**
     * Le test du lot. Il attrape l'indentation, l'ordre des lignes, et surtout
     * la DERNIÈRE marge : `margin:0` là où les autres portent
     * `margin:0 0 4px 0`. Un détail que personne ne remarquerait à l'œil, et
     * qui décollerait le pied de page de tous les e-mails.
     */
    expect(signatureHtml(SIGNATURE_DEFAUT, RAISON)).toBe(AVANT_LE_LOT);
  });

  it("et les valeurs de départ sont bien celles d’hier", () => {
    expect(SIGNATURE_DEFAUT).toEqual({
      nom: "Sabrina Jean",
      fonction: "Responsable",
      adresse: "Sion, Valais, Suisse",
      email: "ladogosphere@gmail.com",
      telephone: "",
      site: "https://ladogosphere.ch",
    });
  });
});

// ── Chaque champ ──────────────────────────────────────────────────────────

describe("chaque champ modifié se voit", () => {
  it("le nom, l’adresse et l’e-mail", () => {
    const html = signatureHtml(
      S({ nom: "Camille Rey", adresse: "Rue du Lac 3, Sion", email: "camille@exemple.ch" }),
      RAISON,
    );
    expect(html).toContain("Camille Rey");
    expect(html).toContain("📍 Rue du Lac 3, Sion");
    expect(html).toContain('href="mailto:camille@exemple.ch"');
    expect(html).toContain("✉️ camille@exemple.ch");
  });

  it("le téléphone apparaît APRÈS l’e-mail, avec un lien sans espaces", () => {
    const html = signatureHtml(S({ telephone: "+41 27 000 00 00" }), RAISON);
    expect(html).toContain('href="tel:+41270000000"');
    expect(html).toContain("📞 +41 27 000 00 00");
    expect(html.indexOf("📞")).toBeGreaterThan(html.indexOf("✉️"));
    expect(html.indexOf("📞")).toBeLessThan(html.indexOf("🌐"));
  });

  it("TÉLÉPHONE VIDE : aucune ligne 📞", () => {
    const html = signatureHtml(S({ telephone: "" }), RAISON);
    expect(html).not.toContain("📞");
    expect(html).not.toContain("tel:");
  });

  it("FONCTION VIDE : la raison sociale seule, sans tiret orphelin", () => {
    const html = signatureHtml(S({ fonction: "" }), RAISON);
    expect(html).toContain(`>${RAISON}</p>`);
    expect(html).not.toContain(`${RAISON} —`);
  });

  it("adresse vide ou site vide : la ligne disparaît", () => {
    expect(signatureHtml(S({ adresse: "" }), RAISON)).not.toContain("📍");
    expect(signatureHtml(S({ site: "" }), RAISON)).not.toContain("🌐");
  });

  it("LA DERNIÈRE LIGNE N’A JAMAIS DE MARGE BASSE, quelle qu’elle soit", () => {
    // Avec un téléphone, c'est le site ; sans site, c'est le téléphone.
    const avecTel = signatureHtml(S({ telephone: "079 000 00 00" }), RAISON);
    expect(avecTel.trimEnd().endsWith("</p>")).toBe(true);
    expect((avecTel.match(/margin:0;/g) ?? []).length, "une seule marge nulle").toBe(1);

    const sansSite = signatureHtml(S({ telephone: "079 000 00 00", site: "" }), RAISON);
    const derniere = sansSite.slice(sansSite.lastIndexOf('<p style="'));
    expect(derniere).toContain("margin:0;");
    expect(derniere).toContain("📞");
  });

  it("le site perd son https:// et sa barre finale, mais pas son lien", () => {
    const html = signatureHtml(S({ site: "https://exemple.ch/" }), RAISON);
    expect(html).toContain('href="https://exemple.ch/"');
    expect(html).toContain("🌐 exemple.ch");
    expect(siteAffiche("https://exemple.ch/")).toBe("exemple.ch");
    expect(siteAffiche("https://exemple.ch")).toBe("exemple.ch");
  });

  it("le lien tel: ne garde que les chiffres et le +", () => {
    expect(telephoneLien("+41 27 000.00.00")).toBe("+41270000000");
    expect(telephoneLien("079 123 45 67")).toBe("0791234567");
  });
});

// ── L’échappement ─────────────────────────────────────────────────────────

describe("rien de ce qui est saisi ne sort de sa balise", () => {
  it("une balise <script> est échappée, pas exécutée", () => {
    const html = signatureHtml(S({ nom: "<script>alert(1)</script>" }), RAISON);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("un guillemet ne referme pas un attribut", () => {
    /**
     * Le cas qui compte : l'e-mail et le site partent DANS un `href`. Un
     * guillemet non échappé y ouvrirait un attribut à soi.
     */
    const html = signatureHtml(S({ site: 'https://x.ch/" onclick="alert(1)' }), RAISON);
    expect(html).not.toContain('" onclick="');
    expect(html).toContain("&quot;");
  });

  it("une esperluette reste une esperluette", () => {
    expect(signatureHtml(S({ adresse: "Dupont & Fils" }), RAISON)).toContain("Dupont &amp; Fils");
  });
});

// ── La validation ─────────────────────────────────────────────────────────

describe("la validation, et ses phrases", () => {
  it("la signature de départ passe", () => {
    expect(refusSignature(SIGNATURE_DEFAUT)).toBeNull();
  });

  it("nom vide, nom trop long", () => {
    expect(refusSignature(S({ nom: "  " }))).toEqual({
      champ: "nom", message: "Le nom est obligatoire.",
    });
    expect(refusSignature(S({ nom: "a".repeat(81) }))?.message)
      .toBe("Le nom ne doit pas dépasser 80 caractères.");
  });

  it("fonction et adresse : facultatives, mais bornées à 120", () => {
    expect(refusSignature(S({ fonction: "", adresse: "" }))).toBeNull();
    expect(refusSignature(S({ fonction: "a".repeat(121) }))?.message)
      .toBe("La fonction ne doit pas dépasser 120 caractères.");
    expect(refusSignature(S({ adresse: "a".repeat(121) }))?.message)
      .toBe("L'adresse ne doit pas dépasser 120 caractères.");
  });

  it("e-mail obligatoire et valide", () => {
    expect(refusSignature(S({ email: "" }))?.message).toBe("L'e-mail affiché est obligatoire.");
    for (const mauvais of ["pasunemail", "a@b", "a b@c.ch", "@c.ch"]) {
      expect(refusSignature(S({ email: mauvais }))?.message, mauvais)
        .toBe("L'e-mail affiché n'est pas valide.");
    }
  });

  it("téléphone : chiffres, espaces, « + » et « . » seulement", () => {
    expect(refusSignature(S({ telephone: "+41 27 000.00.00" }))).toBeNull();
    expect(refusSignature(S({ telephone: "" }))).toBeNull();
    expect(refusSignature(S({ telephone: "027 appelez-nous" }))?.message)
      .toBe("Le téléphone ne peut contenir que des chiffres, des espaces, « + » et « . ».");
  });

  it("SITE EN http:// : refusé, avec la phrase", () => {
    expect(refusSignature(S({ site: "http://ladogosphere.ch" }))).toEqual({
      champ: "site", message: "Le site doit commencer par https://.",
    });
    expect(refusSignature(S({ site: "ladogosphere.ch" }))?.champ).toBe("site");
    // Vide, il est accepté : la ligne disparaît, c'est un choix possible.
    expect(refusSignature(S({ site: "" }))).toBeNull();
  });

  it("la saisie perd ses espaces de bout", () => {
    expect(signatureDepuisSaisie({ [CLES_SIGNATURE.nom]: "  Camille  " }).nom).toBe("Camille");
  });
});

// ── La lecture, tolérante ─────────────────────────────────────────────────

describe("une base muette ou abîmée ne mutile pas le pied de page", () => {
  it("AUCUNE clé enregistrée : la signature de départ", () => {
    expect(signatureDepuisReglages(new Map())).toEqual(SIGNATURE_DEFAUT);
  });

  it("une clé MANQUANTE reprend sa valeur de départ, les autres tiennent", () => {
    const map = new Map([[CLES_SIGNATURE.nom, "Camille Rey"]]);
    const s = signatureDepuisReglages(map);
    expect(s.nom).toBe("Camille Rey");
    expect(s.fonction).toBe("Responsable");
    expect(s.site).toBe("https://ladogosphere.ch");
  });

  it("une clé PRÉSENTE ET VIDE est respectée : on peut effacer une ligne", () => {
    /**
     * La distinction qui fait tout : « absente » et « vide » ne veulent pas
     * dire la même chose. Sans elle, effacer la fonction la ferait revenir au
     * rafraîchissement, et personne ne comprendrait pourquoi.
     */
    const map = new Map([[CLES_SIGNATURE.fonction, ""], [CLES_SIGNATURE.adresse, ""]]);
    const s = signatureDepuisReglages(map);
    expect(s.fonction).toBe("");
    expect(s.adresse).toBe("");
  });

  it("le NOM et l’E-MAIL vides reprennent leur valeur de départ", () => {
    // Une signature sans nom ne se distingue pas d'une panne.
    const map = new Map([[CLES_SIGNATURE.nom, ""], [CLES_SIGNATURE.email, ""]]);
    const s = signatureDepuisReglages(map);
    expect(s.nom).toBe("Sabrina Jean");
    expect(s.email).toBe("ladogosphere@gmail.com");
  });

  it("une valeur ILLISIBLE écrite à la main en base ne sort pas dans un e-mail", () => {
    const map = new Map([[CLES_SIGNATURE.site, "http://pas-securise.ch"]]);
    expect(signatureDepuisReglages(map).site).toBe("https://ladogosphere.ch");
  });
});

// ── La version texte suit toute seule ─────────────────────────────────────

describe("la version texte (APP 55) suit la signature", () => {
  it("les lignes modifiées s’y retrouvent, sans balise", () => {
    const html = signatureHtml(
      S({ nom: "Camille Rey", telephone: "+41 27 000 00 00" }),
      RAISON,
    );
    const texte = texteDepuisHtml(html);
    expect(texte).toContain("Camille Rey");
    expect(texte).toContain("📞 +41 27 000 00 00");
    expect(texte).not.toContain("<");
    // Le site garde son adresse. Pas de « (url) » ici : APP 55 ne répète pas
    // une adresse que le libellé dit déjà — « 🌐 ladogosphere.ch » EST le lien.
    expect(texte).toContain("https://ladogosphere.ch");
  });

  it("une ligne absente du HTML est absente du texte", () => {
    expect(texteDepuisHtml(signatureHtml(S({ telephone: "" }), RAISON))).not.toContain("📞");
  });
});

// ── L’e-mail rendu, Resend simulé ─────────────────────────────────────────

type LigneParam = { cle: string; valeur: string };

const H = vi.hoisted(() => ({
  html: [] as string[],
  reglages: [] as LigneParam[],
  lectureEchoue: false,
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
    const chain = {
      select: () => chain,
      eq: () => chain,
      insert: () => Promise.resolve({ error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      in: () => {
        if (H.lectureEchoue) throw new Error("base indisponible");
        return {
          then: <T,>(f: (v: { data: LigneParam[]; error: null }) => T) =>
            Promise.resolve({
              data: table === "parametres" ? H.reglages : [],
              error: null,
            }).then(f),
        };
      },
    };
    return chain;
  }
  return { supabaseAdmin: { from } };
});

vi.mock("@/src/lib/entiteJuridique", () => ({ entiteA: async () => ({}) }));
vi.mock("@/src/lib/entiteJuridiqueLogique", () => ({ raisonSocialeAffichee: () => RAISON }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import { envoyerEmailSatisfactionEssai } from "@/src/lib/email";

async function rendre(): Promise<string> {
  H.html = [];
  await envoyerEmailSatisfactionEssai({
    email: "client@exemple.ch", prenom: "Camille", nom_chien: "Pixel",
  });
  expect(H.html).toHaveLength(1);
  return H.html[0];
}

beforeEach(() => {
  H.html = [];
  H.reglages = [];
  H.lectureEchoue = false;
});

describe("l’e-mail rendu porte la signature réglée", () => {
  it("sans aucun réglage : le pied de page d’avant le lot", async () => {
    const html = await rendre();
    expect(html).toContain(AVANT_LE_LOT);
  });

  it("avec un téléphone réglé : la ligne paraît dans l’e-mail", async () => {
    H.reglages = [
      { cle: CLES_SIGNATURE.nom, valeur: "Camille Rey" },
      { cle: CLES_SIGNATURE.telephone, valeur: "+41 27 000 00 00" },
    ];
    const html = await rendre();
    expect(html).toContain("Camille Rey");
    expect(html).toContain('href="tel:+41270000000"');
    expect(html).toContain("📞 +41 27 000 00 00");
  });

  it("LA LECTURE ÉCHOUE : l’e-mail part quand même, avec la signature de départ", async () => {
    /**
     * Même règle que le lien d'avis : une base qui ne répond pas ne doit pas
     * empêcher une confirmation de partir. Le pire qu'on risque est une
     * signature d'hier ; un e-mail jamais envoyé, non.
     */
    H.lectureEchoue = true;
    const html = await rendre();
    expect(html).toContain(AVANT_LE_LOT);
    expect(html).toContain("Sabrina Jean");
  });

  it("la version texte de l’e-mail rendu suit, elle aussi", async () => {
    H.reglages = [{ cle: CLES_SIGNATURE.telephone, valeur: "079 000 00 00" }];
    const html = await rendre();
    expect(texteDepuisHtml(html)).toContain("📞 079 000 00 00");
  });
});

// ── La permission, et l’écran ─────────────────────────────────────────────

const lire = (relatif: string) => readFileSync(join(__dirname, "..", relatif), "utf8");

describe("la route est réservée à l’administration", () => {
  it("la garde est celle des autres routes d’e-mails", () => {
    /**
     * Le fait qu'une employée soit refusée — et refusée AVANT toute écriture —
     * est éprouvé en MONTANT la route, dans
     * `tests/signatureEmailRoute.test.ts`. Ce test-ci ne garde qu'une chose
     * que la lecture seule peut garder : la garde employée est bien celle des
     * autres routes d'e-mails, et non une garde écrite à part.
     *
     * Une première version comparait ici des positions dans le fichier. Elle
     * restait verte quand on déplaçait la garde APRÈS l'enregistrement : le
     * nom apparaissait d'abord dans la ligne d'import, et l'ordre mesuré
     * n'était pas celui des instructions.
     */
    const src = lire("app/api/emails/reglages/route.ts");
    expect(src).toContain("exigerAdminApi(supabase)");
    expect(src).toContain("if (refusAcces) return refusAcces;");
  });

  it("chaque clé écrite laisse une trace nommée au journal", () => {
    const src = lire("app/api/emails/reglages/route.ts");
    expect(src).toContain("tracerEvenement");
    const libelles = lire("src/lib/journalEvenements.ts");
    for (const cle of Object.values(CLES_SIGNATURE)) {
      expect(libelles, cle).toContain(`${cle}:`);
    }
  });
});

describe("l’écran des réglages", () => {
  it("les six champs, la phrase d’aide et la note de réponse", () => {
    const src = lire("app/(admin)/(espace-reglages)/emails/GestionEmails.tsx");
    for (const libelle of ["Nom", "Fonction", "Adresse", "E-mail affiché", "Téléphone", "Site internet"]) {
      expect(src, libelle).toContain(`libelle: "${libelle}"`);
    }
    expect(src).toContain("La raison sociale se modifie dans Réglages → Entreprise.");
    expect(src).toContain(
      "Les réponses des clients arrivent toujours sur info@ladogosphere.ch, quel que soit l'e-mail affiché ici.",
    );
  });

  it("L’APERÇU EST LE MÊME RENDU QUE L’E-MAIL", () => {
    // Un aperçu redessiné à la main finirait par montrer autre chose que ce
    // qui part — et c'est quand on croit avoir vérifié qu'on ne vérifie plus.
    const src = lire("app/(admin)/(espace-reglages)/emails/GestionEmails.tsx");
    expect(src).toContain("signatureHtml(s, raisonSociale)");
  });

  it("l’adresse de réponse d’APP 55 n’est PAS un réglage", () => {
    // Elle reste écrite dans le code : c'est une boîte technique, pas un
    // affichage. La note de l'écran le dit, et rien ne permet de la changer.
    const src = lire("src/lib/email.ts");
    expect(src).toContain('const REPONDRE_A = "info@ladogosphere.ch";');
    expect(src).not.toContain("signature_reponse");
  });

  it("la migration pose les six clés sans écraser un réglage déjà fait", () => {
    const sql = lire("supabase/migrations/20260929213941_app58_signature_emails.sql");
    for (const cle of Object.values(CLES_SIGNATURE)) expect(sql, cle).toContain(`'${cle}'`);
    expect(sql).toContain("'Sabrina Jean'");
    expect(sql).toMatch(/on conflict \(cle\) do nothing/);
  });
});
