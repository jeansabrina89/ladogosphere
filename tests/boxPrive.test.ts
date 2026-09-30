import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  AIDE_BOX_REFACTURES,
  AIDE_NUMERO_BOX,
  REFUS_LOYER_MANQUANT,
  TITRE_BOX_PRIVE,
  TITRE_BOX_REFACTURES,
  estBoxPrive,
  estBoxRefacture,
  loyerDe,
  refusLoyerRefacture,
  repartirBox,
  sorteDeBox,
  sorteDemandee,
} from "@/src/lib/boxPriveLogique";

/**
 * APP 61 — clients box privé et box refacturés, séparés.
 *
 * ── DEUX RELATIONS QU'ON APPELAIT PAREIL ──────────────────────────────────
 *
 * Huit box du chenil se louent directement à la propriétaire. Sabrina ne
 * refacture aucun loyer à ces clients : elle leur vend des prestations. Ce sont
 * les CLIENTS BOX PRIVÉ. Un seul box, aujourd'hui, a son loyer refacturé : il y
 * a un montant mensuel, une période, un prorata — c'est un BOX REFACTURÉ.
 *
 * Les deux vivaient dans la même liste, sous le même mot, et l'un des deux
 * portait un champ « loyer » que l'autre n'aurait jamais dû voir. Un champ
 * qu'on ne devrait pas remplir finit par l'être.
 */

// ── La répartition ────────────────────────────────────────────────────────

describe("le montant est la distinction, sans colonne de plus", () => {
  it("sans loyer → client box privé", () => {
    expect(sorteDeBox({ loyer_refacture: null })).toBe("prive");
    expect(sorteDeBox({})).toBe("prive");
  });

  it("LOYER À 0 → client box privé, pas box refacturé", () => {
    /**
     * C'est la valeur qu'on trouve quand quelqu'un a effacé un montant. Une
     * location sans loyer n'est pas une location refacturée — et un box
     * refacturé à 0 franc n'aurait rien à facturer.
     */
    expect(sorteDeBox({ loyer_refacture: 0 })).toBe("prive");
    expect(sorteDeBox({ loyer_refacture: "0" })).toBe("prive");
    expect(sorteDeBox({ loyer_refacture: "0.00" })).toBe("prive");
  });

  it("loyer > 0 → box refacturé", () => {
    expect(sorteDeBox({ loyer_refacture: 450 })).toBe("refacture");
    expect(sorteDeBox({ loyer_refacture: "450.50" })).toBe("refacture");
    expect(sorteDeBox({ loyer_refacture: 0.05 })).toBe("refacture");
  });

  it("un loyer illisible ou négatif ne fait pas un box refacturé", () => {
    for (const mauvais of ["", "  ", "abc", -100, "-100"]) {
      expect(sorteDeBox({ loyer_refacture: mauvais as never }), String(mauvais)).toBe("prive");
      expect(loyerDe({ loyer_refacture: mauvais as never }), String(mauvais)).toBe(0);
    }
  });

  it("UNE FICHE NON COCHÉE N’EST NI L’UN NI L’AUTRE", () => {
    // `locataire_box` reste la porte : sans elle, pas de box du tout.
    expect(estBoxPrive({ locataire_box: false, loyer_refacture: null })).toBe(false);
    expect(estBoxRefacture({ locataire_box: false, loyer_refacture: 450 })).toBe(false);
    expect(estBoxPrive({ loyer_refacture: null })).toBe(false);
  });

  it("la répartition garde l’ordre reçu, et n’oublie personne", () => {
    const fiches = [
      { id: "a", locataire_box: true, loyer_refacture: null },
      { id: "b", locataire_box: true, loyer_refacture: 450 },
      { id: "c", locataire_box: true, loyer_refacture: 0 },
      { id: "d", locataire_box: false, loyer_refacture: 900 },
      { id: "e", locataire_box: true, loyer_refacture: "120.50" },
    ];
    const { prives, refactures } = repartirBox(fiches);
    expect(prives.map((f) => f.id)).toEqual(["a", "c"]);
    expect(refactures.map((f) => f.id)).toEqual(["b", "e"]);
    // « d » n'est pas coché : il n'apparaît nulle part.
    expect([...prives, ...refactures].map((f) => f.id)).not.toContain("d");
  });
});

// ── La saisie ─────────────────────────────────────────────────────────────

describe("un box refacturé exige son loyer", () => {
  it("un montant positif passe", () => {
    expect(refusLoyerRefacture("450")).toBeNull();
    expect(refusLoyerRefacture("450,50"), "la virgule suisse").toBeNull();
    expect(refusLoyerRefacture(0.05)).toBeNull();
  });

  it("VIDE OU ZÉRO : REFUSÉ, avec la phrase", () => {
    for (const mauvais of ["", "   ", "0", 0, "0.00", "-5", "abc", null, undefined]) {
      expect(refusLoyerRefacture(mauvais), String(mauvais)).toBe(REFUS_LOYER_MANQUANT);
    }
    expect(REFUS_LOYER_MANQUANT)
      .toBe("Indiquez le loyer mensuel refacturé : un box refacturé sans loyer n'en est pas un.");
  });

  it("LA SORTE ABSENTE VAUT « PRIVÉ » — celle qui n’écrit rien", () => {
    /**
     * Le repli sûr. Une requête forgée qui omet la sorte pour glisser un
     * montant n'obtient rien : mieux vaut un loyer non enregistré qu'un loyer
     * inventé.
     */
    expect(sorteDemandee(undefined)).toBe("prive");
    expect(sorteDemandee("")).toBe("prive");
    expect(sorteDemandee("n'importe quoi")).toBe("prive");
    expect(sorteDemandee("prive")).toBe("prive");
    expect(sorteDemandee("refacture")).toBe("refacture");
  });
});

// ── Le câblage ────────────────────────────────────────────────────────────

const lire = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
function sansCommentaires(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
const code = (...p: string[]) => sansCommentaires(lire(...p));

const ACTIONS = ["app", "(admin)", "(espace-prestations)", "prestations", "actions.ts"];
const FORM = ["app", "(admin)", "(espace-prestations)", "prestations", "locataires", "[id]", "FormLocation.tsx"];
const LISTE = ["app", "(admin)", "(espace-prestations)", "prestations", "locataires", "page.tsx"];
const AJOUT = ["app", "(admin)", "(espace-prestations)", "prestations", "locataires", "AjouterLocataire.tsx"];

describe("un client box privé n’a JAMAIS de loyer écrit", () => {
  it("l’action met le loyer à null quand la sorte est « privé »", () => {
    /**
     * Le champ est absent de l'écran, donc absent du formulaire. Mais un champ
     * absent de l'écran se rajoute dans une requête forgée : c'est l'ACTION qui
     * doit refuser d'écrire, pas le formulaire de ne pas l'envoyer.
     */
    const src = code(...ACTIONS);
    expect(src).toContain("const sorte = sorteDemandee(formData.get(\"sorte\"))");
    expect(src).toContain('loyer_refacture: sorte === "prive" ? null : Number(loyerBrut)');
  });

  it("et elle refuse un box refacturé sans loyer, AVANT d’écrire", () => {
    const src = code(...ACTIONS);
    const gardeAvant = src.indexOf("refusLoyerRefacture(formData.get(\"loyer_refacture\"))");
    const ecriture = src.indexOf(".update(champs)");
    expect(gardeAvant, "la garde existe").toBeGreaterThan(0);
    expect(gardeAvant).toBeLessThan(ecriture);
  });

  it("le formulaire ne RENVOIE le champ que pour un box refacturé", () => {
    const src = code(...FORM);
    expect(src).toContain("{refacture && (");
    expect(src).toContain('name="loyer_refacture"');
    // Le bloc du loyer est bien à l'intérieur de la condition.
    const debut = src.indexOf("{refacture && (");
    expect(src.slice(debut, debut + 500)).toContain('name="loyer_refacture"');
    // Et la sorte part avec le formulaire.
    expect(src).toContain('name="sorte"');
  });

  it("le cas rare passe par un lien explicite, pas par un champ ouvert", () => {
    const src = code(...FORM);
    expect(src).toContain("{LIEN_REFACTURER}");
    expect(src).toContain("onClick={() => setRefacture(true)}");
    expect(lire("src", "lib", "boxPriveLogique.ts")).toContain('"Refacturer le loyer de ce box"');
  });

  it("le numéro de box porte son aide", () => {
    expect(AIDE_NUMERO_BOX)
      .toBe("Le numéro du box au chenil (ex. Box 15). Ce box n'est pas un box de la pension.");
    expect(code(...FORM)).toContain("{AIDE_NUMERO_BOX}");
  });
});

describe("l’écran a deux sections et deux boutons", () => {
  it("les deux titres, et la phrase d’aide des box refacturés", () => {
    expect(TITRE_BOX_PRIVE).toBe("🏠 Clients box privé");
    expect(TITRE_BOX_REFACTURES).toBe("🧾 Box refacturés");
    expect(AIDE_BOX_REFACTURES)
      .toBe("Le loyer du box est refacturé chaque mois au client, en plus des prestations éventuelles.");

    const src = code(...LISTE);
    expect(src).toContain("{TITRE_BOX_PRIVE}");
    expect(src).toContain("{TITRE_BOX_REFACTURES}");
    expect(src).toContain("{AIDE_BOX_REFACTURES}");
  });

  it("la répartition vient de la fonction éprouvée, pas d’un filtre recopié", () => {
    const src = code(...LISTE);
    expect(src).toContain("repartirBox(locataires)");
    expect(src).not.toMatch(/filter\([^)]*loyer_refacture/);
  });

  it("les colonnes demandées sont là", () => {
    const src = code(...LISTE);
    // Box privé : chien(s), box, formule, depuis.
    expect(src).toContain("chiensDe.get(l.id)");
    expect(src).toContain("depuis le ${formatDateFR(l.locataire_depuis)}");
    // Box refacturés : loyer mensuel, depuis/jusqu'au, dernière facture.
    expect(src).toContain("CHF / mois");
    expect(src).toContain("dernière facture mensuelle");
    expect(src).toContain("derniereFactureMensuelleParClient");
  });

  it("DEUX BOUTONS, et le second porte la sorte", () => {
    const src = code(...LISTE);
    expect(src).toContain('<AjouterLocataire sorte="prive" />');
    expect(src).toContain('<AjouterLocataire sorte="refacture" />');

    const ajout = code(...AJOUT);
    expect(ajout).toContain('"+ Box refacturé"');
    expect(ajout).toContain('"+ Client box privé"');
    // La sorte voyage dans l'adresse jusqu'à la fiche.
    expect(ajout).toContain("?sorte=refacture");
  });

  it("la fiche relit la sorte, avec « privé » par défaut", () => {
    const src = code("app", "(admin)", "(espace-prestations)", "prestations", "locataires", "[id]", "page.tsx");
    expect(src).toContain("sorteDemandee((await searchParams)?.sorte)");
    expect(src).toContain("sorte={sorte}");
  });
});

// ── La facturation mensuelle ──────────────────────────────────────────────

describe("le loyer n’est facturé QUE pour un box refacturé", () => {
  it("la ligne de loyer est conditionnée au montant", () => {
    /**
     * Le point qui ne devait pas bouger. Un client box privé a
     * `loyer_refacture` null ou 0 : la proposition mensuelle ne porte alors
     * AUCUNE ligne de loyer. Ses prestations, elles, se facturent comme avant.
     */
    const src = code("src", "lib", "factureLocataire.ts");
    expect(src).toMatch(/loyer: client\.loyer_refacture && String\(client\.dernier_mois_loyer_facture \?\? ""\) !== mois/);
  });

  it("et un loyer à 0 ne produit pas de ligne non plus", () => {
    // 0 est faux en JavaScript : la condition le couvre déjà. On le dit, parce
    // qu'un lecteur pourrait croire qu'il faut un test de plus.
    expect(loyerDe({ loyer_refacture: 0 })).toBe(0);
    expect(sorteDeBox({ loyer_refacture: 0 })).toBe("prive");
  });
});

// ── Plus un « locataire » visible ─────────────────────────────────────────

describe("aucun texte visible ne dit plus « locataire »", () => {
  it("ni dans les écrans, ni dans les e-mails, ni dans les PDF", () => {
    /**
     * Le test parcourt `app` et `src` et ne regarde que ce qu'un humain LIT :
     * les chaînes de caractères et le texte JSX. Les commentaires, les noms de
     * colonnes, de routes, de fonctions et de permissions sont exclus — les
     * renommer risquerait la base pour un libellé.
     */
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

    /**
     * CE QUI COMPTE COMME TEXTE VISIBLE, et pourquoi la borne est là.
     *
     * Un identifiant porte un SOULIGNEMENT (locataire_box, locataire_depuis),
     * une route ou un import porte une BARRE ou une ARROBASE, un appel porte
     * des PARENTHÈSES. Aucun de ces trois n'est lu par un humain, et les
     * renommer risquerait la base pour un libellé.
     *
     * Un texte visible, lui, a des espaces et aucun de ces signes. La borne
     * est volontairement stricte : un test qui signale du code finit par être
     * désactivé, et c'est alors qu'un vrai libellé passe.
     */
    const INTERDITS = /[_(){}=;/@$\[\]<>]/;
    /** « id, locataire_box, box_loue » : une liste de colonnes, pas une phrase. */
    const LISTE_COLONNES = /^[a-z0-9_,\s]+$/;

    const estTexteVisible = (c: string) =>
      /locataire/i.test(c)
      && / /.test(c)
      && !INTERDITS.test(c)
      && !LISTE_COLONNES.test(c);

    /**
     * LE GARDE-FOU DU GARDE-FOU.
     *
     * Un détecteur trop strict ne signale plus rien, et sa liste vide se lit
     * comme une réussite. On lui donne donc d'abord ce qu'il DOIT attraper, et
     * ce qu'il doit laisser passer.
     */
    expect(estTexteVisible("Aucun locataire de box"), "une phrase visible").toBe(true);
    expect(estTexteVisible("🏠 Locataires de box"), "un titre visible").toBe(true);
    expect(estTexteVisible("id, locataire_box, box_loue"), "une liste de colonnes").toBe(false);
    expect(estTexteVisible("/prestations/locataires"), "une route").toBe(false);
    expect(estTexteVisible("locataire"), "un identifiant nu").toBe(false);
    expect(estTexteVisible("@/src/lib/factureLocataire"), "un import").toBe(false);

    const restants: string[] = [];
    for (const fichier of fichiers) {
      const src = sansCommentaires(readFileSync(fichier, "utf8"));
      src.split(/\r?\n/).forEach((ligne, i) => {
        const candidats = [
          ...[...ligne.matchAll(/"([^"]*)"/g)].map((m) => m[1]),
          ...[...ligne.matchAll(/'([^']*)'/g)].map((m) => m[1]),
          ...[...ligne.matchAll(/`([^`]*)`/g)].map((m) => m[1]),
          // Le texte JSX nu, entre deux balises sur la même ligne.
          ...[...ligne.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]),
        ];
        for (const c of candidats) {
          if (estTexteVisible(c)) {
            restants.push(`${fichier.slice(process.cwd().length + 1)}:${i + 1} → ${c.trim().slice(0, 80)}`);
          }
        }
      });
    }
    expect(restants, "textes visibles portant encore « locataire »").toEqual([]);
  });
});
