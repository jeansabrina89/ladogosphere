import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Les six tables comptables ne se lisent qu'avec la clé de service.
 *
 * S-07 : elles portaient les GRANT hérités de `public` sur anon et
 * authenticated. C'était inerte — RLS active, aucune politique, donc zéro
 * ligne renvoyée — mais la première politique écrite par distraction aurait
 * réveillé ces droits d'un coup. Le lot 23 les a retirés
 * (`20260925223005_s07_s08_droits_comptables_trim_zero.sql`).
 *
 * Ce test relit le dépôt, comme `fonctionsSqlFermees` :
 *   1. aucune migration POSTÉRIEURE ne rend un droit à anon ou authenticated
 *      sur ces six tables, et aucune n'y pose de politique ;
 *   2. aucun code de l'application ne les touche avec un client de session —
 *      c'est la raison pour laquelle la révocation ne casse rien.
 *
 * Il ne remplace pas un relevé en base : il empêche le dépôt de défaire
 * silencieusement ce que la base vient d'acquérir.
 */

const RACINE = join(__dirname, "..");
const MIGRATIONS = join(RACINE, "supabase", "migrations");

/** La migration qui révoque : la règle vaut pour ce qui vient après. */
const REVOCATION = "20260925223005_s07_s08_droits_comptables_trim_zero.sql";

const TABLES = [
  "comptes",
  "ecritures",
  "ecritures_lignes",
  "exercices",
  "fermetures_essai",
  "paiements_resa",
] as const;

const fichiersMigration = () =>
  readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

/** Les tables à qui ce SQL rend un droit, ou sur qui il pose une politique. */
export function droitsRendus(sql: string): string[] {
  const nu = sql.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").toLowerCase();
  const touchees = new Set<string>();

  for (const table of TABLES) {
    // `grant … on [table] public.<table> … to … anon|authenticated`
    const grant = new RegExp(
      `grant\\s+[^;]*?\\bpublic\\.${table}\\b[^;]*?\\bto\\b[^;]*?\\b(anon|authenticated)\\b`,
    );
    // `create policy … on public.<table>` : une politique réveillerait les droits.
    const politique = new RegExp(`create\\s+policy\\s+[^;]*?\\bon\\s+public\\.${table}\\b`);
    if (grant.test(nu) || politique.test(nu)) touchees.add(table);
  }
  return [...touchees].sort();
}

describe("les six tables comptables restent fermées à anon et authenticated", () => {
  it("la règle voit un GRANT, une politique, et laisse passer le reste", () => {
    expect(droitsRendus("grant select on public.ecritures to authenticated;")).toEqual(["ecritures"]);
    expect(droitsRendus("create policy p on public.comptes for select using (true);")).toEqual(["comptes"]);
    // La révocation elle-même ne doit pas être prise pour un octroi.
    expect(droitsRendus("revoke all on public.comptes from anon, authenticated;")).toEqual([]);
    // Un GRANT à service_role est le contraire d'un problème.
    expect(droitsRendus("grant select on public.ecritures to service_role;")).toEqual([]);
    // Une autre table ne compte pas.
    expect(droitsRendus("grant select on public.clients to authenticated;")).toEqual([]);
    // Un GRANT en commentaire ne compte pas.
    expect(droitsRendus("-- grant select on public.ecritures to authenticated;")).toEqual([]);
  });

  it("la migration de révocation est bien dans le dépôt", () => {
    expect(fichiersMigration()).toContain(REVOCATION);
  });

  it("aucune migration postérieure ne rend un droit ni ne pose de politique", () => {
    const apres = fichiersMigration().filter((f) => f > REVOCATION);
    const fautives: string[] = [];
    for (const f of apres) {
      const rendus = droitsRendus(readFileSync(join(MIGRATIONS, f), "utf8"));
      if (rendus.length) fautives.push(`${f} → ${rendus.join(", ")}`);
    }
    expect(
      fautives,
      "une migration rend à anon/authenticated un droit que le lot 23 avait retiré",
    ).toEqual([]);
  });

  it("aucun code ne lit ces tables avec un client de session", () => {
    // C'est ce qui rend la révocation sans conséquence : si un écran passait
    // par le client de session, il verrait désormais un refus au lieu du zéro
    // ligne que RLS lui renvoyait déjà.
    const sources: string[] = [];
    const parcourir = (dossier: string) => {
      for (const e of readdirSync(dossier, { withFileTypes: true })) {
        const chemin = join(dossier, e.name);
        if (e.isDirectory()) parcourir(chemin);
        else if (/\.(ts|tsx)$/.test(e.name)) sources.push(chemin);
      }
    };
    parcourir(join(RACINE, "app"));
    parcourir(join(RACINE, "src"));

    const fautifs: string[] = [];
    for (const chemin of sources) {
      const src = readFileSync(chemin, "utf8");
      const touche = TABLES.some((t) => src.includes(`from("${t}")`));
      if (!touche) continue;

      // Le fichier touche une des six tables. Chaque appel doit être précédé
      // de `supabaseAdmin` sur la même ligne, ou sur celle d'avant (chaînage).
      const lignes = src.split("\n");
      lignes.forEach((ligne, i) => {
        const table = TABLES.find((t) => ligne.includes(`from("${t}")`));
        if (!table) return;
        const contexte = `${lignes[i - 1] ?? ""}\n${ligne}`;
        if (!/supabaseAdmin\s*$|supabaseAdmin\s*\.|supabaseAdmin\s*\)/.test(contexte)) {
          fautifs.push(`${chemin.slice(RACINE.length + 1)}:${i + 1} (${table})`);
        }
      });
    }
    expect(
      fautifs,
      "une de ces six tables est lue autrement que par la clé de service",
    ).toEqual([]);
  });
});
