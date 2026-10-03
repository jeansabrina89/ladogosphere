import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { prixApplicable, type Promotion } from "@/src/lib/prixLogique";
import { COLONNES_PUBLIQUES_VITRINE } from "@/src/lib/vitrineColonnes";

/**
 * APP 62 — ce que `articles_vitrine` dit des offres, et le prix qu'elle annonce.
 *
 * ── CE QUE CE FICHIER PEUT, ET CE QU'IL NE PEUT PAS ───────────────────────
 *
 * La suite tourne sans connexion à la base. La vue a donc été lue EN BASE le
 * 3 octobre 2026, avec le rôle anon, dans une transaction annulée : douze
 * articles de la vitrine, huit rubriques de test (deux actions « tous »,
 * une expirée, une inactive, une future, une « membres », une nouveauté, une
 * à 15 % sur cinq prix choisis pour piéger l'arrondi), une case coup de cœur.
 * Rien n'a survécu au ROLLBACK — vérifié par une relecture.
 *
 * Ces mesures sont recopiées ci-dessous, et ce fichier exige que
 * `prixApplicable` — la fonction de la caisse et de la commande en ligne —
 * rende EXACTEMENT les mêmes prix, et tranche les mêmes cas de la même façon.
 * Si l'un des deux bouge, ce test rougit. Il relit aussi la migration, pour
 * que les filtres mesurés soient bien ceux qui y sont écrits.
 */

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");

function derniereDefinitionDeLaVue(): { fichier: string; sql: string } {
  const fichier = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => /create\s+(or\s+replace\s+)?view\s+public\.articles_vitrine/i
      .test(readFileSync(join(MIGRATIONS, f), "utf8")))
    .sort()
    .at(-1)!;
  return { fichier, sql: readFileSync(join(MIGRATIONS, fichier), "utf8") };
}

/** Le corps exécutable de la vue, sans aucun commentaire. */
function corpsDeLaVue(): string {
  const { sql } = derniereDefinitionDeLaVue();
  const i = sql.search(/create\s+or\s+replace\s+view\s+public\.articles_vitrine/i);
  return sql.slice(i).replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const JOUR = "2026-10-03";

function promo(p: Partial<Promotion> & { nom: string }): Promotion {
  return {
    id: p.nom, type: "action", pourcentage: 20, date_debut: "2026-10-02",
    date_fin: "2026-10-13", cible: "tous", actif: true, ...p,
  };
}

/** Le prix d'un VISITEUR, celui que le site affiche. */
const pourVisiteur = (prix: number, promotions: Promotion[]) =>
  prixApplicable({ article: { id: "a", prix_vente: prix, promotions }, client: null, date: JOUR });

// ── 1. L'arrondi ───────────────────────────────────────────────────────────

/**
 * [prix de vente, pourcentage, offre_prix lu en base].
 *
 * Les douze premiers : la formule de la vue, appliquée en base à chaque prix.
 * Les six suivants : la VUE elle-même, lue par anon (article 1 à −30 %, puis
 * les cinq prix piégés à −15 %).
 */
const MESURES_EN_BASE: [number, number, number][] = [
  [10.05, 10, 9.05], [12.90, 15, 10.96], [7.45, 30, 5.21], [19.99, 20, 15.99],
  [0.35, 50, 0.17], [33.33, 33, 22.33], [2.15, 10, 1.93], [1.15, 50, 0.58],
  [8.05, 10, 7.24], [45.5, 12.5, 39.81], [0.05, 50, 0.02], [4.35, 10, 3.91],
  [16.95, 30, 11.86],
  [12.90, 15, 10.96], [7.45, 15, 6.33], [2.15, 15, 1.83], [8.05, 15, 6.84], [4.35, 15, 3.70],
];

describe("offre_prix est le prix de prixApplicable, au centime", () => {
  it.each(MESURES_EN_BASE)("%s à −%s %% : la vue dit %s, la caisse aussi", (prix, pct, mesure) => {
    const r = pourVisiteur(prix, [promo({ nom: "Offre", pourcentage: pct })]);
    expect(r.prixFinal).toBe(mesure);
    expect(r.pourcentage).toBe(pct);
  });

  it("un arrondi EXACT aurait donné d'autres prix — c'est pourquoi la vue calcule en double", () => {
    // Si ce test rougit un jour parce que plus aucun cas ne diffère, c'est que
    // prixApplicable est passé au calcul exact : la vue doit alors suivre.
    const exact = (p: number, pct: number) => Math.round(p * (100 - pct)) / 100;
    const differents = MESURES_EN_BASE.filter(([p, pct, m]) => exact(p, pct) !== m);
    expect(differents.length).toBeGreaterThan(0);
    expect(pourVisiteur(12.90, [promo({ nom: "O", pourcentage: 15 })]).prixFinal).toBe(10.96);
  });

  it("la migration écrit Math.round, et non round(float8) qui arrondit au pair", () => {
    const corps = corpsDeLaVue();
    const rond = corps.match(/floor\((\w+)\.v\) \+ case when \1\.v - floor\(\1\.v\) >= 0\.5 then 1 else 0 end/g) ?? [];
    expect(rond, "trois arrondis : la base, la remise, le prix final").toHaveLength(3);
    expect(corps).toMatch(/a\.prix_vente::float8 \* 100/);
    expect(corps).toMatch(/b\.base \* coalesce\(off\.pourcentage, 0\)::float8 \/ 100 \* 100/);
    expect(corps).toMatch(/\(b\.base - r\.remise\) \* 100/);
  });
});

// ── 2. Quelle offre sort, et quand ─────────────────────────────────────────

describe("la vue et prixApplicable tranchent les mêmes cas", () => {
  /*
   * Ce qu'a rendu la vue, lue par anon, pour chaque cas — et ce que la
   * fonction de la caisse doit rendre pour un visiteur.
   */
  it("une action « tous » en cours : offre remplie (mesuré : 30 %, « T62 Forte »)", () => {
    const r = pourVisiteur(16.95, [
      promo({ nom: "T62 Faible", pourcentage: 20 }),
      promo({ nom: "T62 Forte", pourcentage: 30 }),
    ]);
    expect(r.pourcentage).toBe(30);
    expect(r.libelle).toBe("T62 Forte −30 %");
    expect(r.prixFinal).toBe(11.86);
  });

  it.each([
    ["expirée", promo({ nom: "Expirée", date_debut: "2026-09-23", date_fin: "2026-10-02" })],
    ["inactive", promo({ nom: "Inactive", actif: false })],
    ["future", promo({ nom: "Future", date_debut: "2026-10-04" })],
    ["réservée aux membres", promo({ nom: "Membres", pourcentage: 50, cible: "membres" })],
  ])("une action %s : aucune offre (mesuré : offre_* à NULL)", (_cas, p) => {
    const r = pourVisiteur(17.95, [p]);
    expect(r.pourcentage).toBeNull();
    expect(r.prixFinal).toBe(17.95);
  });

  it("les bornes sont incluses : une offre d'un seul jour, aujourd'hui, s'applique", () => {
    const r = pourVisiteur(12.90, [promo({ nom: "Jour", pourcentage: 15, date_debut: JOUR, date_fin: JOUR })]);
    expect(r.prixFinal).toBe(10.96);
  });

  it("une nouveauté ne remise pas (mesuré : nouveaute = vrai, offre_* à NULL)", () => {
    const r = pourVisiteur(9.95, [promo({ nom: "Nouv", type: "nouveaute", pourcentage: null })]);
    expect(r.pourcentage).toBeNull();
  });
});

describe("la migration écrit les filtres qui ont été mesurés", () => {
  const corps = corpsDeLaVue();
  const offre = /left join lateral \(\s*select p\.pourcentage, p\.nom, p\.texte, p\.date_fin([\s\S]*?)\) off on true/
    .exec(corps)?.[1] ?? "";
  const nouveaute = /exists \(([\s\S]*?)\) as nouveaute/.exec(corps)?.[1] ?? "";

  it("l'offre : Action ou Anti-gaspillage, POUR TOUS, active, en cours, la plus forte", () => {
    expect(offre).not.toBe("");
    expect(offre).toContain("p.type in ('action', 'anti_gaspillage')");
    expect(offre).toContain("p.cible = 'tous'");
    expect(offre).toContain("p.actif = true");
    expect(offre).toContain("p.pourcentage > 0");
    expect(offre).toContain("p.date_debut <= j.aujourdhui");
    expect(offre).toContain("(p.date_fin is null or j.aujourdhui <= p.date_fin)");
    expect(offre).toMatch(/order by p\.pourcentage desc, p\.nom\s+limit 1/);
  });

  it("la nouveauté : même règle de dates, pour tous", () => {
    expect(nouveaute).toContain("p.type = 'nouveaute'");
    expect(nouveaute).toContain("p.cible = 'tous'");
    expect(nouveaute).toContain("p.actif = true");
    expect(nouveaute).toContain("(p.date_fin is null or j.aujourdhui <= p.date_fin)");
  });

  it("aucune rubrique « membres » ne sort, sous aucune forme", () => {
    expect(corps).not.toMatch(/'membres'/);
  });

  it("« aujourd'hui » est le jour de Zurich, comme aujourdhuiISO()", () => {
    expect(corps).toContain("(now() at time zone 'Europe/Zurich')::date as aujourdhui");
  });

  it("coup_de_coeur reflète la colonne, telle quelle", () => {
    expect(corps).toMatch(/\ba\.coup_de_coeur,/);
  });

  it("la remise membre : rien pour un article exclu, et seulement un taux actif et non nul", () => {
    expect(corps).toMatch(/case when a\.remise_membre_exclue then null::numeric/);
    expect(corps).toContain("r.actif = true");
    expect(corps).toContain("r.pourcentage > 0");
  });

  it("cree_le : la publication, sinon la création", () => {
    expect(corps).toContain("coalesce(a.date_publication, a.created_at) as cree_le");
  });

  it("les neuf colonnes sont publiques, à la fin, rien retiré avant elles", () => {
    expect(COLONNES_PUBLIQUES_VITRINE.slice(-9)).toEqual([
      "coup_de_coeur", "nouveaute", "offre_pourcentage", "offre_nom", "offre_texte",
      "offre_date_fin", "offre_prix", "remise_membre_pourcent", "cree_le",
    ]);
    expect(COLONNES_PUBLIQUES_VITRINE.slice(0, 3)).toEqual(["id", "reference", "nom"]);
    expect(COLONNES_PUBLIQUES_VITRINE).toContain("types_soin");
  });
});

// ── 3. Ce qui reste fermé ──────────────────────────────────────────────────

describe("la vue est lisible par anon, les rubriques ne le sont pas", () => {
  const toutes = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ f, sql: readFileSync(join(MIGRATIONS, f), "utf8") }));

  it("aucune migration n'ouvre promotions, ni ses articles, ni la remise membre à anon", () => {
    for (const { f, sql } of toutes) {
      expect(
        sql,
        `${f} ouvre une table de rubriques au public : c'est la vue seule qui doit les exposer`,
      ).not.toMatch(/grant\s+[^;]*\bon\s+(table\s+)?(public\.)?(promotions|promotions_articles|remise_membre_categories)\b[^;]*\bto\s+[^;]*\banon\b/i);
    }
  });

  it("la dernière définition de la vue redit ses droits : lecture seule pour anon et authenticated", () => {
    const { fichier, sql } = derniereDefinitionDeLaVue();
    expect(fichier).toMatch(/app62_coups_de_coeur_offre_vitrine/);
    expect(sql).toMatch(/revoke all on public\.articles_vitrine from anon, authenticated;/);
    expect(sql).toMatch(/grant select on public\.articles_vitrine to anon, authenticated;/);
    expect(sql).toMatch(/security_invoker = false/);
  });
});
