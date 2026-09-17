import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, it, expect } from "vitest";

/**
 * Les fonctions SQL ne s'exécutent que par la clé de service.
 *
 * Une fonction laissée ouverte à anon ou authenticated s'appelle directement
 * par /rest/v1/rpc avec la clé publique du site : la garde de permission de
 * l'application est alors enjambée, et une fonction SECURITY DEFINER traverse
 * en plus les politiques RLS. Ce test relit le dépôt :
 *   - toute fonction créée DEPUIS ce chantier porte sa révocation ;
 *   - tout appel .rpc() de l'application passe par supabaseAdmin.
 */

const RACINE = join(__dirname, "..");
const MIGRATIONS = join(RACINE, "supabase", "migrations");
/** La migration qui ferme les fonctions : la règle vaut pour ce qui vient après. */
const FERMETURE = "20260917181950_fonctions_sql_fermees_roles_publics.sql";

const fichiersMigration = () =>
  readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

/** Les fonctions créées par un fichier de migration, et leur révocation éventuelle. */
export function fonctionsSansRevocation(sql: string): string[] {
  const creees = [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(/gi)]
    .map((m) => m[1]);
  const manquantes = new Set<string>();
  for (const nom of new Set(creees)) {
    // La révocation nommée, ou une boucle qui ferme tout le schéma public.
    const nommee = new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+(?:public\\.)?${nom}\\b`, "i").test(sql);
    const enBloc = /revoke\s+execute\s+on\s+(?:all\s+functions\s+in\s+schema\s+public|function\s+%s)/i.test(sql);
    // Une exception se motive PAR ÉCRIT dans le fichier, au-dessus de la fonction.
    const justifiee = new RegExp(`--[^\\n]*privilèges[^\\n]*${nom}\\b`, "i").test(sql);
    if (!nommee && !enBloc && !justifiee) manquantes.add(nom);
  }
  return [...manquantes];
}

describe("une fonction SQL naît fermée", () => {
  it("la règle attrape une fonction créée sans révocation, et laisse passer celle qui l'a", () => {
    const sansRevoke = `create or replace function public.zz_test(p uuid) returns int language sql as $$ select 1 $$;`;
    expect(fonctionsSansRevocation(sansRevoke)).toEqual(["zz_test"]);
    expect(fonctionsSansRevocation(`${sansRevoke}
      revoke execute on function public.zz_test(uuid) from public, anon, authenticated;
      grant execute on function public.zz_test(uuid) to service_role;`)).toEqual([]);
    // Une exception écrite passe, à condition de nommer la fonction.
    expect(fonctionsSansRevocation(`-- privilèges : zz_test reste ouverte à authenticated, citée par une politique RLS.
      ${sansRevoke}`)).toEqual([]);
  });

  it("la migration de fermeture est dans le dépôt, et ferme tout", () => {
    const fichiers = fichiersMigration();
    expect(fichiers).toContain(FERMETURE);
    const sql = readFileSync(join(MIGRATIONS, FERMETURE), "utf8");
    expect(sql).toMatch(/revoke execute on function %s from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function %s to service_role/);
    // Les fonctions de demain : le droit global de PUBLIC et celui du schéma.
    expect(sql).toMatch(/alter default privileges revoke execute on functions from public;/);
    expect(sql).toMatch(/alter default privileges in schema public revoke execute on functions from public;/);
    expect(sql).toMatch(/alter default privileges in schema public revoke execute on functions from anon, authenticated;/);
    expect(sql).toMatch(/alter default privileges in schema public grant execute on functions to service_role;/);
    // Les six aides des politiques RLS, et elles seules, gardent authenticated.
    const gardees = [...sql.matchAll(/grant execute on function public\.(\w+)\(\) to authenticated;/g)].map((m) => m[1]);
    expect(gardees.sort()).toEqual(
      ["is_admin", "is_personnel", "mon_employe_id", "peut_boutique", "peut_depenses", "peut_encaissements"]);
  });

  it("aucune fonction créée depuis ce chantier n'est laissée ouverte", () => {
    const apres = fichiersMigration().filter((f) => f > FERMETURE);
    const fautes = apres.flatMap((f) => {
      const sql = readFileSync(join(MIGRATIONS, f), "utf8");
      return fonctionsSansRevocation(sql).map((nom) => `${f} : ${nom}`);
    });
    expect(fautes).toEqual([]);
  });
});

// ── Les appels de l'application ────────────────────────────────────────────

function fichiers(dossier: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dossier)) {
    if (e === "node_modules" || e === ".next") continue;
    const p = join(dossier, e);
    if (statSync(p).isDirectory()) out.push(...fichiers(p));
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

const SOURCES = ["app", "src"].flatMap((d) => fichiers(join(RACINE, d))).map((chemin) => {
  const rel = relative(RACINE, chemin).split("\\").join("/");
  const code = readFileSync(chemin, "utf8");
  return { rel, code, sf: ts.createSourceFile(rel, code, ts.ScriptTarget.Latest, true, rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS) };
});

/** Les appels `X.rpc(...)` d'un fichier, avec le client appelé. */
export function appelsRpc(sf: ts.SourceFile): { client: string; fonction: string; ligne: number }[] {
  const out: { client: string; fonction: string; ligne: number }[] = [];
  const visiter = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
        && n.expression.name.text === "rpc") {
      const client = n.expression.expression.getText(sf);
      const arg = n.arguments[0];
      out.push({
        client,
        fonction: arg && ts.isStringLiteral(arg) ? arg.text : "(?)",
        ligne: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
      });
    }
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return out;
}

describe("l'application appelle les fonctions avec la clé de service", () => {
  it("la règle voit le client de chaque appel", () => {
    const sf = ts.createSourceFile("x.ts",
      `await supabase.rpc("emettre_facture", { p_facture_id: id });`, ts.ScriptTarget.Latest, true);
    expect(appelsRpc(sf)).toEqual([{ client: "supabase", fonction: "emettre_facture", ligne: 1 }]);
  });

  it("chaque .rpc( du dépôt passe par supabaseAdmin", () => {
    const tous = SOURCES.flatMap((s) => appelsRpc(s.sf).map((a) => ({ ...a, rel: s.rel })));
    // Le dépôt en compte plusieurs dizaines : si ce nombre tombe à zéro, la
    // règle ne prouve plus rien.
    expect(tous.length).toBeGreaterThan(20);
    const fautes = tous.filter((a) => a.client !== "supabaseAdmin")
      .map((a) => `${a.rel}:${a.ligne} — ${a.client}.rpc("${a.fonction}")`);
    expect(fautes).toEqual([]);
  });

  it("le client du navigateur ne sert jamais à appeler une fonction", () => {
    const suspects = SOURCES.filter((s) => /createBrowserClient|createClientComponentClient/.test(s.code))
      .filter((s) => appelsRpc(s.sf).length > 0)
      .map((s) => s.rel);
    expect(suspects).toEqual([]);
  });
});
