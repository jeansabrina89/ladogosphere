import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  COLONNES_INTERDITES_AU_PUBLIC,
  COLONNES_PUBLIQUES_VITRINE,
  COLONNES_VITRINE,
} from "@/src/lib/vitrineColonnes";

/**
 * `articles_vitrine` est PUBLIQUE (constat S-04).
 *
 * Elle est lue avec la clé anon, depuis un autre projet, et elle reste
 * SECURITY DEFINER parce que `articles` est en RLS : c'est donc sa LISTE DE
 * COLONNES qui tient lieu de garde. Ce test la compare, terme à terme, à la
 * liste écrite et justifiée dans la migration. Une colonne ajoutée d'un côté
 * seulement fait échouer le test — c'est tout l'intérêt : une colonne
 * publique se décide, elle ne s'ajoute pas au passage.
 */

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");
const FICHIER = "20260926100738_app24_vitrine_etiquettes.sql";
const sql = () => readFileSync(join(MIGRATIONS, FICHIER), "utf8");

/** Les colonnes RENDUES par la vue, lues dans son `create view`. */
function colonnesDeLaVue(): string[] {
  const texte = sql();
  const debut = texte.indexOf("create view public.articles_vitrine as");
  const fin = texte.indexOf("from public.articles a", debut);
  expect(debut).toBeGreaterThan(-1);
  expect(fin).toBeGreaterThan(debut);
  const corps = texte
    .slice(debut, fin)
    .replace(/create view public\.articles_vitrine as\s*select/, "")
    // Les commentaires du SQL ne sont pas des colonnes.
    .replace(/--[^\n]*/g, "");

  const colonnes: string[] = [];
  let profondeur = 0;
  let courant = "";
  for (const c of corps) {
    if (c === "(" || c === "[") profondeur++;
    else if (c === ")" || c === "]") profondeur--;
    if (c === "," && profondeur === 0) {
      colonnes.push(courant);
      courant = "";
    } else courant += c;
  }
  colonnes.push(courant);

  return colonnes
    .map((c) => c.replace(/\s+/g, " ").trim())
    .filter((c) => c.length > 0)
    .map((c) => {
      // « … as en_stock » : c'est l'alias qui sort. Sinon « a.nom » → « nom ».
      const alias = / as (\w+)$/i.exec(c);
      if (alias) return alias[1];
      return c.replace(/^a\./, "");
    });
}

describe("la vue de la vitrine", () => {
  it("est dans le dépôt, sous la version enregistrée en base", () => {
    expect(readdirSync(MIGRATIONS)).toContain(FICHIER);
  });

  it("n'expose AUCUNE colonne hors de la liste publique, ni dans un sens ni dans l'autre", () => {
    expect(colonnesDeLaVue()).toEqual([...COLONNES_PUBLIQUES_VITRINE]);
  });

  it("porte bien les étiquettes des filtres", () => {
    const rendues = colonnesDeLaVue();
    for (const colonne of [
      "ages", "besoins", "tailles_chien", "proteines", "sans_cereales",
      "monoproteine", "taille_article", "couleurs", "matieres", "usages_jouet",
      // Demandées par le lot, déjà présentes avant lui.
      "marque", "expediable", "en_stock",
    ]) {
      expect(rendues).toContain(colonne);
    }
  });

  it("ne porte rien de ce qui est interdit au public — stock chiffré compris", () => {
    const rendues = colonnesDeLaVue();
    for (const interdite of COLONNES_INTERDITES_AU_PUBLIC) {
      expect(rendues).not.toContain(interdite);
      expect(COLONNES_VITRINE).not.toContain(interdite);
    }
    // `stock_disponible` était dans la vue avant ce lot : elle en sort.
    expect(rendues).not.toContain("stock_disponible");
    expect(sql()).not.toMatch(/as stock_disponible/);
  });

  it("dit pourquoi chaque colonne publique l'est", () => {
    const entete = sql().slice(0, sql().indexOf("drop view"));
    for (const colonne of COLONNES_PUBLIQUES_VITRINE) {
      expect(entete).toContain(colonne);
    }
    expect(entete).toContain("CETTE VUE EST PUBLIQUE");
    expect(entete).toContain("S-04");
  });

  it("ne garde que la lecture pour anon et authenticated", () => {
    const texte = sql();
    expect(texte).toMatch(/revoke all on public\.articles_vitrine from anon, authenticated;/);
    expect(texte).toMatch(/grant select on public\.articles_vitrine to anon, authenticated;/);
    // Aucun droit d'écriture redonné après la révocation.
    expect(texte).not.toMatch(/grant (insert|update|delete|all)[^;]*articles_vitrine[^;]*to anon/i);
  });

  it("garde le filtre de publication : un brouillon ne se sert pas", () => {
    const texte = sql();
    expect(texte).toContain("a.actif = true");
    expect(texte).toContain("a.vendable_en_ligne = true");
    expect(texte).toContain("a.composant = false");
    expect(texte).toContain("a.statut_vitrine = 'publie'");
    expect(texte).toContain("a.date_publication is null or a.date_publication <= now()");
  });

  it("demande à PostgREST des colonnes nommées, jamais une étoile", () => {
    expect(COLONNES_VITRINE).not.toContain("*");
    expect(COLONNES_VITRINE.split(", ")).toEqual([...COLONNES_PUBLIQUES_VITRINE]);
  });
});
