import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  resoudreGroupes,
  nomNormalise,
  groupesHomonymes,
  messageGroupeDuModele,
  messageRattachementRefuse,
  refusOrdreGroupes,
  SOURCE_ARTICLE,
  type BlocOptions,
  type OptionGroupe,
  type OptionValeur,
} from "@/src/lib/personnalisationLogique";

const lire = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function valeur(id: string, libelle: string, ordre: number): OptionValeur {
  return {
    id, libelle, ordre,
    image_path: null, code_couleur: null,
    supplement_prix: 0, supplement_delai_jours: 0,
    composant_article_id: null, composant_quantite: null,
    actif: true, defaut: false,
  };
}

function groupe(p: Partial<OptionGroupe> & { id: string; nom: string }): OptionGroupe {
  return {
    type: "liste", obligatoire: false, ordre: 1,
    aide: null, max_caracteres: null, depend_de_groupe_id: null,
    valeurs: [], ...p,
  };
}

const LARGEURS = ["9 mm", "13 mm", "16 mm", "19 mm", "25 mm", "38 mm", "50 mm"];
const largeurs = (prefixe: string, libelles = LARGEURS) =>
  libelles.map((l, i) => valeur(`${prefixe}-${i}`, l, i + 1));

/** Le collier 23 d'avant la reprise : le modèle et l'article portent chacun « Largeur ». */
function collier23(nomArticle = "Largeur"): BlocOptions[] {
  return [
    {
      source: "Gamme BioTHane", ordre: 1, proprietaire: "modele",
      groupes: [
        groupe({ id: "m-larg", nom: "Largeur", ordre: 1, valeurs: largeurs("m", [...LARGEURS.slice(0, 6), "50"]) }),
        groupe({
          id: "m-coul", nom: "Couleur de la base du collier", type: "couleur", ordre: 2,
          depend_de_groupe_id: "m-larg", valeurs: [valeur("c-1", "VI521 violet", 1)],
        }),
      ],
    },
    {
      source: SOURCE_ARTICLE, ordre: 2, proprietaire: "article",
      groupes: [
        groupe({ id: "a-long", nom: "Longueur du collier", type: "taille", ordre: 1, valeurs: [valeur("t-1", "s", 1)] }),
        groupe({ id: "a-larg", nom: nomArticle, ordre: 2, valeurs: largeurs("a") }),
      ],
    },
  ];
}

// ── La règle : l'article l'emporte ─────────────────────────────────────────

describe("fusion par nom : le groupe de l'article l'emporte sur celui du modèle", () => {
  it("un seul « Largeur », celui de l'article, avec ses sept largeurs", () => {
    const { groupes, surcharges, fusions } = resoudreGroupes(collier23());
    const larg = groupes.filter((g) => nomNormalise(g.nom) === "largeur");
    expect(larg).toHaveLength(1);
    expect(larg[0].id).toBe("a-larg");
    expect(larg[0].valeurs.map((v) => v.libelle)).toEqual(LARGEURS);
    expect(surcharges).toEqual([{ nom: "Largeur", modele: "Gamme BioTHane" }]);
    expect(fusions).toEqual([]);
  });

  it("le groupe de l'article prend la place de celui du modèle, et les dépendants le suivent", () => {
    const { groupes } = resoudreGroupes(collier23());
    expect(groupes.map((g) => g.nom)).toEqual([
      "Largeur", "Couleur de la base du collier", "Longueur du collier",
    ]);
    const couleur = groupes.find((g) => g.nom.startsWith("Couleur"))!;
    expect(couleur.depend_de_groupe_id).toBe("a-larg");
    expect(refusOrdreGroupes(groupes)).toBeNull();
  });

  it("aucun doublon rendu quand deux homonymes existent encore (données anciennes)", () => {
    const { groupes } = resoudreGroupes(collier23());
    const noms = groupes.map((g) => nomNormalise(g.nom));
    expect(new Set(noms).size).toBe(noms.length);
    const libelles = groupes.flatMap((g) => g.valeurs.map((v) => `${g.id}|${v.libelle}`));
    expect(new Set(libelles).size).toBe(libelles.length);
  });

  it("casse et espaces ignorés : « largeur » et « Largeur  » remplacent « Largeur »", () => {
    for (const nom of ["largeur", "Largeur  ", " LARGEUR"]) {
      const { groupes, surcharges } = resoudreGroupes(collier23(nom));
      expect(groupes.filter((g) => nomNormalise(g.nom) === "largeur")).toHaveLength(1);
      expect(surcharges).toHaveLength(1);
    }
  });

  it("l'article l'emporte même si le type diffère", () => {
    const blocs = collier23();
    blocs[1].groupes[1] = { ...blocs[1].groupes[1], type: "mesure" };
    const { groupes } = resoudreGroupes(blocs);
    expect(groupes.filter((g) => nomNormalise(g.nom) === "largeur").map((g) => g.id)).toEqual(["a-larg"]);
  });

  it("les simulations qui nomment le bloc « Cet article » sans propriétaire suivent la même règle", () => {
    const blocs = collier23().map((b) => ({ source: b.source, ordre: b.ordre, groupes: b.groupes }));
    const { groupes } = resoudreGroupes(blocs);
    expect(groupes.filter((g) => g.nom === "Largeur").map((g) => g.id)).toEqual(["a-larg"]);
  });

  it("entre deux modèles, la fusion d'avant ne change pas : valeurs cumulées", () => {
    const { groupes, fusions, surcharges } = resoudreGroupes([
      { source: "A", ordre: 1, proprietaire: "modele", groupes: [groupe({ id: "a", nom: "Taille", valeurs: [valeur("1", "S", 1)] })] },
      { source: "B", ordre: 2, proprietaire: "modele", groupes: [groupe({ id: "b", nom: "taille", valeurs: [valeur("2", "M", 1)] })] },
    ]);
    expect(groupes).toHaveLength(1);
    expect(groupes[0].id).toBe("a");
    expect(groupes[0].valeurs.map((v) => v.libelle)).toEqual(["S", "M"]);
    expect(fusions).toEqual([{ nom: "Taille", sources: ["A", "B"] }]);
    expect(surcharges).toEqual([]);
  });
});

// ── La saisie : les refus ──────────────────────────────────────────────────

describe("refus à la saisie", () => {
  it("créer un groupe du nom d'un groupe du modèle : le message exact", () => {
    expect(groupesHomonymes([{ nom: "Largeur" }], [{ nom: "Largeur" }, { nom: "Couleur" }])).toEqual(["Largeur"]);
    expect(messageGroupeDuModele("Gamme BioTHane", "Largeur")).toBe(
      "Le modèle « Gamme BioTHane » porte déjà un groupe « Largeur ». Modifiez-le sur le modèle, ou détachez l'article du modèle.",
    );
  });

  it("insensible à la casse et aux espaces : « largeur » bute sur « Largeur »", () => {
    expect(groupesHomonymes([{ nom: "largeur" }], [{ nom: "Largeur" }])).toEqual(["largeur"]);
    expect(groupesHomonymes([{ nom: "  Largeur   du  collier " }], [{ nom: "largeur du collier" }])).toHaveLength(1);
    expect(groupesHomonymes([{ nom: "Largeur" }], [{ nom: "Longueur" }])).toEqual([]);
  });

  it("rattacher un modèle en conflit : refus avec la liste des conflits", () => {
    const conflits = groupesHomonymes(
      [{ nom: "Largeur" }, { nom: "Couleur" }, { nom: "Gravure" }],
      [{ nom: "largeur" }, { nom: "COULEUR" }],
    );
    expect(conflits).toEqual(["Largeur", "Couleur"]);
    const m = messageRattachementRefuse("Gamme BioTHane", conflits);
    expect(m).toContain("« Largeur », « Couleur »");
    expect(m).toContain("porte déjà des groupes du même nom");
    expect(messageRattachementRefuse("X", ["Largeur"])).toContain("porte déjà un groupe du même nom — « Largeur »");
  });

  it("l'écran des options refuse à la création comme au renommage", () => {
    const src = lire("app/components/options/actions.ts");
    const corps = src.slice(src.indexOf("export async function enregistrerGroupe"));
    expect(corps).toMatch(/refusGroupeHomonyme\(cible\(entree\.porteur\), nom\)/);
    expect(src).toMatch(/porte déjà un groupe/);
  });

  it("le rattachement refuse avant d'écrire, et « transformer en modèle » retire les originaux d'abord", () => {
    const src = lire("app/(admin)/boutique/modeles/actions.ts");
    const attacher = src.slice(src.indexOf("export async function attacherModele"));
    expect(attacher.indexOf("messageRattachementRefuse")).toBeGreaterThan(0);
    expect(attacher.indexOf("messageRattachementRefuse")).toBeLessThan(attacher.indexOf(".insert("));
    const transformer = src.slice(src.indexOf("export async function transformerEnModele"));
    expect(transformer.indexOf('.delete().eq("article_id", articleId)'))
      .toBeLessThan(transformer.indexOf("attacherModele(articleId"));
  });
});

// ── Une seule fonction pour tous ───────────────────────────────────────────

describe("configurateur, aperçu de l'atelier et validation passent par la même fonction", () => {
  it.each([
    "app/(public)/catalogue/[id]/page.tsx",
    "app/(public)/catalogue/actions.ts",
    "app/(admin)/boutique/caisse/sur-mesure/[articleId]/page.tsx",
    "app/(admin)/boutique/caisse/sur-mesure/actions.ts",
    "app/(admin)/boutique/articles/[id]/options/page.tsx",
  ])("%s lit lireCatalogueOptions", (f) => {
    expect(lire(f)).toMatch(/lireCatalogueOptions\(/);
  });

  it("lireCatalogueOptions assemble avec resoudreGroupes", () => {
    const src = lire("src/lib/personnalisation.ts");
    expect(src).toMatch(/resoudreGroupes\(await blocsArticle\(articleId\)\)/);
    expect(src).toMatch(/proprietaire: "article"/);
    expect(src).toMatch(/proprietaire: "modele"/);
  });
});

// ── La migration ───────────────────────────────────────────────────────────

describe("migration de reprise et contrainte en base", () => {
  const nom = readdirSync(join(process.cwd(), "supabase/migrations"))
    .find((f) => f.endsWith("_options_homonymes_modele.sql"));
  const sql = nom ? lire(`supabase/migrations/${nom}`) : "";

  it("existe, datée", () => {
    expect(nom).toMatch(/^\d{14}_options_homonymes_modele\.sql$/);
  });

  it("renomme « 50 » en « 50 mm » et supprime le groupe de l'article, gardes d'abord", () => {
    expect(sql).toMatch(/set libelle = '50 mm'\s+where groupe_id = v_groupe_modele and libelle = '50'/);
    expect(sql).toMatch(/delete from public\.options_groupes where id = v_groupe_article/);
    expect(sql.indexOf("est référencé")).toBeLessThan(sql.indexOf("delete from public.options_groupes"));
    expect(sql.indexOf("absente du modèle")).toBeLessThan(sql.indexOf("delete from public.options_groupes"));
  });

  it("pose les deux triggers, fonctions fermées", () => {
    expect(sql).toMatch(/create trigger options_groupes_homonyme\s+before insert or update of nom/);
    expect(sql).toMatch(/create trigger article_modeles_homonyme\s+before insert/);
    for (const f of ["verifier_groupe_homonyme", "verifier_rattachement_homonyme"]) {
      expect(sql).toContain(`revoke execute on function public.${f}() from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${f}() to service_role;`);
    }
  });

  it("dit le même message que l'application", () => {
    expect(sql).toContain(
      "porte déjà un groupe « % ». Modifiez-le sur le modèle, ou détachez l''article du modèle.",
    );
  });
});
