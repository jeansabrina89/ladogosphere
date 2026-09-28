import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  LIEN_CONFIDENTIALITE,
  LIEN_CONDITIONS_PENSION,
  LIEN_CONDITIONS_VENTE,
  LIEN_EXTERNE,
  COULEUR_LIEN_LEGAL,
} from "@/src/lib/liensLegaux";

/**
 * APP 36 — les mentions légales de l'application.
 *
 * Une mention de confidentialité ne se voit pas quand elle manque : personne
 * n'ouvre une page d'inscription en se demandant ce qui n'y est PAS écrit.
 * C'est exactement le genre de chose qui disparaît à la première refonte d'un
 * écran, et que l'on redécouvre le jour où quelqu'un la réclame.
 *
 * Ce fichier relit donc les sources.
 */

const ECRANS_AVEC_MENTION = [
  "app/(public)/inscription/InscriptionForm.tsx",
  "app/(public)/catalogue/[id]/AlerteStock.tsx",
  "app/(public)/catalogue/panier/Panier.tsx",
  "app/(client)/mon-compte/profil/page.tsx",
];

const lire = (relatif: string) => readFileSync(join(process.cwd(), relatif), "utf8");

describe("les écrans qui collectent des données renvoient à la politique", () => {
  it("les quatre la citent, et par le module", () => {
    for (const relatif of ECRANS_AVEC_MENTION) {
      const source = lire(relatif);
      expect(source, `${relatif} : import du module`).toMatch(
        /from\s+["']@\/src\/lib\/liensLegaux["']/,
      );
      expect(source, `${relatif} : utilise la constante`).toContain("LIEN_CONFIDENTIALITE");
    }
  });

  it("aucun n'écrit l'adresse à la main", () => {
    /**
     * Une URL recopiée survit au déménagement du site et devient un lien mort
     * — sur la page qu'on lit le moins, donc celle où on le verra le plus tard.
     */
    for (const relatif of ECRANS_AVEC_MENTION) {
      expect(lire(relatif), relatif).not.toContain("ladogosphere.ch");
    }
  });

  it("chaque lien sortant porte target ET rel", () => {
    /**
     * `target="_blank"` sans `rel` laisse la page ouverte accéder à celle qui
     * l'a ouverte. Les deux vont ensemble : on vérifie que la propagation du
     * jeu commun est là partout où l'UNE des constantes est employée — sinon
     * un lien ajouté plus tard, comme celui des conditions de vente, passerait
     * à côté du garde-fou.
     */
    for (const relatif of ECRANS_AVEC_MENTION) {
      const source = lire(relatif);
      const liens = [
        ...source.matchAll(/href=\{LIEN_(?:CONFIDENTIALITE|CONDITIONS_VENTE|CONDITIONS_PENSION)\}([\s\S]{0,120})/g),
      ];
      expect(liens.length, `${relatif} : au moins un lien`).toBeGreaterThan(0);
      for (const [, suite] of liens) {
        expect(suite, `${relatif} : {...LIEN_EXTERNE}`).toContain("LIEN_EXTERNE");
      }
    }
    expect(LIEN_EXTERNE.target).toBe("_blank");
    expect(LIEN_EXTERNE.rel).toBe("noopener noreferrer");
  });

  it("le panier cite AUSSI les conditions de vente (APP 37)", () => {
    /**
     * APP 36 n'avait posé que la moitié de la phrase : la page n'existait pas
     * encore. Elle existe depuis SITE 34, et la moitié manquante est la seule
     * qui engage la cliente sur autre chose que ses données.
     */
    const source = lire("app/(public)/catalogue/panier/Panier.tsx");
    expect(source).toContain("LIEN_CONDITIONS_VENTE");
    expect(source).toContain("MENTION_COMMANDE_AVANT");
    // Les deux liens, dans cet ordre : on accepte AVANT d'être informée.
    expect(source.indexOf("LIEN_CONDITIONS_VENTE")).toBeLessThan(
      source.lastIndexOf("LIEN_CONFIDENTIALITE"),
    );
  });

  it("les deux adresses pointent vers le SITE, pas vers l'application", () => {
    /**
     * `NEXT_PUBLIC_SITE_URL` désigne l'APPLICATION
     * (`reservation.ladogosphere.ch`). La confondre avec le site vitrine
     * produirait deux liens morts que rien ne signalerait.
     */
    expect(LIEN_CONFIDENTIALITE).toBe("https://ladogosphere.ch/confidentialite");
    expect(LIEN_CONDITIONS_PENSION).toBe("https://ladogosphere.ch/conditions-pension");
    expect(LIEN_CONDITIONS_VENTE).toBe("https://ladogosphere.ch/conditions-vente");
    for (const url of [LIEN_CONFIDENTIALITE, LIEN_CONDITIONS_PENSION, LIEN_CONDITIONS_VENTE]) {
      expect(url).not.toContain("reservation.");
    }
    /**
     * Vente et pension sont DEUX pages : garder un chien et vendre un sac de
     * croquettes n'obéissent pas aux mêmes règles. Les confondre ferait
     * accepter à une cliente des conditions qui ne régissent pas son achat.
     */
    expect(LIEN_CONDITIONS_VENTE).not.toBe(LIEN_CONDITIONS_PENSION);
  });
});

describe("la mention se lit vraiment", () => {
  /** Luminance relative WCAG d'une couleur « #rrggbb ». */
  function luminance(hex: string): number {
    const canal = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const r = canal(parseInt(hex.slice(1, 3), 16));
    const g = canal(parseInt(hex.slice(3, 5), 16));
    const b = canal(parseInt(hex.slice(5, 7), 16));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  const contraste = (a: string, b: string) => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  it("la couleur du lien tient les 4,5:1 d'un texte courant", () => {
    /**
     * Le vert le plus répandu de l'application, `#2E8B7E`, n'en donne que 4,1 :
     * il a été écarté pour cela. Une mention légale illisible ne vaut pas mieux
     * qu'une mention absente — et c'est le genre d'écart qu'on ne mesure jamais
     * à l'œil.
     */
    expect(contraste(COULEUR_LIEN_LEGAL, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    // Le fond crème des cartes du catalogue et du panier.
    expect(contraste(COULEUR_LIEN_LEGAL, "#FBF9F5")).toBeGreaterThanOrEqual(4.5);
    // Le fond sable de l'encadré « photos » de l'inscription.
    expect(contraste(COULEUR_LIEN_LEGAL, "#F5F0E8")).toBeGreaterThanOrEqual(4.5);
  });

  it("le repère chiffré : #2E8B7E ne passait pas, #1F6E5B passe", () => {
    // Si un jour ce test rougit, c'est la formule qui a bougé, pas la décision.
    expect(contraste("#2E8B7E", "#FFFFFF")).toBeLessThan(4.5);
    expect(COULEUR_LIEN_LEGAL).toBe("#1F6E5B");
  });
});

describe("rien n'a été ajouté aux écrans du personnel", () => {
  function fichiers(dossier: string, trouves: string[] = []): string[] {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) fichiers(chemin, trouves);
      else if (/\.(ts|tsx)$/.test(entree)) trouves.push(chemin);
    }
    return trouves;
  }

  it("aucun écran d'administration ne cite la politique", () => {
    /**
     * Ces pages sont vues par Sabrina et ses employées, pas par des clientes :
     * une mention de confidentialité y serait du bruit, et le bruit finit par
     * faire ignorer le reste.
     */
    const fautifs = fichiers(join(process.cwd(), "app", "(admin)"))
      .filter((f) => /liensLegaux|ladogosphere\.ch\/confidentialite/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(process.cwd().length + 1));
    expect(fautifs).toEqual([]);
  });
});
