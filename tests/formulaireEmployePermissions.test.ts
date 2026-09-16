import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import {
  DOMAINES,
  PERMISSIONS_PERSONNEL,
  permissionsDepuisFormulaire,
} from "@/src/lib/permissionsCatalogue";
import CasesPermissions from "@/app/(admin)/(espace-equipe)/employes/[id]/modifier/CasesPermissions";

/**
 * Le formulaire d'un employé et le catalogue disent exactement la même chose.
 *
 * Il tenait sa propre liste et en avait perdu deux : « Prestations locataires »
 * ne se donnait pas, et « Planning », que l'action écrivait pourtant, était
 * remise à zéro à chaque enregistrement sans que la case existe à l'écran.
 */

const RACINE = join(__dirname, "..");
const DOSSIER = join(RACINE, "app", "(admin)", "(espace-equipe)", "employes", "[id]", "modifier");
const lire = (fichier: string) => readFileSync(join(DOSSIER, fichier), "utf8");
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const CATALOGUE = [...PERMISSIONS_PERSONNEL].sort();

/** Les noms des cases à cocher du formulaire, tel qu'il se rend vraiment. */
function casesRendues(valeurs: Record<string, unknown> = {}): { nom: string; coche: boolean }[] {
  const html = renderToStaticMarkup(createElement(CasesPermissions, { valeurs }));
  return [...html.matchAll(/<input([^>]*)>/g)].map((m) => ({
    nom: /name="([^"]+)"/.exec(m[1])?.[1] ?? "",
    coche: /\bchecked=""/.test(m[1]),
  }));
}

describe("le formulaire propose exactement le catalogue", () => {
  it("une case par clé du catalogue, ni plus ni moins", () => {
    const noms = casesRendues().map((c) => c.nom);
    expect([...noms].sort()).toEqual(CATALOGUE);
    expect(new Set(noms).size).toBe(noms.length);
  });

  it("« Prestations locataires » est là, dans le groupe Pension, avec son aide", () => {
    const pension = DOMAINES.find((d) => d.nom === "Pension")!;
    const entree = pension.entrees.find((e) => e.cle === "perm_prestations");
    expect(entree?.court).toBe("Prestations locataires");
    expect(entree?.aide).toBe(
      "Voir et cocher les tâches du jour des locataires de box (repas, passages, nettoyages). Pas la facturation."
    );
    const html = renderToStaticMarkup(createElement(CasesPermissions, { valeurs: {} }));
    expect(html).toContain("Prestations locataires");
    expect(html).toContain("Pas la facturation.");
  });

  it("« Planning » a enfin sa case", () => {
    expect(casesRendues().map((c) => c.nom)).toContain("perm_planning");
  });

  it("les cases sont groupées par domaine, dans l’ordre du catalogue", () => {
    const html = renderToStaticMarkup(createElement(CasesPermissions, { valeurs: {} }));
    const positions = DOMAINES.map((d) => html.indexOf(`>${d.nom}</legend>`));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("une case est cochée si, et seulement si, la colonne est exactement vraie", () => {
    const cases = casesRendues({ perm_prestations: true, perm_planning: "oui", perm_box: false });
    const coche = (nom: string) => cases.find((c) => c.nom === nom)?.coche;
    expect(coche("perm_prestations")).toBe(true);
    expect(coche("perm_planning")).toBe(false);
    expect(coche("perm_box")).toBe(false);
  });

  it("les aides que le formulaire portait ont survécu au déménagement", () => {
    const aides = Object.fromEntries(DOMAINES.flatMap((d) => d.entrees.map((e) => [e.cle, e.aide ?? ""])));
    expect(aides.perm_encaissements).toContain("Le geste au comptoir");
    expect(aides.perm_factures).toContain("Distincte de l'encaissement, et volontairement rare.");
    expect(aides.perm_boutique_vente).toContain("La caisse, les retours");
    expect(aides.perm_boutique_gestion).toContain("Elle ouvre aussi la vente.");
    expect(aides.perm_atelier).toContain("Indépendante des permissions boutique.");
    expect(aides.perm_depenses).toContain("carnet de fournisseurs");
    expect(aides.perm_journee_essai).toContain("invalider");
  });
});

describe("l’action écrit toutes les clés du catalogue", () => {
  it("une case cochée vaut vrai, une case absente vaut faux, pour chaque clé", () => {
    const fd = new FormData();
    fd.set("perm_prestations", "on");
    fd.set("perm_planning", "on");
    const ecrit = permissionsDepuisFormulaire(fd);

    expect(Object.keys(ecrit).sort()).toEqual(CATALOGUE);
    expect(ecrit.perm_prestations).toBe(true);
    expect(ecrit.perm_planning).toBe(true);
    for (const cle of CATALOGUE.filter((c) => c !== "perm_prestations" && c !== "perm_planning")) {
      expect(ecrit[cle as keyof typeof ecrit], cle).toBe(false);
    }
  });

  it("le formulaire rendu et l’action couvrent les mêmes clés", () => {
    const fd = new FormData();
    for (const { nom } of casesRendues()) fd.set(nom, "on");
    const ecrit = permissionsDepuisFormulaire(fd);
    // Tout ce que l'écran propose revient à vrai : aucune case sans effet.
    expect(Object.values(ecrit).every(Boolean)).toBe(true);
  });
});

// ── Le dépôt : plus aucune seconde liste ───────────────────────────────────

describe("aucune liste de permissions écrite à la main dans le formulaire", () => {
  const page = sansCommentaires(lire("page.tsx"));
  const action = sansCommentaires(lire("actions.ts"));
  const cases = sansCommentaires(lire("CasesPermissions.tsx"));

  it("la page rend les cases du catalogue, et n’écrit aucune clé", () => {
    expect(page).toContain("<CasesPermissions valeurs={");
    expect(page.match(/perm_\w+/g) ?? []).toEqual([]);
  });

  it("l’action écrit par le catalogue, et n’écrit aucune clé", () => {
    expect(action).toContain("...permissionsDepuisFormulaire(formData)");
    expect(action.match(/perm_\w+/g) ?? []).toEqual([]);
  });

  it("le composant itère sur DOMAINES, sans clé en dur", () => {
    expect(cases).toContain("DOMAINES.map(");
    expect(cases.match(/perm_\w+/g) ?? []).toEqual([]);
  });

  it("chaque clé du catalogue passe par le formulaire ET par l’action", () => {
    // Si l'un des deux cessait de dériver du catalogue, une clé tomberait ici.
    const rendues = new Set(casesRendues().map((c) => c.nom));
    const ecrites = new Set(Object.keys(permissionsDepuisFormulaire(new FormData())));
    const oubliees = CATALOGUE.filter((c) => !rendues.has(c) || !ecrites.has(c));
    expect(oubliees).toEqual([]);
  });
});
