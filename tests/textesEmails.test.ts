import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { MODELE_RETOUR_EN_STOCK } from "@/src/lib/alertesStockLogique";

/**
 * Ce que le client lit : les objets et les mots.
 *
 * Un objet qui s'ouvre sur un émoji passe pour une publicité, et se fait
 * classer comme telle. Et la maison ne parle pas de « cotisation » mais
 * d'« adhésion » : deux mots pour une même chose, c'est un mot de trop.
 *
 * `DEFAUTS_MODELES` est importé du module lui-même, qui charge Resend et le
 * client d'administration : on relit donc le fichier plutôt que de l'importer,
 * comme pour les autres relectures du dépôt.
 */

const RACINE = join(__dirname, "..");
const SOURCE = readFileSync(join(RACINE, "src", "lib", "email.ts"), "utf8");

/** Les objets écrits dans `DEFAUTS_MODELES`, lus dans le fichier. */
function objetsParDefaut(): string[] {
  const debut = SOURCE.indexOf("export const DEFAUTS_MODELES");
  const fin = SOURCE.indexOf("\n};", debut);
  expect(debut, "DEFAUTS_MODELES introuvable").toBeGreaterThan(-1);
  expect(fin, "fin de DEFAUTS_MODELES introuvable").toBeGreaterThan(debut);
  const bloc = SOURCE.slice(debut, fin);
  return [...bloc.matchAll(/^\s*sujet: "(.*)",\s*$/gm)].map((m) => m[1]);
}

/**
 * Le premier caractère que le lecteur voit vraiment. Une variable en tête
 * (`{article} est de nouveau disponible`) devient le mot qu'elle remplacera.
 */
function premierCaractereVisible(sujet: string): string {
  return sujet.replace(/\{\w+\}/g, "Article").trimStart()[0] ?? "";
}

describe("aucun objet d’e-mail ne commence par un émoji", () => {
  const objets = [...objetsParDefaut(), MODELE_RETOUR_EN_STOCK.sujet];

  it("le fichier est bien relu (garde-fou du garde-fou)", () => {
    // Quinze modèles plus le retour en stock : si la relecture casse, le test
    // ne prouverait plus rien sans le dire.
    expect(objetsParDefaut().length).toBeGreaterThanOrEqual(15);
    expect(objets.every((s) => s.trim().length > 0)).toBe(true);
  });

  it("chacun commence par une lettre, un chiffre ou un guillemet", () => {
    const fautifs = objets.filter((s) => !/[\p{L}\p{N}«"']/u.test(premierCaractereVisible(s)));
    expect(fautifs).toEqual([]);
  });

  it("le test attrape bien un émoji de tête", () => {
    // Sans cette vérification, une expression trop permissive rendrait le test
    // précédent muet, et personne ne s'en apercevrait.
    expect(/[\p{L}\p{N}«"']/u.test(premierCaractereVisible("🐾 Votre demande"))).toBe(false);
    expect(/[\p{L}\p{N}«"']/u.test(premierCaractereVisible("⭐ Renouvellement"))).toBe(false);
    expect(/[\p{L}\p{N}«"']/u.test(premierCaractereVisible("{article} est là"))).toBe(true);
  });

  it("les émojis des titres et des corps ne sont pas visés", () => {
    // On ne retire que ceux des objets : le reste fait partie du ton maison.
    expect(SOURCE).toContain('titre: "Merci {prenom} ! 🛍️"');
    expect(SOURCE).toContain('message_final: "Bonne réception ! 🐾"');
  });
});

describe("la maison dit « adhésion », jamais « cotisation »", () => {
  /**
   * Identifiants où le mot est un nom de code et non un texte lu : clé de
   * paramètre, type de modèle, constante, type TypeScript, nom de fonction et
   * module importé. Liste explicite : tout le reste est du texte visible.
   */
  const IDENTIFIANTS = [
    "cotisation_montant",
    "rappel_cotisation",
    "VARIANTES_RAPPEL_COTISATION",
    "VarianteRappelCotisation",
    "envoyerEmailRappelCotisation",
    "cotisationPeriode",
  ];

  it("la liste d’exclusions sert vraiment (garde-fou du garde-fou)", () => {
    for (const id of IDENTIFIANTS) {
      expect(SOURCE, id).toContain(id);
    }
  });

  it("le mot n’apparaît dans aucun texte lu par le client", () => {
    const code = SOURCE
      // Les commentaires expliquent, ils ne s'envoient pas.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const restant = IDENTIFIANTS.reduce(
      (texte, id) => texte.split(id).join(""),
      code
    );

    const occurrences = [...restant.matchAll(/.{0,60}cotisation.{0,60}/gi)].map((m) => m[0]);
    expect(occurrences).toEqual([]);
  });

  it("les deux textes d’essai parlent bien d’adhésion", () => {
    expect(SOURCE).toContain("L'adhésion annuelle de <strong>CHF ${montant.toFixed(2)}</strong>");
    expect(SOURCE).toContain("L'adhésion n'est pas due tant que la journée d'essai n'est pas concluante.");
  });
});

describe("les deux e-mails de la journée d’essai sont transactionnels", () => {
  it("le suivi ne sollicite plus rien et ne porte aucun lien", () => {
    const debut = SOURCE.indexOf("export async function envoyerEmailSatisfactionEssai");
    const corps = SOURCE.slice(debut, SOURCE.indexOf("\n}", SOURCE.indexOf("emailTemplate(", debut)));
    expect(corps).not.toContain("Votre avis nous tient à cœur");
    expect(corps).not.toContain("#E8F5F4");
    expect(corps).not.toContain("<a href");
    expect(corps).toContain("répondez simplement à cet e-mail ou appelez-nous");
  });

  it("son objet, son titre et sa clôture sont ceux voulus", () => {
    expect(SOURCE).toContain('sujet: "Journée d\'essai de {nom_chien}"');
    expect(SOURCE).toContain("{nom_chien} a passé sa journée d'essai chez nous aujourd'hui.");
    expect(SOURCE).toContain('message_final: "À bientôt,"');
  });

  it("le résultat accepté propose un lien discret, plus un gros bouton", () => {
    const debut = SOURCE.indexOf("const appel = resultat === \"valide\"");
    const bloc = SOURCE.slice(debut, SOURCE.indexOf("</table>`;", debut));
    // Le lien prend la couleur des liens du pied de page.
    expect(bloc).toContain('style="color:#4AAEA0; text-decoration:none;">Ouvrir mon espace client');
    // La seconde journée demande un geste : elle garde son bouton.
    expect(bloc).toContain("Réserver la seconde journée");
    expect(SOURCE).not.toContain("libelleBouton");
  });

  it("les deux titres se contentent d’un bonjour", () => {
    const modeles = SOURCE.slice(
      SOURCE.indexOf("satisfaction_essai: {"),
      SOURCE.indexOf("essai_seconde_journee: {")
    );
    expect(modeles).not.toMatch(/titre: "Bonjour \{prenom\} !/);
    expect([...modeles.matchAll(/titre: "Bonjour \{prenom\},"/g)]).toHaveLength(2);
  });
});
