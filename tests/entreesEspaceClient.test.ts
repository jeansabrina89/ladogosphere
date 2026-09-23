import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  ENTREES_ESPACE_CLIENT,
  entreesVisibles,
  libelleComplet,
  tuilesVisibles,
  type ProfilEspaceClient,
} from "@/src/lib/entreesEspaceClient";

/**
 * La barre de navigation et le tableau de bord montrent les mêmes entrées.
 *
 * Ils avaient chacun leur liste, et elles divergeaient : le tableau de bord
 * proposait « Mes abonnements » à une fiche du personnel, que la barre cachait.
 */

const PROFILS: { nom: string; profil: ProfilEspaceClient }[] = [
  { nom: "client ordinaire", profil: { interne: false, locataire: false } },
  { nom: "fiche interne", profil: { interne: true, locataire: false } },
  { nom: "locataire de box", profil: { interne: false, locataire: true } },
  { nom: "fiche interne locataire", profil: { interne: true, locataire: true } },
];

const hrefs = (entrees: readonly { href: string }[]) => entrees.map((e) => e.href);

describe("les deux surfaces montrent la même chose", () => {
  it.each(PROFILS)(
    "$nom : les tuiles sont exactement les entrées de la barre, moins la racine",
    ({ profil }) => {
      const barre = entreesVisibles(profil);
      const tuiles = tuilesVisibles(profil);

      // Aucune tuile que la barre cacherait.
      expect(hrefs(tuiles).filter((h) => !hrefs(barre).includes(h))).toEqual([]);
      // Aucune entrée de barre sans tuile, hormis la page où l'on se trouve.
      const sansTuile = barre.filter((e) => !hrefs(tuiles).includes(e.href));
      expect(hrefs(sansTuile)).toEqual(["/mon-compte"]);
      expect(sansTuile.every((e) => e.racine)).toBe(true);
    }
  );

  it("« Mon compte » n’est jamais une tuile : on y est déjà", () => {
    for (const { profil } of PROFILS) {
      expect(hrefs(tuilesVisibles(profil))).not.toContain("/mon-compte");
    }
  });
});

describe("les règles de visibilité", () => {
  it("une fiche interne ne voit ni abonnements, ni boutique, ni commandes, ni tarifs", () => {
    const vus = hrefs(entreesVisibles({ interne: true }));
    for (const cache of [
      "/mon-compte/abonnements",
      "/catalogue",
      "/mon-compte/commandes",
      "/mon-compte/tarifs",
    ]) {
      expect(vus, cache).not.toContain(cache);
    }
  });

  it("un client ordinaire les voit toutes les quatre", () => {
    const vus = hrefs(entreesVisibles({ interne: false }));
    for (const visible of [
      "/mon-compte/abonnements",
      "/catalogue",
      "/mon-compte/commandes",
      "/mon-compte/tarifs",
    ]) {
      expect(vus, visible).toContain(visible);
    }
  });

  it("une fiche interne garde ses chiens, ses réservations, ses factures et son profil", () => {
    // Les achats au comptoir se facturent comme pour n'importe qui.
    const vus = hrefs(entreesVisibles({ interne: true }));
    expect(vus).toEqual([
      "/mon-compte",
      "/mon-compte/chiens",
      "/mon-compte/reservations",
      "/mon-compte/factures",
      "/mon-compte/profil",
    ]);
  });

  it("les prestations n’apparaissent que pour un locataire de box", () => {
    expect(hrefs(entreesVisibles({ locataire: false }))).not.toContain("/mon-compte/prestations");
    expect(hrefs(entreesVisibles({ locataire: true }))).toContain("/mon-compte/prestations");
    // Y compris pour une fiche interne qui loue un box.
    expect(hrefs(entreesVisibles({ interne: true, locataire: true })))
      .toContain("/mon-compte/prestations");
  });

  it("sans argument, c’est le client ordinaire", () => {
    expect(hrefs(entreesVisibles())).toEqual(hrefs(entreesVisibles({ interne: false, locataire: false })));
  });

  it("l’ordre de la liste est conservé", () => {
    const vus = hrefs(entreesVisibles({ locataire: true }));
    expect(vus).toEqual(hrefs(ENTREES_ESPACE_CLIENT));
  });
});

describe("la forme des entrées", () => {
  it("chacune a une icône, un libellé et un href unique", () => {
    for (const e of ENTREES_ESPACE_CLIENT) {
      expect(e.icone.trim(), e.href).not.toBe("");
      expect(e.libelle.trim(), e.href).not.toBe("");
      expect(e.href.startsWith("/"), e.href).toBe(true);
    }
    const tous = hrefs(ENTREES_ESPACE_CLIENT);
    expect(new Set(tous).size).toBe(tous.length);
  });

  it("le libellé de la barre recolle l’icône devant", () => {
    expect(libelleComplet({ href: "/x", libelle: "Mes chiens", icone: "🐶", exact: false }))
      .toBe("🐶 Mes chiens");
  });

  it("une seule racine, et c’est le tableau de bord", () => {
    const racines = ENTREES_ESPACE_CLIENT.filter((e) => e.racine);
    expect(hrefs(racines)).toEqual(["/mon-compte"]);
  });
});

// ── Le dépôt : aucune des deux surfaces ne garde sa propre liste ───────────

const RACINE = join(__dirname, "..");
const lire = (...morceaux: string[]) => readFileSync(join(RACINE, ...morceaux), "utf8");

const BARRE = lire("app", "components", "NavBarClient.tsx");
const TABLEAU = lire("app", "(client)", "mon-compte", "page.tsx");

describe("une seule source d’entrées dans le dépôt", () => {
  it("les deux surfaces lisent le module partagé", () => {
    expect(BARRE).toContain('from "@/src/lib/entreesEspaceClient"');
    expect(TABLEAU).toContain('from "@/src/lib/entreesEspaceClient"');
    expect(BARRE).toContain("entreesVisibles(");
    expect(TABLEAU).toContain("tuilesVisibles(");
  });

  it("ni l’une ni l’autre ne redéclare une liste d’entrées", () => {
    // Une seconde liste, c'est la divergence qui revient : on refuse qu'un
    // href de l'espace client soit écrit en dur dans une de ces deux surfaces.
    for (const [nom, source] of [["NavBarClient", BARRE], ["tableau de bord", TABLEAU]] as const) {
      const enDur = source.match(/href:\s*"\/(mon-compte|catalogue)/g) ?? [];
      expect(enDur, nom).toEqual([]);
    }
  });

  it("le tableau de bord n’écrit plus les libellés lui-même", () => {
    for (const libelle of ["Mes abonnements", "Mes commandes", "Mes factures", "Tarifs"]) {
      expect(TABLEAU, libelle).not.toContain(`label: "${libelle}"`);
    }
  });
});
