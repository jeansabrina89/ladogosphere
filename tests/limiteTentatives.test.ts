import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * C-13 : les limites de tentatives de notre côté (APP 29).
 *
 * ── CE QUE L'INVENTAIRE A TROUVÉ ──────────────────────────────────────────
 *
 * Le brief visait trois chemins. Deux étaient DÉJÀ couverts :
 *
 *   * les e-mails de test — `refusGardeFou` compte les lignes `test:%`
 *     d'`emails_envoyes` sur dix minutes glissantes et refuse au-delà de trente.
 *     Un plafond GLOBAL, donc plus protecteur qu'un plafond par adresse : il ne
 *     se contourne pas en changeant de destinataire ;
 *   * les relances de paiement — derrière `perm_factures`, déclenchées à la main,
 *     un envoi par facture.
 *
 * Restait l'e-mail « Vous avez déjà un compte » du lot 28 : le seul envoi
 * joignable SANS être connecté, vers une adresse arbitraire. Sans plafond, on se
 * sert de notre domaine pour harceler une boîte — et notre réputation
 * d'expéditeur en paie le prix, donc à terme toutes nos factures.
 *
 * ── CE QUE CE FICHIER PEUT ────────────────────────────────────────────────
 *
 * La suite tourne sans base. Le comptage lui-même — la N+1ᵉ refusée, la fenêtre
 * suivante qui repasse — est éprouvé en base, en transaction annulée, et consigné
 * dans le message du commit. Ici on garde la mécanique d'appel et les seuils.
 */

const H = vi.hoisted(() => ({
  /** Les appels au comptage, dans l'ordre. */
  appels: [] as Record<string, unknown>[],
  /** Ce que la base répond, appel par appel. */
  reponses: [] as boolean[],
  /** La base est-elle en panne ? */
  panne: false,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: () => {}, captureMessage: () => {},
}));
vi.mock("@/src/lib/supabase-admin", () => ({
  supabaseAdmin: {
    rpc: async (nom: string, args: Record<string, unknown>) => {
      if (H.panne) throw new Error("base indisponible");
      H.appels.push({ nom, ...args });
      const r = H.reponses.shift();
      return { data: r === undefined ? true : r, error: null };
    },
  },
}));

const { tentativeAutorisee, ipDeLaRequete, LIMITES } =
  await import("@/src/lib/limiteTentatives");

beforeEach(() => {
  H.appels.length = 0;
  H.reponses.length = 0;
  H.panne = false;
});

describe("les seuils retenus", () => {
  it("l'e-mail public : UNE par heure et par adresse", () => {
    // Décidé par Sabrina le 27.09.2026. Le message est toujours le même : en
    // envoyer deux dans l'heure n'apprend rien de plus.
    expect(LIMITES.email_compte_existe.plafond).toBe(1);
    expect(LIMITES.email_compte_existe.fenetreMinutes).toBe(60);
  });

  it("et cinq par heure et par IP : harceler mille boîtes une fois chacune", () => {
    // Ce que le plafond par adresse laisserait passer sans broncher.
    expect(LIMITES.email_compte_existe.plafondIp).toBe(5);
  });

  it("les e-mails de test n'y figurent PAS : ils étaient déjà plafonnés", async () => {
    /**
     * Ce test garde une DÉCISION, pas un mécanisme. Doubler une limite qui existe
     * la resserre sans le vouloir : trente par heure au lieu de trente par dix
     * minutes, c'est-à-dire l'inverse de ce qu'on voulait.
     */
    expect(Object.keys(LIMITES)).toEqual(["email_compte_existe"]);
    const { PLAFOND_ENVOIS, FENETRE_MINUTES } = await import("@/src/lib/emailsDeTest");
    expect(PLAFOND_ENVOIS, "la limite existante, inchangée").toBe(30);
    expect(FENETRE_MINUTES, "sur dix minutes, pas soixante").toBe(10);
  });
});

describe("les deux clés, et il faut les deux", () => {
  it("l'adresse est comptée, puis l'IP", async () => {
    await tentativeAutorisee("email_compte_existe", { email: "a@b.ch", ip: "1.2.3.4" });
    expect(H.appels).toHaveLength(2);
    expect(H.appels[0]).toMatchObject({
      nom: "tentative_autorisee", p_geste: "email_compte_existe",
      p_cle: "a@b.ch", p_genre: "email", p_plafond: 1, p_fenetre_minutes: 60,
    });
    expect(H.appels[1]).toMatchObject({ p_cle: "1.2.3.4", p_genre: "ip", p_plafond: 5 });
  });

  it("l'adresse refusée arrête tout : l'IP n'est PAS comptée", async () => {
    /**
     * Sinon le compteur d'IP se remplirait à cause de quelqu'un qui s'obstine sur
     * une seule boîte, et finirait par bloquer ses autres tentatives légitimes.
     */
    H.reponses = [false];
    const ok = await tentativeAutorisee("email_compte_existe", { email: "a@b.ch", ip: "1.2.3.4" });
    expect(ok).toBe(false);
    expect(H.appels, "un seul appel : l'adresse").toHaveLength(1);
  });

  it("l'IP refusée refuse aussi, même si l'adresse passait", async () => {
    H.reponses = [true, false];
    expect(await tentativeAutorisee("email_compte_existe", { email: "a@b.ch", ip: "1.2.3.4" }))
      .toBe(false);
  });

  it("les deux passent : la tentative est autorisée", async () => {
    H.reponses = [true, true];
    expect(await tentativeAutorisee("email_compte_existe", { email: "a@b.ch", ip: "1.2.3.4" }))
      .toBe(true);
  });

  it("une clé absente n'est pas comptée, et ne bloque rien", async () => {
    await tentativeAutorisee("email_compte_existe", { email: "a@b.ch" });
    expect(H.appels).toHaveLength(1);
    H.appels.length = 0;
    await tentativeAutorisee("email_compte_existe", {});
    expect(H.appels).toHaveLength(0);
  });
});

describe("en cas de panne de la base", () => {
  it("la tentative est AUTORISÉE, et c'est un choix assumé", async () => {
    /**
     * Refuser serait « fermer par défaut », la règle habituelle. Mais ici, refuser
     * rendrait l'inscription inopérante au premier hoquet de la base — alors que
     * ce qu'on protège est un envoi d'e-mail, pas un accès à des données. Le déni
     * de service coûterait plus que l'abus qu'on évite.
     *
     * Le raisonnement est écrit dans le module : sans lui, quelqu'un inversera ce
     * choix en le croyant négligent.
     */
    H.panne = true;
    expect(await tentativeAutorisee("email_compte_existe", { email: "a@b.ch" })).toBe(true);

    const src = readFileSync(join(__dirname, "..", "src/lib/limiteTentatives.ts"), "utf8");
    expect(src).toMatch(/EN CAS DE PANNE/);
    expect(src).toMatch(/déni de service/i);
  });
});

describe("l'IP de la requête", () => {
  const entetes = (h: Record<string, string>) => new Headers(h);

  it("la PREMIÈRE de x-forwarded-for : c'est celle du client", () => {
    // La liste va du client vers les relais. Prendre la dernière donnerait
    // l'adresse de Vercel, donc la même pour tout le monde.
    expect(ipDeLaRequete(entetes({ "x-forwarded-for": "9.9.9.9, 10.0.0.1, 10.0.0.2" })))
      .toBe("9.9.9.9");
  });

  it("x-real-ip en second recours", () => {
    expect(ipDeLaRequete(entetes({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
  });

  it("rien du tout : null, et le plafond par adresse suffira", () => {
    expect(ipDeLaRequete(entetes({}))).toBeNull();
    expect(ipDeLaRequete(entetes({ "x-forwarded-for": "  " }))).toBeNull();
  });
});

describe("le branchement, relu dans le code", () => {
  const action = () =>
    readFileSync(join(__dirname, "..", "app/(public)/inscription/actions.ts"), "utf8");

  it("l'e-mail « déjà un compte » passe par la limite", () => {
    const src = action();
    expect(src).toMatch(/tentativeAutorisee\("email_compte_existe", \{ email: cible, ip \}\)/);
  });

  it("la limite est posée APRÈS la recherche du compte", () => {
    /**
     * Et c'est délibéré : le compteur ne doit se remplir que pour les adresses qui
     * donneraient vraiment lieu à un envoi. Le poser avant ferait compter les
     * adresses inconnues — donc bloquer une personne au motif que quelqu'un
     * d'autre a tâtonné sur des adresses au hasard.
     */
    const src = action();
    expect(src.indexOf("tentativeAutorisee"))
      .toBeGreaterThan(src.indexOf("compteAuthParEmail(cible)"));
  });

  it("l'IP est lue au SERVEUR, jamais reçue en paramètre", () => {
    // Un paramètre serait choisi par l'appelant, donc changé à chaque tentative.
    const src = action();
    expect(src).toMatch(/ipDeLaRequete\(await headers\(\)\)/);
    expect(src, "la signature ne prend que l'adresse")
      .toMatch(/signalerInscriptionSiCompteExiste\(email: string\): Promise<void>/);
  });

  it("l'écran ne change PAS quand le plafond est atteint", () => {
    /**
     * La décision de Sabrina, et elle tient C-05 : dire « trop de tentatives »
     * révélerait qu'il y a eu des tentatives sur cette adresse, donc qu'elle
     * existe. L'action rend `void` — elle ne peut rien dire.
     */
    const src = action();
    /*
     * On lit le code SANS ses commentaires : ceux-ci expliquent justement la
     * phrase à ne pas dire, et un test qui cherche un mot n'importe où dans un
     * fichier se fait satisfaire — ou trahir — par un commentaire (leçon du lot
     * 23-bis, et déjà revue deux fois depuis).
     */
    const codeSeul = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith("//"))
      .join("\n");
    expect(codeSeul).not.toMatch(/trop de tentatives/i);
    // Le retour silencieux, et non un message.
    expect(src).toMatch(/if \(!\(await tentativeAutorisee\([\s\S]{0,80}\)\)\) return;/);
  });
});

describe("la table et ses fonctions naissent fermées", () => {
  const migration = () => {
    const dossier = join(__dirname, "..", "supabase", "migrations");
    const f = readdirSync(dossier)
      .filter((x) => x.endsWith(".sql")).sort()
      .find((x) => x.includes("app29_limites_tentatives"));
    if (!f) throw new Error("migration introuvable");
    return readFileSync(join(dossier, f), "utf8");
  };

  it("la table est fermée aux rôles publics, RLS comprise", () => {
    /**
     * Un client ne doit pas savoir combien de tentatives ont visé une adresse : ce
     * serait dire que l'adresse existe, et rouvrir C-05 par la porte de derrière.
     */
    const sql = migration();
    expect(sql).toMatch(/alter table public\.tentatives_limitees enable row level security/);
    expect(sql).toMatch(/revoke all on public\.tentatives_limitees from anon, authenticated/);
    // La séquence aussi : sans cela, on peut lire le nombre de lignes.
    expect(sql).toMatch(/revoke all on sequence public\.tentatives_limitees_id_seq/);
  });

  it("les deux fonctions naissent fermées", () => {
    const sql = migration();
    for (const nom of ["tentative_autorisee", "purger_tentatives_limitees"]) {
      expect(sql, nom).toMatch(
        new RegExp(`revoke all on function public\\.${nom}\\([^)]*\\) from public, anon, authenticated`));
      expect(sql, nom).toMatch(
        new RegExp(`grant execute on function public\\.${nom}\\([^)]*\\) to service_role`));
    }
  });

  it("le comptage et l'écriture tiennent dans la MÊME transaction", () => {
    /**
     * Deux requêtes séparées laisseraient passer deux tentatives simultanées sous
     * un plafond de une : chacune compterait zéro avant que l'autre n'écrive.
     */
    const sql = migration();
    const corps = sql.slice(sql.indexOf("create or replace function public.tentative_autorisee"));
    expect(corps).toMatch(/select count\(\*\) into v_deja/);
    expect(corps).toMatch(/insert into public\.tentatives_limitees/);
    expect(corps, "le comptage précède l'écriture, dans la même fonction")
      .toMatch(/select count[\s\S]*if v_deja >= p_plafond[\s\S]*insert into/);
  });

  it("la fenêtre est GLISSANTE, pas une heure civile", () => {
    /**
     * Avec un compteur par heure civile, deux tentatives à 10 h 59 et 11 h 01
     * passent toutes les deux : la limite s'ouvre en grand à chaque changement
     * d'heure.
     */
    const sql = migration();
    expect(sql).toMatch(/tentee_le > now\(\) - make_interval\(mins => p_fenetre_minutes\)/);
  });

  it("l'index porte les trois colonnes du comptage", () => {
    // Sans lui, chaque tentative lit toute la table — et cette table grossit à
    // chaque tentative, donc le remède ralentirait ce qu'il protège.
    expect(migration()).toMatch(
      /create index if not exists tentatives_limitees_compte_idx\s*on public\.tentatives_limitees \(geste, cle, tentee_le desc\)/);
  });
});
