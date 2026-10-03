import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";
import { CLES_HORAIRES } from "@/src/lib/horaires";

/**
 * APP 64 — aucune heure « HH:MM » écrite en dur dans l'app.
 *
 * Toutes les heures de la pension suivent Réglages → Entreprise → Horaires
 * d'accueil (décision de Sabrina, 30.09.2026). Une heure recopiée dans un
 * fichier, c'est un endroit qui dira « 9h » le jour où la pension ouvrira à
 * 8h — sans que rien ne le signale. Ce test le signale.
 *
 * Il lit `app/` et `src/`, SANS les commentaires (une explication n'est pas un
 * usage), et refuse toute heure littérale hors de `src/lib/horaires.ts`, où
 * vivent les valeurs de départ. La liste blanche est courte, et chaque entrée
 * dit pourquoi ce n'est PAS un horaire d'accueil.
 */

const RACINE = join(__dirname, "..");
const HEURE = /\b([01]\d|2[0-3]):[0-5]\d\b/g;

type Exception = {
  /** Le fichier, ou `*` pour une forme qui vaut partout. */
  fichier: string;
  /** Les heures tolérées, ou une forme exacte (`T12:00:00`). */
  permis: string[];
  raison: string;
};

const LISTE_BLANCHE: Exception[] = [
  {
    fichier: "*",
    permis: ["T12:00:00", "T00:00:00"],
    raison:
      "Ancres de calendrier, pas des heures d'accueil : midi pour lire une date « AAAA-MM-JJ » "
      + "sans glisser de jour au changement d'heure, minuit pour le début d'une journée dans un filtre.",
  },
  {
    fichier: "src/lib/journeeEssai.ts",
    permis: ["09:30", "11:00"],
    raison:
      "Bornes de la plage où l'admin FORCE une seconde journée d'essai : une fenêtre de travail de "
      + "l'équipe, pas un horaire annoncé. Seule l'heure exclue (l'essai ordinaire) suit le réglage.",
  },
  {
    fichier: "src/lib/calculTarif.ts",
    permis: ["12:00"],
    raison:
      "Midi sépare le matin du soir pour le supplément « journée » d'un séjour : une règle de tarif, "
      + "qui ne bouge pas quand l'accueil change d'heure.",
  },
  {
    fichier: "app/(admin)/employes/mon-espace/timbrage/FormTimbrage.tsx",
    permis: ["07:30", "12:00", "14:30", "18:30"],
    raison: "Heures de TRAVAIL proposées au timbrage du personnel, pas d'accueil des chiens.",
  },
  {
    fichier: "app/(admin)/(espace-equipe)/employes/timbrage/TimbrageCalendrier.tsx",
    permis: ["07:30", "12:00", "14:30", "18:30"],
    raison: "Même chose, côté administration du timbrage.",
  },
  {
    fichier: "app/(admin)/(espace-reglages)/reglages/entreprise/FormHoraires.tsx",
    permis: ["07:35", "10:00"],
    raison: "L'aide de l'écran des horaires lui-même : un exemple de SYNTAXE (« 07:35-10:00 »).",
  },
];

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const chemin = join(dossier, n);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(ts|tsx)$/.test(n) ? [chemin] : [];
  });
}

/** Le code sans commentaires — les lignes gardent leur numéro. */
function codeSeul(texte: string): string {
  return texte
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (_m, avant) => avant);
}

/** Les heures littérales d'un code, une fois retirées les formes permises. */
export function heuresEnDur(chemin: string, texte: string): string[] {
  let code = codeSeul(texte);
  for (const e of LISTE_BLANCHE) {
    if (e.fichier !== "*" && e.fichier !== chemin) continue;
    for (const p of e.permis) {
      // Une forme permise s'efface en entier ; une heure seule, entre guillemets
      // ou dans du texte, seulement elle.
      code = code.split(p).join(" ");
    }
  }
  const lignes = code.split("\n");
  const trouvees: string[] = [];
  lignes.forEach((l, i) => {
    for (const m of l.matchAll(HEURE)) trouvees.push(`${chemin}:${i + 1} « ${m[0]} »`);
  });
  return trouvees;
}

describe("aucune heure d'accueil écrite en dur dans app/ ni src/", () => {
  const tous = [...fichiers(join(RACINE, "app")), ...fichiers(join(RACINE, "src"))]
    .map((f) => relative(RACINE, f).split("\\").join("/"));

  it("le dépôt est bien relu (garde-fou du garde-fou)", () => {
    expect(tous.length).toBeGreaterThan(200);
    expect(tous).toContain("src/lib/horaires.ts");
    expect(tous).toContain("src/lib/disponibilite-box.ts");
  });

  it("hors horaires.ts et la liste blanche, aucune « HH:MM »", () => {
    const fautes = tous
      .filter((f) => f !== "src/lib/horaires.ts")
      .flatMap((f) => heuresEnDur(f, readFileSync(join(RACINE, f), "utf8")));
    expect(
      fautes,
      "Une heure de la pension se lit dans le réglage (lireHoraires / HORAIRES_DEFAUT). "
      + "Si ce n'est vraiment pas un horaire d'accueil, ajoutez-la à LISTE_BLANCHE avec sa raison.",
    ).toEqual([]);
  });

  it("chaque exception de la liste blanche sert encore — sinon elle s'en va", () => {
    for (const e of LISTE_BLANCHE.filter((x) => x.fichier !== "*")) {
      const code = codeSeul(readFileSync(join(RACINE, e.fichier), "utf8"));
      for (const p of e.permis) expect(code, `${e.fichier} : « ${p} » n'y est plus`).toContain(p);
      expect(e.raison.length).toBeGreaterThan(30);
    }
  });

  it("le test attrape bien une heure remise en dur (mutation)", () => {
    const remise = 'export const CRENEAU_MATIN: [string, string] = ["09:00", "10:00"];';
    expect(heuresEnDur("src/lib/disponibilite-box.ts", remise)).toHaveLength(2);
    // Mais pas dans un commentaire.
    expect(heuresEnDur("src/lib/disponibilite-box.ts", "// entre 09:00 et 10:00")).toEqual([]);
    // Et une exception ne vaut que pour SON fichier.
    expect(heuresEnDur("src/lib/autre.ts", 'const borne = "09:30";')).toHaveLength(1);
  });
});

// ── 8. La vue publique ───────────────────────────────────────────────────

describe("la vue horaires_publics n'expose que les cinq clés de CLES_HORAIRES", () => {
  const migrations = join(RACINE, "supabase", "migrations");
  const fichier = readdirSync(migrations).find((f) => /_app64_horaires_publics\.sql$/.test(f));
  const sql = fichier ? readFileSync(join(migrations, fichier), "utf8") : "";
  const corps = sql.replace(/--[^\n]*/g, "");

  /** Les clés écrites dans le `where p.cle in (…)` de la vue. */
  function clesDeLaVue(texte: string): string[] {
    const bloc = /where\s+p\.cle\s+in\s*\(([\s\S]*?)\)/i.exec(texte)?.[1] ?? "";
    return [...bloc.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  }

  it("le fichier existe, sous la version enregistrée en base", () => {
    expect(fichier).toBe("20261003161303_app64_horaires_publics.sql");
  });

  it("les clés de la vue sont EXACTEMENT celles du code, ni plus ni moins", () => {
    expect(clesDeLaVue(corps).sort()).toEqual(Object.values(CLES_HORAIRES).sort());
  });

  it("une sixième clé ajoutée à la vue fait rougir (mutation)", () => {
    const mutee = corps.replace("'horaires_essai_depart'", "'horaires_essai_depart',\n     'frais_port_grille'");
    expect(clesDeLaVue(mutee).sort()).not.toEqual(Object.values(CLES_HORAIRES).sort());
  });

  it("deux colonnes seulement : cle et valeur", () => {
    expect(corps).toMatch(/as\s+select p\.cle, p\.valeur\s+from public\.parametres p/i);
    expect(corps).not.toMatch(/p\.description|p\.updated_at|p\.id\b|select \*/);
  });

  it("SECURITY DEFINER, comme fermetures_pension_publiques, et sans aucune fonction", () => {
    expect(corps).toContain("with (security_invoker = false)");
    const vue = corps.slice(corps.indexOf("create or replace view"), corps.indexOf("revoke"));
    // `in (` et `with (` sont des mots du SQL, pas des appels de fonction.
    expect(vue).not.toMatch(/\b(?!(?:in|with)\b)[a-z_]+\s*\(/i);
    expect(sql).toMatch(/TABLES/);
    expect(sql).toMatch(/rpc/);
  });

  it("lecture seule pour anon et authenticated, droits redits", () => {
    expect(corps).toContain("revoke all on public.horaires_publics from public, anon, authenticated;");
    expect(corps).toContain("grant select on public.horaires_publics to anon, authenticated;");
    expect(corps).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*horaires_publics/i);
  });

  it("parametres elle-même n'est ouverte à anon par aucune migration", () => {
    for (const f of readdirSync(migrations).filter((x) => x.endsWith(".sql"))) {
      const t = readFileSync(join(migrations, f), "utf8");
      expect(t, f).not.toMatch(/grant\s+[^;]*\bon\s+(table\s+)?(public\.)?parametres\b[^;]*\bto\s+[^;]*\banon\b/i);
    }
  });
});
