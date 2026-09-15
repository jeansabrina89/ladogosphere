import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  BANDEAU_PERSONNEL,
  LIEN_ESPACE_PENSION,
  RETOUR_PENSION,
  RETOUR_PENSION_BANDEAU,
  RETOUR_PENSION_COURT,
} from "@/src/lib/personnel";

/**
 * Le retour vers l'espace pension, depuis l'espace client.
 *
 * Quelqu'un du personnel qui allait voir ses propres chiens n'avait qu'une
 * sortie : se déconnecter. Deux chemins existent désormais, et un client
 * ordinaire n'en voit aucun.
 */

const RACINE = join(__dirname, "..");
const lire = (...m: string[]) => readFileSync(join(RACINE, ...m), "utf8");

const BARRE = lire("app", "components", "NavBarClient.tsx");
const LAYOUT = lire("app", "(client)", "layout.tsx");

describe("le libellé du retour", () => {
  it("mène à l’écran Aujourd’hui, à la racine", () => {
    expect(LIEN_ESPACE_PENSION).toBe("/");
  });

  it("existe en long, en court et en phrase", () => {
    expect(RETOUR_PENSION).toBe("← Espace pension");
    expect(RETOUR_PENSION_COURT).toBe("← Pension");
    expect(RETOUR_PENSION_BANDEAU).toBe("Revenir à l'espace pension");
  });

  it("est écrit une seule fois : les surfaces lisent la constante", () => {
    expect(BARRE).not.toContain("Espace pension\"");
    expect(LAYOUT).not.toContain("Revenir à l'espace pension");
    expect(BARRE).toContain("RETOUR_PENSION");
    expect(LAYOUT).toContain("RETOUR_PENSION_BANDEAU");
  });
});

describe("le personnel voit le bouton", () => {
  it("la barre le rend sous condition, avec le bon href", () => {
    expect(BARRE).toContain("{personnel && (");
    expect(BARRE).toContain("href={LIEN_ESPACE_PENSION}");
  });

  it("il garde la hauteur de 44 px et reste clair sur texte marine", () => {
    // « Déconnexion » doit rester le seul bouton sombre de la barre.
    const bloc = BARRE.slice(BARRE.indexOf("{personnel && ("), BARRE.indexOf("onClick={handleLogout}"));
    expect(bloc).toContain("minHeight: 44");
    expect(bloc).toContain('backgroundColor: "#EDE8DF"');
    expect(bloc).toContain('color: "#1B2B5E"');
    expect(bloc).not.toContain('backgroundColor: "#1B2B5E"');
  });

  it("le libellé se raccourcit quand la ligne du haut se resserre", () => {
    expect(BARRE).toContain("{RETOUR_PENSION}");
    expect(BARRE).toContain("{RETOUR_PENSION_COURT}");
    expect(BARRE).toMatch(/min-\[576px\]:inline/);
    expect(BARRE).toMatch(/min-\[576px\]:hidden/);
  });
});

describe("un client ordinaire ne voit rien de nouveau", () => {
  it("le bouton est derrière `personnel`, et rien d’autre", () => {
    // Un seul rendu conditionnel du lien vers la racine, et il dépend de
    // `personnel` : pas de `interne`, pas de `locataire`.
    const occurrences = BARRE.match(/href=\{LIEN_ESPACE_PENSION\}/g) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(BARRE).not.toContain("{interne && (");
    expect(BARRE).not.toContain("{locataire && (");
  });

  it("le mot-marque ne disparaît que pour le personnel", () => {
    // Sans la condition, un client verrait sa barre changer sans raison.
    expect(BARRE).toContain('personnel ? "hidden min-[520px]:inline" : ""');
  });

  it("le bandeau et son lien restent liés à la fiche interne", () => {
    const bandeau = LAYOUT.slice(LAYOUT.indexOf("{ficheInterne && ("));
    expect(bandeau).toContain("RETOUR_PENSION_BANDEAU");
    expect(bandeau).toContain("href={LIEN_ESPACE_PENSION}");
    expect(BANDEAU_PERSONNEL).toBe("Profil du personnel : gratuit, validé automatiquement.");
  });
});

describe("la décision « est-ce du personnel ? » se prend une seule fois", () => {
  it("le layout la calcule et la transmet", () => {
    expect(LAYOUT).toContain("personnel = estPersonnel");
    expect(LAYOUT).toContain("personnel={personnel}");
    // La branche sans fiche la transmet aussi : c'est là qu'on en a le plus
    // besoin, l'écran n'offrant rien d'autre.
    expect(LAYOUT).toContain("<NavBarClient personnel />");
  });

  it("la barre ne relit pas `profiles`", () => {
    // Sur le CODE seul : les commentaires ont le droit de nommer la table
    // qu'on a justement cessé de lire.
    const code = BARRE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("profiles");
    expect(code).not.toContain("supabaseAdmin");
    expect(code).not.toMatch(/\brole\b/);
    // `personnel` n'arrive que par les props.
    expect(code).toMatch(/personnel = false,/);
  });
});
