// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "./setup/attenteJsdom";

/**
 * APP 32 — supprimer un article qui n'a JAMAIS servi.
 *
 * ── CE QUE CE FICHIER GARDE ───────────────────────────────────────────────
 *
 * Dès qu'un article a servi, il appartient aux pièces comptables : seul
 * « Retirer de la vente » reste possible. Ce qui se supprime, c'est la coquille
 * créée par erreur — jamais vendue, jamais mouvementée.
 *
 * ── CE QUI SE VÉRIFIE ICI, ET CE QUI S'EST VÉRIFIÉ EN BASE ────────────────
 *
 * La garde elle-même (`article_supprimable`) est du SQL : elle a été éprouvée
 * contre la vraie base, transaction annulée, sur les DIX tables qui référencent
 * `articles` plus l'article neuf, l'identifiant inconnu et le null — résultats
 * dans le message de commit. Ce fichier garde ce que le SQL ne peut pas garder :
 * que l'écran l'appelle, que l'action la rappelle AU MOMENT du DELETE, et que
 * rien ne court-circuite le chemin.
 */

const RACINE = join(__dirname, "..");
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), "utf8");

const MIGRATION = "supabase/migrations/20260928120714_app32_suppression_article.sql";

// ── La migration ───────────────────────────────────────────────────────────

describe("la garde SQL, telle que le dépôt la décrit", () => {
  const sql = lire(MIGRATION);

  it("les deux fonctions naissent FERMÉES", () => {
    // AGENTS.md : `revoke` à public/anon/authenticated, `grant` au seul
    // service_role. Une fonction laissée ouverte s'appelle par /rest/v1/rpc
    // avec la clé publique du site — et celle-ci SUPPRIME.
    for (const f of ["article_supprimable(uuid)", "supprimer_article(uuid, uuid)"]) {
      expect(sql, f).toContain(`revoke all on function public.${f} from public, anon, authenticated;`);
      expect(sql, f).toContain(`grant execute on function public.${f} to service_role;`);
    }
  });

  it("le search_path est fixé sur les deux", () => {
    expect(sql.split("set search_path to 'public'").length - 1).toBe(2);
  });

  it("LES TABLES NE SONT PAS ÉNUMÉRÉES : elles viennent de pg_constraint", () => {
    /**
     * C'est la propriété qui compte le plus, et celle qu'aucun test de valeurs
     * ne pourrait donner. Une liste écrite à la main aurait vieilli à la
     * onzième clé étrangère : quelqu'un ajoute une table qui référence
     * `articles`, oublie la fonction, et la suppression recommence à détruire
     * en silence ce que cette table contenait.
     *
     * Le catalogue de Postgres EST la définition de « quelque chose référence
     * cet article » : il ne peut pas être en retard sur lui-même.
     */
    expect(sql).toContain("from pg_constraint con");
    expect(sql).toContain("con.confrelid = 'public.articles'::regclass");
    expect(sql).toContain("con.contype = 'f'");
    // Aucune des dix tables n'est citée dans une requête : si l'une l'était,
    // c'est que la liste serait revenue.
    for (const table of [
      "ventes_lignes", "commandes_lignes", "promotions_articles", "mouvements_stock",
      "options_groupes", "options_valeurs", "commandes_personnalisees",
      "commandes_choix", "article_modeles", "alertes_stock",
    ]) {
      expect(sql, `${table} ne doit pas être énumérée`).not.toMatch(
        new RegExp(`from public\\.${table}\\b`),
      );
    }
  });

  it("les identifiants du catalogue sont cités : aucun nom n'est du SQL", () => {
    // `format('%I')` — la seule façon sûre de coller un nom de table dans une
    // requête dynamique.
    expect(sql).toContain("'select exists (select 1 from public.%I where %I = $1)'");
  });

  it("la suppression RELIT la garde, et le DELETE est dans la même fonction", () => {
    /**
     * Donc dans la même transaction. Entre l'affichage du bouton et le clic,
     * une cliente peut s'être inscrite à l'alerte de retour en stock, ou une
     * vente être passée à la caisse. Un contrôle fait à l'affichage informe ;
     * il ne protège pas.
     */
    const fonction = sql.slice(sql.indexOf("create or replace function public.supprimer_article"));
    expect(fonction).toContain("if not public.article_supprimable(p_article_id) then");
    expect(fonction).toContain("delete from public.articles where id = p_article_id;");
    // Le refus ne lève pas : l'action veut une phrase, pas une erreur Postgres.
    expect(fonction).toMatch(/if not public\.article_supprimable[\s\S]*?return;/);
  });

  it("le geste part au journal, avec la référence et le nom", () => {
    const fonction = sql.slice(sql.indexOf("create or replace function public.supprimer_article"));
    // La liste des colonnes, pas le seul prefixe du nom : sans elle,
    // renommer la table en << journal_evenements_autre >> passait le test.
    expect(fonction).toContain(
      "insert into public.journal_evenements (entite, entite_id, evenement, avant, user_id)",
    );
    expect(fonction).toContain("'suppression'");
    expect(fonction).toContain("jsonb_build_object('reference', v_reference, 'nom', v_nom)");
    // `p_user_id` : QUI a supprimé. Sans lui, la trace dirait « automatique ».
    expect(fonction).toContain("p_user_id");
  });

  it("le fichier porte la version sous laquelle la migration est appliquée", () => {
    // AGENTS.md : la version se relit dans `schema_migrations`, jamais choisie
    // à la main — l'heure locale suisse a déjà décalé six fichiers de deux heures.
    expect(MIGRATION).toMatch(/^supabase\/migrations\/\d{14}_app32_suppression_article\.sql$/);
  });
});

// ── L'action serveur ───────────────────────────────────────────────────────

describe("l'action serveur, relue dans le dépôt", () => {
  const src = lire("app/(admin)/boutique/actions.ts");
  /** La seule fonction `supprimerArticle`, pas tout ce qui la suit. */
  const action = (() => {
    const debut = src.indexOf("export async function supprimerArticle");
    const suivant = src.indexOf("export async function", debut + 10);
    return src.slice(debut, suivant > 0 ? suivant : undefined);
  })();

  it("la garde de permission est celle de la MODIFICATION", () => {
    // Supprimer est au moins aussi lourd que modifier : le protéger moins
    // serait absurde. Et le périmètre vient de la BASE, jamais du formulaire —
    // un champ caché ne décide pas d'un droit.
    expect(action).toContain("const article = await lireArticle(id);");
    expect(action).toContain("await garde(perimetreDeArticle(article))");
    expect(action).not.toMatch(/formData\.get\("composant"\)/);
  });

  it("le DELETE passe par la fonction SQL, jamais par un delete direct", () => {
    /**
     * Un `.from("articles").delete()` depuis l'application ne pourrait pas
     * relire la garde dans la même transaction : il la croirait sur parole.
     */
    expect(action).toContain('supabaseAdmin.rpc("supprimer_article"');
    expect(action).not.toMatch(/from\("articles"\)[\s\S]{0,40}\.delete\(\)/);
  });

  it("zéro ligne rendue = refus, avec une phrase pour l'utilisatrice", () => {
    expect(action).toContain("if (lignes.length === 0) return { erreur: REFUS_SUPPRESSION_ARTICLE };");
  });

  it("LE MESSAGE VIT HORS du fichier « use server », et c'est obligatoire", () => {
    /**
     * Un fichier « use server » ne peut exporter que des fonctions ASYNC : une
     * constante y casse le module ENTIER — « Export enregistrerArticle doesn't
     * exist in target module », donc tout l'écran des articles.
     *
     * Et Next ne le dit qu'au BUILD : ni `tsc --noEmit` ni la suite de tests
     * ne l'ont vu. C'est `npm run build` qui l'a attrapé, et c'est pour cela
     * qu'il est dans les six vérifications.
     */
    expect(src, "actions.ts est un fichier use server").toContain('"use server"');
    expect(src, "aucune constante exportée ici").not.toMatch(/^export const /m);
    expect(lire("src/lib/boutiqueLogique.ts")).toContain("export const REFUS_SUPPRESSION_ARTICLE =");
  });

  it("le message de refus ne nomme AUCUNE table", () => {
    // « ventes_lignes » n'apprendrait rien à Sabrina, et expliquerait la base
    // au lieu du métier.
    const logique = lire("src/lib/boutiqueLogique.ts");
    const debut = logique.indexOf("export const REFUS_SUPPRESSION_ARTICLE =");
    const message = logique.slice(debut, logique.indexOf(";", debut));
    for (const table of ["ventes_lignes", "mouvements_stock", "alertes_stock", "options_"]) {
      expect(message, table).not.toContain(table);
    }
    expect(message).toContain("vente, commande, stock ou option");
  });

  it("la photo part APRÈS la suppression, et son échec n'annule rien", () => {
    /**
     * Avant, un fichier serait effacé pour un DELETE qui n'a pas abouti. Et un
     * échec de stockage ne doit pas remonter : l'article est supprimé, un
     * fichier orphelin n'est pas le problème de l'utilisatrice.
     */
    const apresRpc = action.slice(action.indexOf("if (lignes.length === 0)"));
    expect(apresRpc).toContain("storage.from(BUCKET_PHOTOS_BOUTIQUE).remove([photo_path])");
    expect(apresRpc).toMatch(/try \{[\s\S]*?remove\(\[photo_path\]\)[\s\S]*?\} catch/);
    // Le bucket vient du module partagé : pas de nom recopié.
    expect(src).toContain("BUCKET_PHOTOS_BOUTIQUE,");
    expect(src).toContain('} from "@/src/lib/boutiqueLogique";');
    expect(src, "le nom du bucket n'est pas recopié").not.toContain('"boutique-photos"');
  });

  it("le retour se fait à la liste, avec de quoi confirmer", () => {
    expect(action).toContain("redirect(");
    expect(action).toContain("supprime=");
    expect(action).toContain("PERIMETRES[perimetreDeArticle(article)].liste");
  });
});

// ── La fiche ───────────────────────────────────────────────────────────────

describe("la fiche : le bouton n'apparaît que si la base le dit", () => {
  const page = lire("app/(admin)/boutique/articles/[id]/page.tsx");

  it("la question est posée à la BASE, pas déduite à l'écran", () => {
    expect(page).toContain('supabaseAdmin.rpc("article_supprimable"');
    // Aucune règle recopiée : pas de comptage de mouvements ou de ventes ici.
    expect(page).not.toMatch(/from\("ventes_lignes"\)|from\("mouvements_stock"\)/);
  });

  it("sans la gestion, la question n'est même pas posée", () => {
    // Un lecteur simple ne peut pas supprimer : inutile d'interroger la base,
    // et le bouton ne doit pas exister pour lui.
    expect(page).toContain("const { data: supprimableBrut } = gestion");
    expect(page).toContain("{gestion && (");
  });

  it("le refus est DIT, jamais muet", () => {
    // Un bouton absent sans explication se cherche ; une phrase se lit.
    expect(page).toContain("{REFUS_SUPPRESSION_ARTICLE}");
    expect(page).toContain("supprimable ? (");
  });
});

/**
 * Le bouton importe le module d'actions serveur, qui construit un client
 * Supabase au CHARGEMENT du module et exige donc une URL. Ce stub ne fait que
 * rendre l'import possible : aucune action n'est déclenchée ici — on vérifie la
 * phrase de confirmation et le champ caché, rien d'autre.
 */
vi.mock("@/app/(admin)/boutique/actions", () => ({
  supprimerArticle: async () => ({}),
  REFUS_SUPPRESSION_ARTICLE: "refus",
}));

describe("le bouton lui-même", () => {
  const H = vi.hoisted(() => ({ confirme: true, appels: 0 }));

  beforeEach(() => {
    H.confirme = true;
    H.appels = 0;
    vi.stubGlobal("confirm", (texte: string) => {
      H.appels++;
      (globalThis as unknown as { dernierTexte?: string }).dernierTexte = texte;
      return H.confirme;
    });
  });
  afterEach(cleanup);

  async function rendre() {
    const { default: Bouton } = await import(
      "@/app/(admin)/boutique/articles/[id]/BoutonSupprimerArticle"
    );
    render(<Bouton id="a-1" reference="ART-0057" nom="Paille" />);
  }

  it("la confirmation NOMME l'article : référence et nom", async () => {
    /**
     * « Supprimer cet article ? » ne dit pas lequel, et on a souvent deux
     * onglets ouverts. La phrase demandée par Sabrina, mot pour mot.
     */
    await rendre();
    screen.getByRole("button", { name: /Supprimer définitivement/ }).click();
    expect(H.appels).toBe(1);
    expect((globalThis as unknown as { dernierTexte?: string }).dernierTexte).toBe(
      "Supprimer définitivement ART-0057 Paille ? Cette action est irréversible.",
    );
  });

  it("l'identifiant part par le formulaire, pas par une fermeture", async () => {
    // Un champ caché : l'action serveur le relit, et relit le périmètre en base.
    await rendre();
    const champ = document.querySelector('input[name="id"]') as HTMLInputElement;
    expect(champ?.value).toBe("a-1");
  });
});

// ── Ce que la migration ne doit PAS faire ─────────────────────────────────

describe("la numérotation ART-xxxx ne se réutilise jamais", () => {
  it("la migration ne touche ni à la séquence ni au trigger", () => {
    /**
     * `attribuer_reference_article` tire `nextval('articles_reference_seq')` :
     * une séquence ne revient jamais en arrière, et ne le fait pas davantage
     * quand la transaction échoue. Supprimer ART-0057 ne libère donc pas le
     * numéro — le suivant sera ART-0058. Vérifié en base le 28.09.2026.
     *
     * Ce test garde qu'on n'a pas « rendu le numéro » au passage : ce serait
     * faire pointer deux articles différents vers la même référence dans des
     * exports déjà imprimés.
     */
    const sql = lire(MIGRATION);
    expect(sql).not.toContain("articles_reference_seq");
    expect(sql).not.toContain("setval");
    expect(sql).not.toContain("attribuer_reference_article");
  });
});
