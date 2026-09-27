import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * La vitrine doit être lisible par un VISITEUR — le test qui manquait.
 *
 * ── CE QUI EST ARRIVÉ ─────────────────────────────────────────────────────
 *
 * APP 26 a fait appeler `delai_commande_effectif(a.id)` par la vue
 * `articles_vitrine`. Cette fonction est fermée à `anon` et `authenticated`,
 * comme toute fonction du dépôt — et c'est la bonne règle. Mais une vue qui
 * appelle une fonction fermée devient fermée elle aussi :
 *
 *   begin; set local role anon; select count(*) from articles_vitrine;
 *   → ERROR 42501: permission denied for function delai_commande_effectif
 *
 * Le site vitrine a affiché « La boutique est momentanément indisponible »
 * pendant un jour. La suite de tests, elle, était verte : elle lisait la vue avec
 * la clé de SERVICE, qui a le droit d'exécuter la fonction.
 *
 * ── POURQUOI CE PIÈGE N'EST PAS ÉVIDENT ───────────────────────────────────
 *
 * La vue est `security_invoker = false`, donc SECURITY DEFINER : elle lit
 * `articles` avec les droits de son propriétaire. Ce report ne vaut QUE POUR LES
 * TABLES. Le privilège EXECUTE d'une fonction est vérifié avec le rôle courant.
 * Rien dans la migration ne le signalait, et la vue marchait parfaitement dans
 * tous nos essais.
 *
 * ── CE QUE CE FICHIER PEUT, ET CE QU'IL NE PEUT PAS ───────────────────────
 *
 * La suite tourne SANS connexion à la base : ce fichier ne peut donc pas
 * exécuter `set local role anon`. Ce contrôle-là se fait en base, et il est
 * consigné dans le message du commit.
 *
 * Ce que ce fichier garde, c'est la CAUSE : la définition de la vue, dans le
 * dépôt, ne doit appeler aucune fonction fermée aux deux rôles publics. C'est
 * vérifiable sans connexion, à chaque exécution, et cela aurait suffi à attraper
 * la panne d'APP 26.
 */

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");

/** Les fonctions du dépôt qui sont explicitement révoquées aux rôles publics. */
function fonctionsFermees(): Set<string> {
  const fermees = new Set<string>();
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql"))) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    const motif = /revoke\s+(?:execute|all)(?:\s+privileges)?\s+on\s+function\s+(?:public\.)?(\w+)/gi;
    for (const m of sql.matchAll(motif)) fermees.add(m[1].toLowerCase());
  }
  return fermees;
}

/** La migration la plus récente qui définit la vue, et son texte. */
function derniereDefinitionDeLaVue(): { fichier: string; sql: string } {
  const fichiers = readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort();
  const trouve = fichiers
    .filter((x) => /create\s+(or\s+replace\s+)?view\s+public\.articles_vitrine/i
      .test(readFileSync(join(MIGRATIONS, x), "utf8")))
    .at(-1);
  if (!trouve) throw new Error("aucune migration ne définit articles_vitrine");
  return { fichier: trouve, sql: readFileSync(join(MIGRATIONS, trouve), "utf8") };
}

/** Le corps du `create view`, sans l'en-tête de commentaires. */
function corpsDeLaVue(sql: string): string {
  const i = sql.search(/create\s+or\s+replace\s+view\s+public\.articles_vitrine/i);
  if (i < 0) throw new Error("create view introuvable");
  return sql
    .slice(i)
    .split(/\n/)
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");
}

describe("la vue de la vitrine n'appelle aucune fonction fermée", () => {
  it("le dépôt est bien relu (garde-fou du garde-fou)", () => {
    const fermees = fonctionsFermees();
    expect(fermees.size, "des fonctions révoquées doivent être trouvées")
      .toBeGreaterThan(5);
    // Celle qui a causé la panne doit bien être reconnue comme fermée.
    expect(fermees.has("delai_commande_effectif")).toBe(true);
  });

  it("aucune fonction fermée n'est appelée dans la définition de la vue", () => {
    /**
     * LE TEST QUI MANQUAIT. Il aurait rougi le jour d'APP 26.
     *
     * Une vue publique ne peut appeler qu'une fonction ouverte aux rôles publics.
     * Comme le dépôt ferme TOUTES ses fonctions sauf les six aides des politiques
     * RLS, cela revient à dire : la vue ne doit appeler AUCUNE fonction du dépôt.
     * Son calcul s'écrit dans la vue, ou pas du tout.
     */
    const { fichier, sql } = derniereDefinitionDeLaVue();
    const corps = corpsDeLaVue(sql);
    const fermees = fonctionsFermees();

    const appelees = [...corps.matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/g)]
      .map((m) => m[1].toLowerCase());

    const fautives = [...new Set(appelees.filter((n) => fermees.has(n)))];
    expect(
      fautives,
      `${fichier} appelle une fonction fermée à anon : la vue deviendrait ` +
      `illisible pour les visiteurs (ERROR 42501), alors que la clé de service ` +
      `continuerait de la lire — donc la suite resterait verte`,
    ).toEqual([]);
  });

  it("le délai est calculé dans la vue, par coalesce, et non par une fonction", () => {
    const { sql } = derniereDefinitionDeLaVue();
    const corps = corpsDeLaVue(sql);
    expect(corps).toMatch(/coalesce\(a\.delai_commande_min_jours,\s*f\.delai_commande_min_jours\)/);
    expect(corps).toMatch(/coalesce\(a\.delai_commande_max_jours,\s*f\.delai_commande_max_jours\)/);
    expect(corps, "plus aucun appel à la fonction")
      .not.toMatch(/delai_commande_effectif\s*\(/);
  });

  it("le fournisseur est joint pour son DÉLAI, et rien d'autre ne sort", () => {
    /**
     * La jointure est nouvelle, donc la garde S-04 se revérifie : le nom du
     * fournisseur ne doit pas se retrouver dans les colonnes rendues. Savoir chez
     * quel grossiste la pension se fournit ne regarde pas le visiteur.
     */
    const { sql } = derniereDefinitionDeLaVue();
    const corps = corpsDeLaVue(sql);
    expect(corps).toContain("left join public.fournisseurs f on f.id = a.fournisseur_id");
    // Aucune colonne `f.` autre que les deux délais.
    const colonnesFournisseur = [...corps.matchAll(/\bf\.(\w+)/g)].map((m) => m[1]);
    for (const c of colonnesFournisseur) {
      expect(["id", "delai_commande_min_jours", "delai_commande_max_jours"], `f.${c}`)
        .toContain(c);
    }
  });

  it("la migration DIT pourquoi les droits n'ont pas été ouverts", () => {
    /**
     * Sans cette explication, la correction évidente — « ouvrir la fonction à
     * anon » — reviendra à la première panne. Elle réparerait l'écran et
     * rouvrirait par RPC ce que la vue refuse de publier : le délai d'un article
     * NON commandable.
     */
    const { sql } = derniereDefinitionDeLaVue();
    expect(sql).toMatch(/rpc|RPC/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql, "le report de droits ne vaut que pour les tables").toMatch(/TABLES/);
  });
});

describe("la règle est écrite pour la prochaine fois", () => {
  it("AGENTS.md demande de lire la vue avec le rôle anon", () => {
    // Une leçon qu'on n'écrit pas se réapprend au même prix.
    const agents = readFileSync(join(__dirname, "..", "AGENTS.md"), "utf8");
    expect(agents).toContain("articles_vitrine");
    expect(agents).toMatch(/r[ôo]le anon/i);
  });
});
