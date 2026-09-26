// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "./setup/attenteJsdom";

/**
 * L'écran « À commander chez les fournisseurs ».
 *
 * Ce qu'il garde tient en une phrase : la quantité affichée est celle de la
 * LIGNE ENTIÈRE, jamais le manque.
 *
 * C'est la condition du risque accepté le 26.09.2026. Une ligne sur commande ne
 * réserve rien, donc l'unité déjà en rayon peut partir au comptoir avant la
 * réception — sans conséquence tant que la commande au fournisseur couvre toute
 * la ligne. Un écran qui afficherait « il en manque 2 » ferait commander 2 sacs,
 * et c'est alors que la vente au comptoir coûterait cher : la cliente qui attend
 * depuis trois semaines repartirait avec deux sacs sur trois.
 *
 * Le risque est accepté À CETTE CONDITION. Ce fichier est ce qui la tient.
 */

vi.mock("@/app/(admin)/boutique/a-commander/actions", () => ({
  marquerCommande: async () => ({ message: "fait" }),
}));

const GroupeACommander =
  (await import("@/app/(admin)/boutique/a-commander/GroupeACommander")).default;

afterEach(cleanup);

/** Trois sacs commandés, UN déjà en rayon. Le cas du stock partiel. */
const LIGNE = {
  ligneId: "l-1",
  commandeId: "c-1",
  numero: "WEB-2026-0007",
  confirmeeLe: "2026-09-05T10:00:00Z",
  confirmeeLeTexte: "05.09.2026",
  articleId: "a-1",
  articleNom: "Croquettes agneau 12 kg",
  reference: "ART-0001",
  unite: "sac",
  quantite: 3,
  delaiMinJours: 5,
  delaiMaxJours: 8,
  stockActuel: 1,
};

const GROUPE = {
  fournisseurId: "f-1",
  fournisseurNom: "Bozita",
  lignes: [LIGNE],
};

describe("la quantité affichée est celle de la ligne entière", () => {
  it("montre 3, et jamais 2 — le manque n'est pas ce qu'on commande", () => {
    render(<GroupeACommander groupe={GROUPE} />);
    // Trois commandés, un en rayon : le manque serait 2. On commande 3.
    expect(screen.getByText("3 sac")).toBeTruthy();
    expect(screen.queryByText("2 sac"), "le manque ne doit apparaître nulle part").toBeNull();
  });

  it("le stock en rayon est montré à part, pour information", () => {
    // Le montrer aide à décider ; le soustraire ferait commander trop peu.
    render(<GroupeACommander groupe={GROUPE} />);
    const enRayon = screen.getByText("En rayon").closest("table");
    expect(enRayon?.textContent).toContain("1");
  });

  it("le récapitulatif totalise les lignes, sans rien retrancher", () => {
    const deux = {
      ...GROUPE,
      lignes: [LIGNE, { ...LIGNE, ligneId: "l-2", numero: "WEB-2026-0008", quantite: 2 }],
    };
    render(<GroupeACommander groupe={deux} />);
    expect(screen.getByText(/À commander en tout/).parentElement?.textContent)
      .toContain("5 sac Croquettes agneau 12 kg");
  });

  it("décocher une ligne la retire du total, et du compte du bouton", () => {
    const deux = {
      ...GROUPE,
      lignes: [LIGNE, { ...LIGNE, ligneId: "l-2", numero: "WEB-2026-0008", quantite: 2 }],
    };
    render(<GroupeACommander groupe={deux} />);
    expect(screen.getByRole("button", { name: /Commandé aujourd'hui \(2\)/ })).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/commande WEB-2026-0008/));
    expect(screen.getByRole("button", { name: /Commandé aujourd'hui \(1\)/ })).toBeTruthy();
    expect(screen.getByText(/À commander en tout/).parentElement?.textContent)
      .toContain("3 sac");
  });
});

describe("ce que l'écran dit du reste", () => {
  it("tout est coché d'entrée : commander l'attente entière est le geste normal", () => {
    render(<GroupeACommander groupe={GROUPE} />);
    expect((screen.getByLabelText(/Croquettes agneau/) as HTMLInputElement).checked).toBe(true);
  });

  it("le délai promis est rappelé, tel qu'il a été figé", () => {
    // Figé à la confirmation : si le fournisseur a changé son délai depuis, ce
    // qui compte est ce qu'on a promis à la cliente.
    render(<GroupeACommander groupe={GROUPE} />);
    expect(screen.getByText("5 à 8 j")).toBeTruthy();
  });

  it("un article sans fournisseur au carnet le dit, au lieu de disparaître", () => {
    render(<GroupeACommander groupe={{ ...GROUPE, fournisseurId: null, fournisseurNom: "Sans fournisseur au carnet" }} />);
    expect(screen.getByText(/À rattacher sur leur/)).toBeTruthy();
  });

  it("rien de coché : le bouton refuse de partir à vide", () => {
    render(<GroupeACommander groupe={GROUPE} />);
    fireEvent.click(screen.getByLabelText(/Croquettes agneau/));
    expect((screen.getByRole("button", { name: /Commandé aujourd'hui/ }) as HTMLButtonElement).disabled)
      .toBe(true);
  });
});

describe("la lecture et l'écriture, relues dans le code", () => {
  const src = (c: string) => readFileSync(join(__dirname, "..", c), "utf8");

  it("ne lit QUE ce qui attend vraiment une commande", () => {
    // Une ligne déjà commandée, ou dont la commande a été annulée, n'a rien à
    // faire ici — on la recommanderait.
    const l = src("src/lib/aCommander.ts");
    expect(l).toContain('.eq("sur_commande", true)');
    expect(l).toContain('.is("commandee_au_fournisseur_le", null)');
    expect(l).toContain('.eq("commandes.statut", "confirmee")');
  });

  it("le marquage relit le nombre de lignes touchées avant de journaliser", () => {
    // La leçon des lots 23-bis et 23-ter : un UPDATE filtré ne renvoie pas
    // d'erreur, il touche zéro ligne et dit que tout va bien. On aurait
    // journalisé une commande qui n'a pas eu lieu.
    const l = src("src/lib/aCommander.ts");
    expect(l).toMatch(/const touchees = \(data \?\? \[\]\)\.length;/);
    expect(l).toMatch(/if \(touchees === 0\)[\s\S]{0,200}return \{ touchees: 0, error:/);
  });

  it("l'action serveur porte sa propre garde", () => {
    // Un écran qui cache un bouton ne protège rien : l'action est appelable
    // directement.
    const a = src("app/(admin)/boutique/a-commander/actions.ts");
    expect(a).toContain('verifierPermissionBoutique("gestion")');
    expect(a).toMatch(/if \(verif\.error\) return \{ erreur: verif\.error \}/);
  });

  it("le geste est daté ET journalisé", () => {
    const l = src("src/lib/aCommander.ts");
    expect(l).toContain("commandee_au_fournisseur_le: aujourdhui");
    expect(l).toContain('evenement: "commande_au_fournisseur"');
  });
});
