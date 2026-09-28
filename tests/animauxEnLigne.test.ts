import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  AIDE_ANIMAUX_EN_LIGNE,
  CLE_ANIMAUX_EN_LIGNE,
  TOUS_LES_ANIMAUX,
  animauxOuvertsDeLArticle,
  articleOuvertEnLigne,
  ecrireAnimauxOuverts,
  lireAnimauxOuverts,
  validerAnimauxOuverts,
} from "@/src/lib/animauxEnLigneLogique";
import { ANIMAUX } from "@/src/lib/etiquettesArticles";

/**
 * APP 48 — choisir les animaux vendus en ligne.
 *
 * ── CE QUE LE RÉGLAGE FAIT ────────────────────────────────────────────────
 *
 * Décocher un animal le retire de la boutique EN LIGNE — son onglet, ses
 * articles, ses filtres, sur le site comme dans l'application. Il ne touche
 * rien au comptoir : ces articles se vendent toujours en caisse, comptent
 * toujours à l'inventaire, apparaissent toujours dans la liste
 * d'administration. C'est une décision de vitrine, pas de catalogue.
 *
 * ── CE QUI A ÉTÉ ÉPROUVÉ EN BASE, ET NE L'EST PAS ICI ─────────────────────
 *
 * La contrainte (animal inconnu refusé, liste vide refusée, les autres
 * réglages intacts) et la vue (774 lignes tout ouvert ; 607 avec chien et chat
 * seuls, et AUCUN autre animal publié) — en transactions annulées, résultats
 * dans le message de commit. Ce fichier garde ce que le SQL ne garde pas seul.
 */

// ── La lecture du réglage ──────────────────────────────────────────────────

describe("lire la liste ouverte", () => {
  it("une liste écrite se relit telle quelle", () => {
    expect(lireAnimauxOuverts('["chien","chat"]')).toEqual(["chien", "chat"]);
  });

  it("l'ordre rendu est celui du vocabulaire, jamais celui de l'écriture", () => {
    // Deux lectures doivent se comparer, et le journal se relire pareil.
    expect(lireAnimauxOuverts('["faune","chien"]')).toEqual(["chien", "faune"]);
  });

  it("les doublons et les inconnus sont écartés", () => {
    expect(lireAnimauxOuverts('["chien","chien","licorne"]')).toEqual(["chien"]);
  });

  it("TOUT CE QUI EST ILLISIBLE REND LES SEPT, jamais aucun", () => {
    /**
     * Vider la boutique sur une clé effacée ou mal écrite serait la pire des
     * deux lectures : personne ne verrait la cause, tout le monde verrait
     * l'effet. On rend les sept, comme avant le réglage.
     */
    for (const brut of [null, undefined, "", "   ", "pas du json", '{"chien":true}', "[]", '["licorne"]']) {
      expect(lireAnimauxOuverts(brut), String(brut)).toEqual([...TOUS_LES_ANIMAUX]);
    }
  });

  it("les sept sont bien les animaux du vocabulaire", () => {
    expect([...TOUS_LES_ANIMAUX]).toEqual([...ANIMAUX]);
    expect(TOUS_LES_ANIMAUX).toHaveLength(7);
  });

  it("écrire puis relire rend la même chose", () => {
    const ecrit = ecrireAnimauxOuverts(["faune", "chien", "chat"]);
    expect(lireAnimauxOuverts(ecrit)).toEqual(["chien", "chat", "faune"]);
  });
});

// ── Ce que l'écran accepte ─────────────────────────────────────────────────

describe("au moins un animal, et seulement des animaux connus", () => {
  it("une liste vide est REFUSÉE, avec une phrase qui dit pourquoi", () => {
    const r = validerAnimauxOuverts([]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain("au moins un animal");
      // Rien n'est enregistré : la fonction ne rend aucune valeur à écrire.
      expect(r).not.toHaveProperty("valeur");
    }
  });

  it("une valeur inconnue est REFUSÉE, et nommée", () => {
    const r = validerAnimauxOuverts(["chien", "licorne"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("licorne");
  });

  it("un seul animal suffit", () => {
    const r = validerAnimauxOuverts(["chien"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.animaux).toEqual(["chien"]);
      expect(r.valeur).toBe('["chien"]');
    }
  });

  it("l'ordre du vocabulaire est rétabli avant d'écrire", () => {
    const r = validerAnimauxOuverts(["faune", "chat", "chien"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.animaux).toEqual(["chien", "chat", "faune"]);
  });

  it("les sept passent", () => {
    const r = validerAnimauxOuverts([...TOUS_LES_ANIMAUX]);
    expect(r.ok).toBe(true);
  });
});

// ── Ce qu'un article devient ───────────────────────────────────────────────

describe("un article face à la liste ouverte", () => {
  it("chien ouvert : un article chien est en ligne", () => {
    expect(articleOuvertEnLigne(["chien"], ["chien", "chat"])).toBe(true);
  });

  it("chien seul ouvert : un article rongeur n'est PAS en ligne", () => {
    expect(articleOuvertEnLigne(["rongeur"], ["chien"])).toBe(false);
  });

  it("UN ARTICLE OISEAU + FAUNE, FAUNE FERMÉE : visible, mais sous Oiseaux seulement", () => {
    /**
     * Le cas de la boule de graisse. Publier ses deux animaux ferait naître un
     * onglet « Faune sauvage » qui ne contiendrait que ce qu'on a justement
     * décidé de ne pas vendre là.
     */
    const ouverts = ["chien", "chat", "rongeur", "furet", "reptile", "oiseau"];
    expect(articleOuvertEnLigne(["oiseau", "faune"], ouverts)).toBe(true);
    expect(animauxOuvertsDeLArticle(["oiseau", "faune"], ouverts)).toEqual(["oiseau"]);
  });

  it("les DEUX fermés : l'article disparaît", () => {
    const ouverts = ["chien", "chat"];
    expect(articleOuvertEnLigne(["oiseau", "faune"], ouverts)).toBe(false);
    expect(animauxOuvertsDeLArticle(["oiseau", "faune"], ouverts)).toEqual([]);
  });

  it("un article sans animal n'est jamais en ligne", () => {
    // Il n'apparaîtrait sous aucun onglet : autant ne pas le proposer du tout.
    expect(articleOuvertEnLigne([], [...TOUS_LES_ANIMAUX])).toBe(false);
    expect(articleOuvertEnLigne(null, [...TOUS_LES_ANIMAUX])).toBe(false);
  });

  it("l'ordre de l'article est conservé dans ce qui est publié", () => {
    expect(animauxOuvertsDeLArticle(["chat", "chien"], ["chien", "chat"])).toEqual(["chat", "chien"]);
  });
});

// ── Ce que la base tient ───────────────────────────────────────────────────

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");

function migrationApp48(): string {
  const f = readdirSync(MIGRATIONS)
    .filter((x) => x.endsWith("_app48_animaux_vendus_en_ligne.sql"))
    .sort()
    .at(-1);
  if (!f) throw new Error("la migration d'APP 48 est absente du dépôt");
  return readFileSync(join(MIGRATIONS, f), "utf8");
}

/** Les valeurs citées d'un bloc SQL, commentaires retirés d'abord. */
function valeursCitees(bloc: string): string[] {
  return (bloc.replace(/--[^\n]*/g, "").match(/'([^']+)'/g) ?? [])
    .map((v) => v.replace(/'/g, ""));
}

describe("la base refuse ce que l'écran refuse", () => {
  it("le vocabulaire de la contrainte est CELUI des animaux", () => {
    /**
     * Deux vocabulaires qui divergent ne se signalent jamais tout seuls : la
     * base accepterait un animal que l'écran ne propose pas, ou refuserait
     * celui qu'il propose — et l'enregistrement échouerait sans qu'on
     * comprenne.
     */
    const sql = migrationApp48();
    const bloc = sql.match(/valeur::jsonb <@ '(\[[^\]]*\])'::jsonb/)?.[1] ?? "";
    expect(JSON.parse(bloc).sort()).toEqual([...ANIMAUX].sort());
  });

  it("la liste vide est refusée par la BASE aussi, pas seulement par l'écran", () => {
    expect(migrationApp48()).toMatch(/jsonb_array_length\(valeur::jsonb\) >= 1/);
  });

  it("la contrainte ne touche QUE cette clé", () => {
    /**
     * `case` et non `or` : l'ordre d'évaluation d'un `or` n'est pas garanti, et
     * `valeur::jsonb` sur « 10 » — la remise membre — lèverait une erreur au
     * lieu de laisser passer. Éprouvé en base : les autres réglages s'écrivent
     * toujours.
     */
    const sql = migrationApp48();
    expect(sql).toMatch(/case when cle = 'animaux_en_ligne'/);
    expect(sql).toMatch(/else true\s*\n?\s*end/);
  });

  it("la vue ne garde que les articles dont un animal est ouvert", () => {
    expect(migrationApp48()).toMatch(/and a\.animaux && o\.ouverts/);
  });

  it("la vue ne publie QUE les animaux ouverts", () => {
    const sql = migrationApp48();
    expect(sql).toMatch(/where x = any \(o\.ouverts\)\) as animaux/);
  });

  it("la clé manquante rend les sept, jamais aucun", () => {
    const sql = migrationApp48();
    const repli = sql.match(/coalesce\(\s*\(select array_agg\(v\)[\s\S]*?array\[([^\]]*)\]::text\[\]/)?.[1] ?? "";
    expect(valeursCitees(repli).sort()).toEqual([...ANIMAUX].sort());
  });

  it("la vitrine garde ses droits, redits", () => {
    const sql = migrationApp48();
    expect(sql).toContain("grant select on public.articles_vitrine to anon, authenticated");
    expect(sql).toContain("security_invoker = false");
  });

  it("AUCUNE FONCTION n'est appelée par la vue", () => {
    /**
     * Le report de droits d'une vue SECURITY DEFINER ne vaut que pour les
     * TABLES : le privilège EXECUTE est vérifié avec le rôle courant, donc avec
     * `anon`. Une fonction fermée appelée d'ici fermerait la vitrine entière —
     * c'est arrivé au lot APP 26. Le réglage est lu dans une TABLE, et c'est
     * pour cela qu'il l'est.
     */
    const sql = migrationApp48();
    const vue = sql.slice(sql.indexOf("create or replace view"));
    expect(vue).toContain("from public.parametres p");
    expect(vue).not.toMatch(/public\.[a-z_]+\(p_/);
  });

  it("rien n'est ouvert à anon qui ne l'était pas", () => {
    // Aucun `grant` sur `parametres` : la vue le lit avec les droits de son
    // propriétaire, et la table reste fermée.
    const sql = migrationApp48();
    expect(sql).not.toMatch(/grant[\s\S]{0,40}on public\.parametres/i);
  });
});

// ── Les trois requêtes qui lisent la table ─────────────────────────────────

const lire = (relatif: string) => readFileSync(join(process.cwd(), relatif), "utf8");

describe("le serveur refuse, pas seulement l'affichage", () => {
  it("LES TROIS requêtes de la table portent le filtre", () => {
    /**
     * Trois endroits interrogent `articles` avec les filtres de publication :
     * le catalogue en ligne, la fiche, et le catalogue du panier. Il suffit
     * qu'UN seul soit oublié pour qu'un article fermé reste commandable par une
     * requête forgée. Ce test les relit tous les trois.
     */
    const vente = lire("src/lib/venteEnLigne.ts");
    const panier = lire("src/lib/panier/catalogue.ts");
    expect((vente.match(/\.overlaps\("animaux", ouverts\)/g) ?? [])).toHaveLength(2);
    expect(panier).toMatch(/\.overlaps\("animaux", await animauxOuvertsEnLigne\(\)\)/);
  });

  it("le panier bloque la confirmation par le mécanisme EXISTANT", () => {
    /**
     * Rien de neuf : l'article sort du catalogue du panier, donc la
     * revalidation ne le trouve plus et écrit « n'est plus proposé ». C'est le
     * chemin d'un article dépublié, réutilisé tel quel.
     */
    const actions = lire("app/(public)/catalogue/actions.ts");
    expect(actions).toMatch(/n'est plus proposé/);
    expect(actions).toMatch(/chargerCatalogue\(/);
  });

  it("l'alerte « retour en stock » ne part pas pour un animal fermé", () => {
    const src = lire("src/lib/alertesStock.ts");
    expect(src).toMatch(/if \(!articleOuvertEnLigne\(article\.animaux[\s\S]{0,60}return resultat/);
  });

  it("l'application réduit aussi les animaux publiés, comme la vue", () => {
    // Sans cela, l'onglet d'un animal fermé renaîtrait dans l'application d'un
    // article qui porte les deux — alors qu'il aurait disparu du site.
    expect(lire("src/lib/venteEnLigne.ts")).toMatch(/animaux: animauxOuvertsDeLArticle\(/);
  });
});

describe("RIEN NE CHANGE AU COMPTOIR", () => {
  it("la liste d'administration ne connaît pas ce réglage", () => {
    /**
     * Un article fermé en ligne reste vendable en caisse, comptable à
     * l'inventaire et visible dans la liste. C'est le sens même du réglage :
     * une décision de vitrine, pas de catalogue.
     */
    for (const f of [
      "app/(admin)/boutique/articles/page.tsx",
      "app/components/stock/CatalogueStock.tsx",
      "src/lib/listeArticlesAdmin.ts",
    ]) {
      expect(lire(f), f).not.toContain("animauxOuvertsEnLigne");
      expect(lire(f), f).not.toContain(CLE_ANIMAUX_EN_LIGNE);
    }
  });

  it("la caisse et l'inventaire non plus", () => {
    for (const f of ["src/lib/boutique.ts", "src/lib/caisse.ts"]) {
      expect(lire(f), f).not.toContain("animauxOuvertsEnLigne");
    }
  });
});

describe("l'écran des réglages", () => {
  const ACTIONS = "app/(admin)/(espace-reglages)/reglages/boutique/actions.ts";

  it("la phrase d'aide, mot pour mot", () => {
    expect(AIDE_ANIMAUX_EN_LIGNE).toBe(
      "Un animal décoché disparaît de la boutique en ligne (application et site). "
      + "Ses articles restent vendables au comptoir.",
    );
  });

  it("réservé à l'administratrice, comme les autres réglages", () => {
    const src = lire(ACTIONS);
    const bloc = src.slice(src.indexOf("export async function enregistrerAnimauxEnLigne"));
    expect(bloc).toMatch(/verifierAdmin\(\)/);
    expect(bloc).toMatch(/Réservé à l'administratrice/);
  });

  it("chaque changement est inscrit au journal, avant → après", () => {
    const src = lire(ACTIONS);
    const bloc = src.slice(src.indexOf("export async function enregistrerAnimauxEnLigne"));
    expect(bloc).toMatch(/tracerEvenement\(\{/);
    expect(bloc).toMatch(/entite: "parametre"/);
    expect(bloc).toMatch(/evenement: CLE_ANIMAUX_EN_LIGNE/);
    expect(bloc).toMatch(/avant: \{ animaux:/);
    expect(bloc).toMatch(/apres: \{ animaux: saisie\.animaux \}/);
  });

  it("rien n'est écrit quand la saisie est refusée", () => {
    // La garde est avant l'upsert, pas après : un refus ne doit laisser aucune
    // trace, pas même une ligne de paramètre à moitié écrite.
    const src = lire(ACTIONS);
    const bloc = src.slice(src.indexOf("export async function enregistrerAnimauxEnLigne"));
    expect(bloc.indexOf("if (!saisie.ok) return")).toBeLessThan(bloc.indexOf(".upsert("));
  });

  it("le nombre d'articles se lit dans la TABLE, pas dans la vitrine", () => {
    /**
     * La vitrine ne montre déjà plus les animaux fermés : l'écran n'apprendrait
     * rien sur ce qu'on rouvre, qui est exactement la question qu'on se pose
     * devant ces cases.
     */
    const page = lire("app/(admin)/(espace-reglages)/reglages/boutique/page.tsx");
    expect(page).toMatch(/\.from\("articles"\)/);
    expect(page).not.toContain("articles_vitrine");
  });

  it("les libellés viennent d'etiquettesArticles, jamais écrits en dur", () => {
    const page = lire("app/(admin)/(espace-reglages)/reglages/boutique/page.tsx");
    expect(page).toMatch(/libelleValeur\("animaux", valeur\)/);
    for (const mot of ["Chiens", "Faune sauvage", "Rongeurs"]) {
      expect(page, mot).not.toContain(`"${mot}"`);
    }
  });
});
