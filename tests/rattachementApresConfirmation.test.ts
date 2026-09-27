import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Une fiche cliente ne se rattache qu'à une adresse CONFIRMÉE (APP 28-BIS).
 *
 * ── LE DÉFAUT ─────────────────────────────────────────────────────────────
 *
 * `lier_client_auth` était posé en `AFTER INSERT ON auth.users` : la fiche était
 * rattachée à l'instant où le compte naissait, avant toute preuve que la personne
 * possède l'adresse. Quelqu'un qui connaissait l'adresse d'une cliente sans
 * compte s'inscrivait sous cette adresse et prenait sa fiche — ses chiens, son
 * historique, ses réservations.
 *
 * Mesuré avant correction : 9 fiches rattachées, dont UNE à un compte non
 * confirmé. Le défaut n'était pas théorique.
 *
 * ── DEUX PORTES, ET IL FALLAIT LES DEUX ───────────────────────────────────
 *
 * Le trigger n'était que la première. `creerOuLierFicheClient` rattache elle
 * aussi, et elle est appelée juste après `signUp` — donc avec un compte que
 * personne n'a confirmé. Fermer le trigger seul aurait été cosmétique : le
 * détournement serait resté possible par le chemin normal de l'inscription.
 *
 * ── CE QUE CE FICHIER PEUT ────────────────────────────────────────────────
 *
 * La suite tourne sans base : les scénarios eux-mêmes (inscription non
 * confirmée, confirmation, fiche déjà rattachée) sont éprouvés en base, en
 * transaction annulée, et consignés dans le message du commit — mutation
 * comprise. Ici, on garde la FORME : les deux portes sont fermées, et elles le
 * restent.
 */

const RACINE = join(__dirname, "..");
const MIGRATIONS = join(RACINE, "supabase", "migrations");

/** La migration la plus récente qui redéfinit `lier_client_auth`. */
function derniereMigrationDuTrigger(): { fichier: string; sql: string } {
  const fichiers = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  const trouve = fichiers
    .filter((f) => /create\s+or\s+replace\s+function\s+public\.lier_client_auth\s*\(\s*\)/i
      .test(readFileSync(join(MIGRATIONS, f), "utf8")))
    .at(-1);
  if (!trouve) throw new Error("aucune migration ne définit lier_client_auth");
  return { fichier: trouve, sql: readFileSync(join(MIGRATIONS, trouve), "utf8") };
}

describe("la porte de la BASE : le trigger", () => {
  it("le rattachement à l'insertion est conditionné à une adresse déjà confirmée", () => {
    /**
     * La condition n'est pas une échappatoire : c'est le cas d'un compte créé par
     * l'administratrice avec `email_confirm: true`. Là, c'est Sabrina qui atteste
     * l'adresse, et son geste vaut confirmation.
     */
    const { sql } = derniereMigrationDuTrigger();
    expect(sql).toMatch(/if new\.email_confirmed_at is not null then/);
    expect(sql).toMatch(/perform public\.rattacher_fiche_client_confirmee\(new\.id, new\.email\)/);
  });

  it("un trigger écoute la CONFIRMATION, et seulement le passage de NULL à une date", () => {
    /**
     * `WHEN` plutôt qu'un `if` dans le corps : la condition se lit alors dans
     * `pg_get_triggerdef`, donc dans tout audit futur.
     *
     * De NULL vers une date, et pas l'inverse : retirer une confirmation ne doit
     * pas détacher une fiche, et une re-confirmation ne doit rien rejouer.
     */
    const { sql } = derniereMigrationDuTrigger();
    expect(sql).toMatch(/after update of email_confirmed_at on auth\.users/i);
    expect(sql).toMatch(
      /when \(old\.email_confirmed_at is null and new\.email_confirmed_at is not null\)/i);
  });

  it("une fiche DÉJÀ rattachée n'est jamais reprise", () => {
    // La correction du 06.09.2026, qui doit survivre à toute réécriture : sans
    // elle, quiconque connaîtrait l'adresse d'une cliente reprendrait sa fiche.
    const { sql } = derniereMigrationDuTrigger();
    expect(sql).toMatch(/and auth_user_id is null/);
  });

  it("le trigger ne crée toujours AUCUNE fiche cliente", () => {
    // Correctif de recette I5 : un compte du personnel héritait d'une fiche
    // vide, parce que le déclencheur ne connaît pas encore le rôle.
    const { sql } = derniereMigrationDuTrigger();
    const corps = sql.slice(sql.indexOf("create or replace function public.lier_client_auth"));
    expect(corps, "aucun insert dans clients").not.toMatch(/insert into public\.clients/);
  });

  it("le PROFIL, lui, est créé dans tous les cas", () => {
    // Il ne porte que ce compte, et les gardes de l'application le lisent dès la
    // première requête — y compris avant confirmation.
    const { sql } = derniereMigrationDuTrigger();
    expect(sql).toMatch(/insert into public\.profiles \(id, email, role, actif\)/);
  });

  it("la fonction de rattachement naît fermée", () => {
    const { sql } = derniereMigrationDuTrigger();
    expect(sql).toMatch(
      /revoke (all|execute)[^;]*on function public\.rattacher_fiche_client_confirmee\(uuid, text\) from public, anon, authenticated/);
    expect(sql).toMatch(
      /grant execute on function public\.rattacher_fiche_client_confirmee\(uuid, text\) to service_role/);
  });
});

describe("la porte de L'APPLICATION : creerOuLierFicheClient", () => {
  const action = () =>
    readFileSync(join(RACINE, "app/(public)/inscription/actions.ts"), "utf8");

  it("ne rattache une fiche existante que si le compte est confirmé", () => {
    /**
     * LA SECONDE PORTE, et la plus facile à oublier. Cette action est appelée
     * juste après `signUp`, donc avec un compte tout neuf. Fermer le seul trigger
     * aurait laissé le détournement passer par le chemin normal de l'inscription.
     */
    const src = action();
    expect(src).toMatch(/if \(decision\.action === "lier" && !utilisateur\.confirme\)/);
  });

  it("l'état de confirmation vient du COMPTE, pas du navigateur", () => {
    // Cette action est joignable par POST direct : rien de ce qu'elle reçoit ne
    // fait autorité. `confirme` se lit sur la session ou sur le compte relu.
    const src = action();
    expect(src).toMatch(/confirme: !!session\.email_confirmed_at/);
    expect(src).toMatch(/confirme: false/);
    expect(src, "le type doit porter la confirmation")
      .toMatch(/Promise<\{ id: string; email: string; confirme: boolean \}/);
  });

  it("le refus explique l'attente, et l'écran public ne l'affiche pas", () => {
    /**
     * Ce refus ne paraît que s'il existe une fiche à rattacher : l'afficher
     * révélerait ce que C-05 cache. L'écran d'inscription ignore le résultat de
     * cette action depuis APP 28 — c'est ce qui le rend sans danger.
     */
    const src = action();
    expect(src).toMatch(/Confirmez d'abord votre adresse/);

    const form = readFileSync(
      join(RACINE, "app/(public)/inscription/InscriptionForm.tsx"), "utf8");
    // Le résultat est ignoré : aucun `res` n'est lu, aucun setError ne le porte.
    expect(form).toMatch(/await creerOuLierFicheClient\(\{/);
    expect(form, "le résultat ne doit pas être affecté ni affiché")
      .not.toMatch(/const res = await creerOuLierFicheClient/);
  });
});

describe("les chemins qui créent des comptes", () => {
  it("il n'y en a que deux, et on sait lequel confirme d'office", () => {
    /**
     * Recensé au lot : `signUp` à l'inscription publique (non confirmé), et
     * `admin.createUser` pour un compte employé (confirmé d'office par Sabrina).
     * Ni invitation, ni lien magique — un troisième chemin changerait le
     * raisonnement, donc ce test le ferait rougir.
     */
    const fichiers: string[] = [];
    const parcourir = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === ".next" || e.name === ".git") continue;
        const p = join(d, e.name);
        if (e.isDirectory()) parcourir(p);
        else if (/\.tsx?$/.test(e.name)) fichiers.push(p);
      }
    };
    for (const racine of ["app", "src"]) parcourir(join(RACINE, racine));

    const creations = fichiers
      .filter((f) => /auth\.admin\.(createUser|inviteUserByEmail|generateLink)\s*\(|auth\.signUp\s*\(/
        .test(readFileSync(f, "utf8")))
      .map((f) => f.replace(RACINE, "").replace(/\\/g, "/").replace(/^\//, ""));

    expect(creations.sort()).toEqual([
      "app/(admin)/(espace-equipe)/employes/actions.ts",
      "app/(public)/inscription/InscriptionForm.tsx",
    ]);
  });

  it("le compte employé est créé DÉJÀ confirmé, et c'est voulu", () => {
    // C'est Sabrina qui atteste l'adresse ; son geste vaut confirmation, et le
    // trigger d'insertion rattache alors la fiche d'office.
    const src = readFileSync(
      join(RACINE, "app/(admin)/(espace-equipe)/employes/actions.ts"), "utf8");
    expect(src).toMatch(/email_confirm: true/);
  });
});
