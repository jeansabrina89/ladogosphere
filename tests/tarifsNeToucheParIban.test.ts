import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { AVERTISSEMENT_SANS_IBAN, NON_RENSEIGNE, ibanMasque } from "@/src/lib/ibanMasque";

/**
 * APP 63 — l'écran Tarifs n'efface plus l'IBAN.
 *
 * ── CE QUI EST ARRIVÉ ─────────────────────────────────────────────────────
 *
 * L'identité de paiement vit sur `entites_juridiques` depuis APP 18 : elle est
 * DATÉE, parce qu'une pièce émise garde l'identité de sa date. Mais sept clés
 * de `parametres` en gardaient une copie, et l'écran Tarifs les lisait pour les
 * renvoyer à l'entité en vigueur — à CHAQUE sauvegarde des prix.
 *
 * Le 29.09.2026 à 20:45 UTC, enregistrer un tarif a donc mis l'IBAN de l'entité
 * à null et changé sa raison sociale (`journal_evenements`, événement
 * « coordonnees »). Personne ne l'avait demandé, et rien ne l'a signalé : une
 * seconde source de vérité ne se trahit qu'en écrasant la première.
 *
 * ── CE QUE CE FICHIER GARDE ───────────────────────────────────────────────
 *
 * Que l'écran Tarifs ne PUISSE plus écrire l'identité. Pas qu'il ne le fasse
 * pas aujourd'hui : qu'il n'ait plus de chemin pour le faire.
 */

const lire = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const existe = (...p: string[]) => existsSync(join(process.cwd(), ...p));

/** Retire les commentaires : on éprouve le code, pas ce qu'on en dit. */
function sansCommentaires(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * Le CODE d'un fichier, sans ses commentaires.
 *
 * Les commentaires de ce lot citent forcément la route et l'IBAN : ils
 * racontent ce qui est arrivé, et cette trace a plus de valeur que le test. Un
 * test qui confond le code et ce qu'on en dit refuse la seule explication
 * écrite de la décision — c'est arrivé au lot précédent, et voilà le remède.
 */
const code = (...p: string[]) => sansCommentaires(lire(...p));

const GESTION = "app/(admin)/(espace-reglages)/tarifs/GestionTarifs.tsx";
const PAGE = "app/(admin)/(espace-reglages)/tarifs/page.tsx";

// ── L'écran n'écrit plus l'identité ───────────────────────────────────────

describe("sauvegarder les tarifs ne touche plus l’identité", () => {
  it("L’ÉCRAN N’APPELLE PLUS LA ROUTE DES COORDONNÉES", () => {
    const src = code(GESTION);
    expect(src).not.toContain("/api/entite/coordonnees");
    expect(src).not.toContain("entites_juridiques");
    // Une seule porte, celle des prix.
    expect(src).toContain('fetch("/api/tarifs"');
    expect((src.match(/await fetch\(/g) ?? []).length, "les appels de l'écran").toBeLessThanOrEqual(2);
  });

  it("et il ne porte plus aucun champ d’identité", () => {
    const src = code(GESTION);
    for (const champ of ["setIban", "setTitulaire", "setAdrRue", "setAdrNpa", "setAdrVille", "setAdrPays"]) {
      expect(src, champ).not.toContain(champ);
    }
    // Les validateurs qui servaient ces champs sont partis avec eux.
    expect(src).not.toContain("function ibanValide");
    expect(src).not.toContain("function estQrIban");
  });

  it("LA PAGE NE LIT PLUS LES ANCIENS RÉGLAGES", () => {
    /**
     * C'est la racine : tant que la page les lisait, un écran pouvait les
     * renvoyer. Elle ne demande plus que le montant d'adhésion.
     */
    const src = code(PAGE);
    expect(src).toContain('.in("cle", ["cotisation_montant"])');
    for (const cle of ['"iban"', '"titulaire"', "adresse_rue", "adresse_npa", "adresse_ville", "adresse_pays"]) {
      expect(src, cle).not.toContain(cle);
    }
  });

  it("elle lit l’entité en vigueur, en lecture seule", () => {
    const src = code(PAGE);
    expect(src).toContain("await entiteCourante()");
    expect(src).toContain("identite={{");
  });

  it("le montant d’adhésion passe toujours par /api/tarifs", () => {
    // Ce que le lot ne devait PAS casser.
    expect(code(GESTION)).toContain("JSON.stringify({ updates, cotisation })");
    expect(lire("app", "api", "tarifs", "route.ts")).toContain("cotisation");
  });

  it("et la route des tarifs ne connaît toujours pas l’entité", () => {
    const src = code("app", "api", "tarifs", "route.ts");
    expect(src).not.toContain("entites_juridiques");
    expect(src).not.toContain("iban");
  });
});

// ── La route supprimée ────────────────────────────────────────────────────

describe("la route des coordonnées est supprimée", () => {
  it("elle n’existe plus, et personne ne l’appelle", () => {
    /**
     * Elle n'avait qu'un appelant : l'écran Tarifs. Une route sans appelant est
     * une porte ouverte sur rien — et une porte de plus à garder.
     */
    expect(existe("app", "api", "entite", "coordonnees", "route.ts")).toBe(false);
    for (const f of [GESTION, PAGE]) {
      expect(code(f), f).not.toContain("entite/coordonnees");
    }
  });

  it("l’identité se règle par l’action de Réglages → Entreprise, sous garde admin", () => {
    const src = lire("app", "(admin)", "(espace-reglages)", "reglages", "entreprise", "actions.ts");
    expect(src).toContain("exigerAdminPage()");
    expect(src).toContain('from("entites_juridiques")');
    expect(src).toContain("tracerEvenement");
  });
});

// ── L'IBAN masqué ─────────────────────────────────────────────────────────

describe("l’encadré masque l’IBAN", () => {
  it("quatre premiers caractères, deux derniers, et rien entre", () => {
    expect(ibanMasque("CH9300762011623852957")).toBe("CH93 …………… 57");
    // Les espaces de saisie ne révèlent pas deux chiffres de plus.
    expect(ibanMasque("CH93 0076 2011 6238 5295 7")).toBe("CH93 …………… 57");
  });

  it("le milieu ne fuit jamais", () => {
    const masque = ibanMasque("CH9300762011623852957");
    expect(masque).not.toContain("0076");
    expect(masque).not.toContain("2011");
    expect(masque).not.toContain("623852");
  });

  it("vide : rien, pas « undefined »", () => {
    expect(ibanMasque("")).toBe("");
    expect(ibanMasque(null)).toBe("");
    expect(ibanMasque(undefined)).toBe("");
  });

  it("trop court pour être masqué utilement : on ne rend pas la valeur", () => {
    expect(ibanMasque("CH93")).toBe("…");
    expect(ibanMasque("CH93007")).toBe("…");
  });

  it("l’écran affiche le masque, jamais la valeur brute", () => {
    const src = code(GESTION);
    expect(src).toContain("ibanMasque(identite.iban)");
    expect(src).toContain("ibanMasque(identite.qrIban)");
    // Ni l'un ni l'autre n'est écrit en clair.
    expect(src).not.toMatch(/\{identite\.iban\}/);
    expect(src).not.toMatch(/\{identite\.qrIban\}/);
  });

  it("un champ jamais rempli se dit, il ne se devine pas", () => {
    expect(NON_RENSEIGNE).toBe("non renseigné");
    expect(code(GESTION)).toContain("|| NON_RENSEIGNE");
  });

  it("SANS AUCUN IBAN, l’écran avertit", () => {
    expect(AVERTISSEMENT_SANS_IBAN)
      .toBe("Aucun IBAN : les factures partiront sans bulletin de versement.");
    const src = code(GESTION);
    expect(src).toContain("{!identite.iban && !identite.qrIban && (");
    expect(src).toContain("{AVERTISSEMENT_SANS_IBAN}");
  });

  it("et il mène là où cela se règle", () => {
    const src = code(GESTION);
    expect(src).toContain('href="/reglages/entreprise"');
    expect(src).toContain("Modifier dans Réglages → Entreprise");
  });
});

// ── Réglages → Entreprise ─────────────────────────────────────────────────

describe("les deux comptes se distinguent enfin", () => {
  const form = () => lire("app", "(admin)", "(espace-reglages)", "reglages", "entreprise", "FormEntreprise.tsx");

  it("l’aide de l’IBAN et celle du QR-IBAN, mot pour mot", () => {
    expect(form()).toContain("Compte bancaire ordinaire (virements).");
    expect(form()).toContain("Seulement si votre banque vous a fourni un QR-IBAN (il commence par CH");
    expect(form()).toContain("chiffre est 3). Sinon, laissez vide : le bulletin QR");
    expect(form()).toContain("utilisera l&apos;IBAN.");
  });

  it("ENREGISTRER NE VIDE PAS UN CHAMP QU’ON N’A PAS TOUCHÉ", () => {
    /**
     * C'est la même famille de défaut que celui du lot : l'action lit des clés
     * de formulaire et met à null ce qui est vide. Si elle lisait une clé que le
     * formulaire ne rend PAS, chaque enregistrement l'effacerait — sans que
     * personne ne l'ait touchée.
     *
     * Le test compare donc les deux listes. Il ne vérifie pas que le geste
     * marche : il vérifie qu'aucun champ ne peut disparaître par omission.
     */
    const actions = lire("app", "(admin)", "(espace-reglages)", "reglages", "entreprise", "actions.ts");
    const debut = actions.indexOf("function champs(formData: FormData)");
    const bloc = actions.slice(debut, actions.indexOf("\n}", debut));
    const lues = [...bloc.matchAll(/lire\("([a-z_]+)"\)/g)].map((m) => m[1]);
    expect(lues.length, "des clés sont bien lues").toBeGreaterThan(5);

    const rendus = new Set([...form().matchAll(/name="([a-z_]+)"/g)].map((m) => m[1]));
    const absentes = lues.filter((c) => !rendus.has(c));
    expect(absentes, "clés lues mais absentes du formulaire").toEqual([]);
  });
});

// ── Les anciens réglages ──────────────────────────────────────────────────

describe("les anciennes clés de parametres ont disparu", () => {
  it("plus rien ne les lit dans app ni src", () => {
    /**
     * Le test le plus large du fichier : il parcourt `app` et `src`, pas un
     * fichier. On ne cherche pas le MOT « iban » — les fournisseurs ont le
     * leur, et le formulaire de l'entité a ses champs — mais une LECTURE de ces
     * clés dans `parametres`.
     */
    const ANCIENNES = [
      "iban", "titulaire", "adresse_rue", "adresse_numero",
      "adresse_npa", "adresse_ville", "adresse_pays",
    ];

    const fichiers: string[] = [];
    const parcourir = (dossier: string) => {
      for (const entree of readdirSync(dossier)) {
        if (entree === "node_modules" || entree.startsWith(".")) continue;
        const chemin = join(dossier, entree);
        if (statSync(chemin).isDirectory()) parcourir(chemin);
        else if (/\.tsx?$/.test(entree)) fichiers.push(chemin);
      }
    };
    parcourir(join(process.cwd(), "app"));
    parcourir(join(process.cwd(), "src"));
    expect(fichiers.length, "des fichiers sont bien parcourus").toBeGreaterThan(100);

    const suspects: string[] = [];
    for (const fichier of fichiers) {
      const src = sansCommentaires(readFileSync(fichier, "utf8"));
      const lectures = [...src.matchAll(/(?:in|eq)\(\s*"cle"\s*,([\s\S]{0,240}?)\)/g)].map((m) => m[1]);
      for (const bloc of lectures) {
        for (const cle of ANCIENNES) {
          if (bloc.includes(`"${cle}"`)) {
            suspects.push(`${fichier.slice(process.cwd().length + 1)} → ${cle}`);
          }
        }
      }
    }
    expect(suspects, "lectures restantes des anciennes clés dans parametres").toEqual([]);
  });

  it("la migration les supprime, et dit pourquoi", () => {
    const sql = lire("supabase", "migrations", "20260929233911_app63_reglages_identite_obsoletes.sql");
    expect(sql).toContain("delete from public.parametres");
    for (const cle of [
      "'iban'", "'titulaire'", "'adresse_rue'", "'adresse_numero'",
      "'adresse_npa'", "'adresse_ville'", "'adresse_pays'",
    ]) {
      expect(sql, cle).toContain(cle);
    }
    // La trace de ce qui est arrivé, pour qui relira.
    expect(sql).toContain("20:45 UTC");
  });
});
