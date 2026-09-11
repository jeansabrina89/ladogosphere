import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  TYPES_SEJOUR,
  champsTypeSejour,
  urgenceDerivee,
} from "@/src/lib/typeSejour";

/**
 * Une seule notion d'urgence.
 *
 * `reservations.urgence` n'est plus un réglage : c'est une colonne DÉRIVÉE de
 * `type_sejour`, maintenue par le code qui écrit la réservation. Deux sources
 * pour un même fait finissent toujours par se contredire, et ici la
 * contradiction se paie sur une facture.
 *
 * Ce fichier tient l'invariant par les deux bouts : la fonction qui le pose, et
 * une relecture du dépôt qui refuse tout chemin d'écriture qui l'esquiverait.
 */

// ── Le calcul lui-même ────────────────────────────────────────────────────

describe("la case dérive du type", () => {
  it("seul « urgence » la lève", () => {
    expect(urgenceDerivee("urgence")).toBe(true);
    expect(urgenceDerivee("pension")).toBe(false);
    expect(urgenceDerivee("personnel")).toBe(false);
    expect(urgenceDerivee("abandon")).toBe(false);
  });

  it("un type absent ou illisible retombe sur la pension, donc sans urgence", () => {
    expect(urgenceDerivee(null)).toBe(false);
    expect(urgenceDerivee(undefined)).toBe(false);
    expect(urgenceDerivee("")).toBe(false);
    expect(urgenceDerivee("URGENCE")).toBe(false);
    expect(urgenceDerivee("tres urgent")).toBe(false);
  });

  it("les deux colonnes se posent ensemble et s’accordent, pour les quatre types", () => {
    for (const t of TYPES_SEJOUR) {
      const champs = champsTypeSejour(t.valeur);
      expect(champs.type_sejour).toBe(t.valeur);
      expect(champs.urgence).toBe(champs.type_sejour === "urgence");
    }
  });

  it("elles s’accordent aussi sur une valeur inventée", () => {
    expect(champsTypeSejour("catastrophe")).toEqual({
      type_sejour: "pension",
      urgence: false,
    });
  });

  it("l’urgence se lit dans le tarif, pas dans le nom du type", () => {
    // Si un autre type venait à porter le tarif d'urgence, il la lèverait
    // aussi — et il n'y aurait toujours qu'un seul endroit à changer.
    const parLeTarif = TYPES_SEJOUR.filter((t) => t.facturation.tarif === "urgence");
    expect(parLeTarif.map((t) => t.valeur)).toEqual(["urgence"]);
    for (const t of TYPES_SEJOUR) {
      expect(urgenceDerivee(t.valeur)).toBe(t.facturation.tarif === "urgence");
    }
  });
});

// ── Le dépôt : aucun chemin d'écriture ne peut diverger ───────────────────

const RACINE = join(__dirname, "..");
const SEUL_AUTORISE = "src/lib/typeSejour.ts";

function fichiers(dossier: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier)) {
    if (entree === "node_modules" || entree === ".next") continue;
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiers(chemin));
    else if (/[.]tsx?$/.test(entree)) trouves.push(chemin);
  }
  return trouves;
}

const SOURCES = ["app", "src"]
  .flatMap((d) => fichiers(join(RACINE, d)))
  .map((chemin) => ({
    chemin: chemin.slice(RACINE.length + 1).split("\\").join("/"),
    contenu: readFileSync(chemin, "utf8"),
  }));

/**
 * Le contenu de chaque `.insert(…)`, `.update(…)` et `.upsert(…)`, parenthèses
 * équilibrées. Grossier mais déterministe : on ne lit ici que le dépôt.
 */
function corpsEcritures(contenu: string): string[] {
  const corps: string[] = [];
  const debut = /[.](?:insert|update|upsert)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = debut.exec(contenu)) !== null) {
    const ouvre = m.index + m[0].length;
    let i = ouvre;
    let profondeur = 1;
    while (i < contenu.length && profondeur > 0) {
      const c = contenu[i];
      if (c === "(") profondeur += 1;
      else if (c === ")") profondeur -= 1;
      i += 1;
    }
    corps.push(resoudre(contenu, contenu.slice(ouvre, i - 1)));
  }
  return corps;
}

/**
 * Une écriture peut recevoir une variable plutôt qu'un objet littéral — c'est
 * le cas de la demande d'un client, dont les lignes sont bâties plus haut. On
 * remonte alors à sa déclaration, sans quoi ce chemin échapperait au garde-fou
 * pour la seule raison qu'il est écrit autrement.
 */
function resoudre(contenu: string, corps: string): string {
  const nom = corps.trim();
  if (!/^[A-Za-z_$][\w$]*$/.test(nom)) return corps;
  const decl = new RegExp(`\\b(?:const|let|var)\\s+${nom}\\s*(?::[^=]*)?=`).exec(contenu);
  if (!decl) return corps;
  const debut = decl.index + decl[0].length;
  let i = debut;
  let profondeur = 0;
  while (i < contenu.length) {
    const c = contenu[i];
    if (c === "(" || c === "[" || c === "{") profondeur += 1;
    else if (c === ")" || c === "]" || c === "}") profondeur -= 1;
    else if (c === ";" && profondeur <= 0) break;
    i += 1;
  }
  return contenu.slice(debut, i);
}

/** `urgence:` en propriété — jamais `est_urgence:` ni `perm_tarifs_urgence:`. */
const PROPRIETE_URGENCE = /(?:^|[\s{,(])urgence\s*:/m;
/** Une variable nommée `urgence`, qui rouvrirait la porte par la forme abrégée. */
const VARIABLE_URGENCE = /\b(?:const|let|var)\s+urgence\b/;
/** La case du formulaire, sous ses deux formes. */
const CHAMP_FORMULAIRE = /name="urgence"|[.]get\(\s*["']urgence["']\s*\)/;

describe("aucun chemin d’écriture ne pose « urgence » à la main", () => {
  it("le dépôt est bien relu (garde-fou du garde-fou)", () => {
    expect(SOURCES.length).toBeGreaterThan(200);
    expect(SOURCES.some((f) => f.chemin === SEUL_AUTORISE)).toBe(true);
    expect(SOURCES.some((f) => corpsEcritures(f.contenu).length > 0)).toBe(true);
  });

  it("seul champsTypeSejour pose la colonne dérivée", () => {
    const coupables = SOURCES.filter(
      (f) =>
        f.chemin !== SEUL_AUTORISE &&
        (PROPRIETE_URGENCE.test(f.contenu) || VARIABLE_URGENCE.test(f.contenu))
    ).map((f) => f.chemin);
    expect(coupables).toEqual([]);
  });

  it("plus aucun formulaire ne soumet la case", () => {
    const coupables = SOURCES.filter((f) => CHAMP_FORMULAIRE.test(f.contenu))
      .map((f) => f.chemin);
    expect(coupables).toEqual([]);
  });

  it("toute écriture qui pose un type de séjour pose la case avec", () => {
    // C'est le test du brief : quel que soit le chemin — admin, employée,
    // client, fiche interne, requalification — les deux colonnes partent
    // ensemble ou ne partent pas.
    const coupables: string[] = [];
    for (const f of SOURCES) {
      if (f.chemin === SEUL_AUTORISE) continue;
      for (const corps of corpsEcritures(f.contenu)) {
        const touche = /\btype_sejour\b/.test(corps) || /\burgence\b/.test(corps);
        if (touche && !corps.includes("champsTypeSejour(")) coupables.push(f.chemin);
      }
    }
    expect(coupables).toEqual([]);
  });

  it("les sept chemins qui créent ou modifient une réservation la posent", () => {
    // L'inverse du précédent : si plus aucune écriture ne passait par
    // champsTypeSejour, le garde-fou ci-dessus serait vide de sens. La liste
    // est explicite — un huitième chemin doit venir s'y déclarer, et c'est
    // exactement le moment où quelqu'un doit y regarder à deux fois.
    const posent = SOURCES.filter((f) => f.contenu.includes("champsTypeSejour("))
      .map((f) => f.chemin)
      .sort();
    expect(posent).toEqual([
      "app/(admin)/(espace-clients)/reservations/[id]/modifier/actions.ts",
      "app/(admin)/(espace-clients)/reservations/nouvelle/actions.ts",
      "app/(client)/mon-compte/reservations/actions.ts",
      "app/api/reservations/[id]/modifier/route.ts",
      "app/api/reservations/client/route.ts",
      "app/api/reservations/route.ts",
      "src/lib/reservationPersonnel.ts",
      "src/lib/typeSejour.ts",
    ]);
  });

  it("le tarif ne se décide plus que sur le type", () => {
    const coupables = SOURCES.filter((f) =>
      /est_urgence\s*:\s*[^,\n]*\burgence\b(?!Derivee)/.test(f.contenu)
    ).map((f) => f.chemin);
    expect(coupables).toEqual([]);
  });
});
