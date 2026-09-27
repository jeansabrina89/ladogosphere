// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "./setup/attenteJsdom";
import Configurateur, {
  type ArticleConfigurable,
} from "@/app/components/Configurateur";
import type { OptionGroupe, OptionValeur } from "@/src/lib/personnalisationLogique";

/**
 * Le configurateur, des DEUX côtés, à l'exécution.
 *
 * `tests/prixClientBoutique.test.ts` lit la source et garde le branchement.
 * Ce fichier-ci rend le composant et lit ce qui s'affiche : c'est la seule
 * preuve qui vaille pour un composant partagé, parce que les dix montants du
 * configurateur descendent par un CONTEXTE. Un contexte oublié ne casse aucune
 * signature — TypeScript est content, le comptoir garde son format, et la
 * cliente voit « 5.00 CHF » au milieu d'une page en « 35.– ». Rien ne le
 * signalerait sans ce test.
 *
 * La fiche article passe `pourClient` ; la caisse ne le passe pas, et c'est le
 * défaut : une pièce de travail ne change pas de format parce qu'un écran
 * voisin a changé.
 */

afterEach(() => cleanup());

const ARTICLE: ArticleConfigurable = {
  id: "art-1",
  nom: "Collier sur mesure",
  description: null,
  prix_vente: 1240,
  delai_fabrication_jours: 5,
  photo_path: null,
};

function valeur(p: Partial<OptionValeur> & { id: string; libelle: string }): OptionValeur {
  return {
    image_path: null,
    code_couleur: null,
    supplement_prix: 0,
    supplement_delai_jours: 0,
    composant_article_id: null,
    composant_quantite: null,
    actif: true,
    ordre: 1,
    defaut: false,
    ...p,
  };
}

/** Un seul groupe, une seule valeur retenue d'office, avec un supplément. */
const GROUPES: (OptionGroupe & { valeurs: OptionValeur[] })[] = [
  {
    id: "g-1",
    nom: "Boucle",
    type: "choix",
    obligatoire: true,
    ordre: 1,
    aide: null,
    max_caracteres: null,
    valeurs: [
      valeur({ id: "v-1", libelle: "Laiton", defaut: true, supplement_prix: 10.5 }),
    ],
  } as OptionGroupe & { valeurs: OptionValeur[] },
];

/** Tous les montants lisibles à l'écran, dans l'ordre d'apparition. */
function montantsAffiches(): string[] {
  const texte = document.body.textContent ?? "";
  return [...texte.matchAll(/[−-]?[\d'’]+\.(?:–|\d\d)(?:\s*CHF)?/g)].map((m) => m[0]);
}

describe("la fiche article : le format de la vitrine", () => {
  it("écrit le tiret, l'apostrophe des milliers, et JAMAIS « CHF »", () => {
    render(<Configurateur article={ARTICLE} groupes={GROUPES} pourClient />);

    const montants = montantsAffiches();
    // 1240 est rond : le tiret. 10.50 a des centimes : deux décimales.
    // 1250.50 est le total, avec l'apostrophe des milliers.
    expect(montants).toContain("1'240.–");
    expect(montants).toContain("10.50");
    expect(montants).toContain("1'250.50");
    expect(document.body.textContent).not.toContain("CHF");
  });

  it("ne dit pas « TTC » : le panier le dit une fois pour tout le parcours", () => {
    render(<Configurateur article={ARTICLE} groupes={GROUPES} pourClient />);
    expect(document.body.textContent).not.toContain("TTC");
    // Le total reste nommé — c'est son libellé qui change, pas sa présence.
    expect(screen.getAllByText("Prix").length).toBeGreaterThan(0);
  });
});

describe("le comptoir : rien n'a changé", () => {
  it("garde ses deux décimales et son « CHF »", () => {
    // Aucun `pourClient` : exactement l'appel de la caisse.
    render(<Configurateur article={ARTICLE} groupes={GROUPES} />);

    const texte = document.body.textContent ?? "";
    expect(texte).toContain("1240.00 CHF");
    expect(texte).toContain("1250.50 CHF");
    // Le tiret de vitrine n'apparaît nulle part sur un poste de travail.
    expect(texte).not.toContain(".–");
  });

  it("garde la mention « Prix TTC » : c'est là qu'on encaisse", () => {
    render(<Configurateur article={ARTICLE} groupes={GROUPES} />);
    expect(screen.getAllByText("Prix TTC").length).toBeGreaterThan(0);
  });
});
