import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Le vocabulaire des animaux, des espèces, des âges et des soins : ce que la
 * BASE refuse, et qui ne peut donc pas arriver par un autre chemin.
 *
 * Ces contraintes sont l'endroit où le vocabulaire est vraiment tenu. Un écran
 * qui ne propose que les bonnes valeurs est une commodité ; un CHECK est une
 * garantie. Ce fichier relit les contraintes DANS la migration — les valeurs
 * elles-mêmes sont éprouvées en base, en transaction annulée, et le résultat
 * est consigné dans le message du commit.
 *
 * Pourquoi relire le fichier plutôt que d'interroger la base : la suite tourne
 * sans connexion, et c'est le dépôt qui doit pouvoir reconstruire la base
 * (règle d'AGENTS.md). Une contrainte présente en base mais absente du fichier
 * disparaîtrait à la première reconstruction.
 */

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");

/** Le contenu de la migration qui pose une contrainte donnée, la plus récente. */
function migrationDe(contrainte: string): string {
  const fichiers = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  const trouve = fichiers
    .filter((f) => readFileSync(join(MIGRATIONS, f), "utf8").includes(`add constraint ${contrainte}`))
    .at(-1);
  if (!trouve) throw new Error(`aucune migration ne pose ${contrainte}`);
  return readFileSync(join(MIGRATIONS, trouve), "utf8");
}

describe("le vocabulaire des animaux", () => {
  const sql = () => migrationDe("articles_animaux_check");

  it("six animaux, et pas un de plus", () => {
    const m = sql().match(/articles_animaux_check check \(\s*animaux <@ array\[([^\]]+)\]/);
    expect(m, "la contrainte doit fermer le vocabulaire").toBeTruthy();
    const valeurs = (m?.[1] ?? "").match(/'([^']+)'/g)?.map((v) => v.replace(/'/g, "")) ?? [];
    expect(valeurs.sort()).toEqual(
      ["chat", "chien", "furet", "oiseau", "reptile", "rongeur"]);
  });

  it("un article sans animal est refusé", () => {
    // Il n'apparaîtrait dans AUCUN onglet, et rien ne le dirait : ni « Épuisé »,
    // ni « masqué » — il serait simplement introuvable.
    expect(sql()).toMatch(/cardinality\(animaux\) >= 1/);
  });

  it("les articles existants deviennent des articles pour chiens", () => {
    // Sans cela, 125 articles seraient partis avec un tableau vide — donc
    // refusés par la contrainte, ou invisibles.
    const s = sql();
    expect(s).toMatch(/animaux text\[\] not null default '\{chien\}'/);
    expect(s).toMatch(/update public\.articles set animaux = '\{chien\}'/);
  });

  it("l'index existe : c'est un filtre sur tableau, donc GIN", () => {
    expect(sql()).toContain("articles_animaux_gin on public.articles using gin (animaux)");
  });
});

describe("les espèces, et la place laissée aux suivantes", () => {
  const sql = () => migrationDe("articles_especes_check");

  it("huit espèces de rongeurs, vocabulaire fermé", () => {
    const m = sql().match(/articles_especes_check check \(\s*especes <@ array\[([\s\S]*?)\]::text\[\]/);
    const valeurs = (m?.[1] ?? "").match(/'([^']+)'/g)?.map((v) => v.replace(/'/g, "")) ?? [];
    expect(valeurs.sort()).toEqual(
      ["chinchilla", "cochon_inde", "degu", "gerbille", "hamster", "lapin", "rat", "souris"]);
  });

  it("une espèce sans son animal est refusée, par une contrainte à elle", () => {
    /**
     * Séparée du vocabulaire, et c'est voulu : c'est ELLE qu'on répétera pour
     * les reptiles ou les oiseaux, telle quelle, en changeant l'animal et la
     * liste. Le modèle ne bouge pas — une colonne, un patron.
     */
    const s = sql();
    expect(s).toContain("articles_especes_rongeur_check");
    expect(s).toMatch(/or 'rongeur' = any\(animaux\)/);
  });

  it("la migration DIT comment ajouter les espèces suivantes", () => {
    // Une extension qu'on n'a pas écrite se redécouvre à chaque fois, et se
    // redécouvre mal : la deuxième personne inventera un autre modèle.
    const s = sql();
    expect(s).toMatch(/articles_especes_<animal>_check/);
    expect(s, "le choix contre le trigger doit être motivé").toMatch(/trigger se désactive|disable trigger/);
  });
});

describe("les âges : le chaton entre, le chiot reste", () => {
  const sql = () => migrationDe("articles_ages_check");

  it("cinq âges, dont chaton", () => {
    const m = sql().match(/articles_ages_check check \(\s*ages <@ array\[([^\]]+)\]/);
    const valeurs = (m?.[1] ?? "").match(/'([^']+)'/g)?.map((v) => v.replace(/'/g, "")) ?? [];
    expect(valeurs.sort()).toEqual(["adulte", "chaton", "chiot", "junior", "senior"]);
  });

  it("la base garde le vocabulaire ENTIER, l'écran choisit", () => {
    // Quel âge se propose pour quel animal est une règle d'affichage : la base
    // ne dira jamais qu'un chiot est un chat, et n'a pas à le savoir.
    expect(sql()).toMatch(/règle d'AFFICHAGE|regle d'AFFICHAGE/);
  });
});

describe("les types de soin", () => {
  const sql = () => migrationDe("articles_types_soin_check");

  it("onze types, vocabulaire fermé", () => {
    const m = sql().match(/articles_types_soin_check check \(\s*types_soin <@ array\[([\s\S]*?)\]::text\[\]/);
    const valeurs = (m?.[1] ?? "").match(/'([^']+)'/g)?.map((v) => v.replace(/'/g, "")) ?? [];
    expect(valeurs.sort()).toEqual([
      "antiparasitaire", "apres_shampooing", "demelant", "dents", "griffes",
      "oreilles", "pattes", "pelage", "shampooing", "truffe", "yeux",
    ]);
  });

  it("la migration dit comment allonger la liste", () => {
    expect(sql()).toMatch(/migration qui refait articles_types_soin_check/);
  });
});

describe("les rayons : trois neufs, aucun doublon", () => {
  const sql = () => migrationDe("articles_categorie_check");

  it("dix-neuf catégories, dont les trois neuves", () => {
    const m = sql().match(/articles_categorie_check check \(\s*categorie = any \(array\[([\s\S]*?)\]::text\[\]\)/);
    const valeurs = (m?.[1] ?? "").match(/'([^']+)'/g)?.map((v) => v.replace(/'/g, "")) ?? [];
    expect(valeurs).toHaveLength(19);
    for (const neuve of ["cages_enclos", "griffoirs", "alimentation_complete"]) {
      expect(valeurs, `${neuve} doit exister`).toContain(neuve);
    }
  });

  it("PAS de soins_hygiene : `soins` existait déjà", () => {
    /**
     * La question posée au brief, et sa réponse. Créer `soins_hygiene` à côté de
     * `soins` aurait fait deux rayons pour la même chose, et des articles
     * répartis entre les deux au hasard de la date de saisie. `soins` est
     * réutilisée, son libellé élargi.
     */
    const valeurs = sql().match(/articles_categorie_check check \(\s*categorie = any \(array\[([\s\S]*?)\]::text\[\]\)/)?.[1] ?? "";
    expect(valeurs).toContain("'soins'");
    expect(valeurs, "un doublon de rayon").not.toContain("soins_hygiene");
    // Même raisonnement pour la litière, qui existait aussi.
    expect(valeurs).toContain("'litiere'");
  });

  it("l'ordre du tableau de la vue est le MÊME que celui de la contrainte", () => {
    /**
     * `ordre_categorie` vient d'un `array_position` sur un tableau écrit en dur
     * dans la vue. Une catégorie absente de CE tableau rend NULL : le rayon
     * n'aurait pas d'ordre, et le site le classerait n'importe où — ou nulle
     * part. Les deux listes doivent donc rester jumelles.
     */
    const s = sql();
    const contrainte = s.match(/articles_categorie_check check \(\s*categorie = any \(array\[([\s\S]*?)\]::text\[\]\)/)?.[1] ?? "";
    const vue = s.match(/array_position\(\s*array\[([\s\S]*?)\]::text\[\],/)?.[1] ?? "";
    const lire = (t: string) => (t.match(/'([^']+)'/g) ?? []).map((v) => v.replace(/'/g, ""));
    expect(lire(vue)).toEqual(lire(contrainte));
  });
});
