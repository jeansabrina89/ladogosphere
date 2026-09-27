// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { render, screen, cleanup } from "@testing-library/react";
import "./setup/attenteJsdom";

/**
 * L'espace client de la pension à la suisse — SAUF les factures.
 *
 * ── LA LIGNE QUE CE FICHIER DÉFEND ────────────────────────────────────────
 *
 * Réservations, tarifs, prestations, abonnements et tableau de bord écrivent
 * « 226.50 » et « 200.– », comme la boutique. `mon-compte/factures` écrit
 * « 226.50 CHF », parce que la cliente lit cet écran avec le PDF ouvert à côté :
 * deux écritures du même montant, à cet endroit-là, font hésiter avant de payer.
 *
 * Les deux écrans sont donc RENDUS ici, l'un après l'autre, dans le même
 * fichier. C'est volontaire : une garde qui ne lit qu'un côté laisse l'autre
 * dériver sans bruit, et c'est le côté facture qui dériverait — parce que
 * l'aligner ressemble à finir le travail.
 */

const H = vi.hoisted(() => ({
  factures: [] as Record<string, unknown>[],
  reservations: [] as Record<string, unknown>[],
}));

// ── Le décor : juste assez de base pour que les deux pages se rendent ───────

vi.mock("next/navigation", () => ({
  redirect: () => { throw new Error("redirect"); },
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => "/mon-compte/reservations",
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * L'écran des réservations importe ses boutons, qui importent leurs actions
 * serveur — lesquelles tirent `email.ts`, Resend et `server-only`, qui refuse
 * de se charger hors d'un composant serveur. On coupe la chaîne ici.
 *
 * Cela n'affaiblit rien de ce que ce fichier vérifie : aucun bouton n'est
 * cliqué, on ne lit que les montants ÉCRITS par la page. Les actions
 * elles-mêmes sont couvertes ailleurs.
 */
vi.mock("@/app/(client)/mon-compte/reservations/actions", () => ({
  creerDemandeReservation: async () => ({}),
  annulerMaReservationInterne: async () => ({}),
  reglerReservationAvecAbonnement: async () => ({}),
}));

function chaine(donnees: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "not", "order", "in", "is"]) {
    c[m] = () => c;
  }
  c.single = () => Promise.resolve({ data: donnees, error: null });
  c.maybeSingle = () => Promise.resolve({ data: donnees, error: null });
  c.then = (resoudre: (v: unknown) => unknown) =>
    Promise.resolve({ data: donnees, error: null }).then(resoudre);
  return c;
}

const CLIENT = { id: "cli-1", interne: false };

vi.mock("@/src/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (table: string) =>
      chaine(
        table === "clients" ? CLIENT
        : table === "factures" ? H.factures
        : table === "facture_lignes" ? []
        : [],
      ),
  },
}));

vi.mock("@/src/lib/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "auth-1" } } }) },
  }),
}));

vi.mock("@/src/utils/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) =>
      chaine(table === "clients" ? CLIENT : H.reservations),
  }),
}));

vi.mock("@/src/lib/coordonneesPaiement", () => ({
  getCoordonneesPaiement: async () => ({ iban: "CH00", titulaire: "La Dogosphère" }),
}));
vi.mock("@/src/lib/avoirs", () => ({ getSoldeAvoir: async () => 0 }));
vi.mock("@/src/lib/abonnementSolde", () => ({ getAbonnementsClient: async () => [] }));

afterEach(() => {
  cleanup();
  H.factures = [];
  H.reservations = [];
});

/** Le texte visible, espaces normalisés. */
function lu(): string {
  return (document.body.textContent ?? "").replace(/\s+/g, " ");
}

describe("les réservations : le format de la vitrine", () => {
  /**
   * Trois montants d'un coup : 226.50 avec centimes, 89.– rond, et un reste de
   * 137.50. Une réservation partiellement payée est le seul cas où les trois
   * s'affichent ensemble.
   */
  async function rendre() {
    H.reservations = [
      {
        id: "res-1",
        numero: 41,
        date_debut: "2026-07-06",
        date_fin: "2026-07-10",
        statut: "validee",
        statut_paiement: "partiel",
        montant_final: 226.5,
        montant_paye: 89,
        type_reservation: "pension",
        boxes: { numero: 3, nom: null },
        reservation_chiens: [{ chiens: { nom: "Pixel", doit_etre_isole: false } }],
      },
    ];
    const { default: Page } = await import("@/app/(client)/mon-compte/reservations/page");
    render(await Page({ searchParams: Promise.resolve({}) }));
  }

  it("écrit 226.50, 89.– et 137.50 — et aucun « CHF »", async () => {
    await rendre();
    const texte = lu();
    expect(texte).toContain("226.50");
    // 89 est rond : il prend le tiret demi-cadratin, pas « 89.00 ».
    expect(texte).toContain("89.–");
    expect(texte).toContain("137.50");
    expect(texte).not.toContain("89.00");
  });

  it("LE POINT 4, EN UNE SEULE VUE : la carte à la suisse, le bouton en format pièce", async () => {
    /**
     * Cette réservation partiellement payée met les DEUX formats côte à côte,
     * sur la même carte, et c'est voulu :
     *
     *   « 💰 226.50 (payé : 89.– · reste : 137.50) »   ← les montants du séjour
     *   « 💳 Payer 137.50 CHF »                        ← ce qui mène à la facture
     *
     * Le bouton ouvre la boîte qui donne le numéro de facture comme référence de
     * virement et cite le bulletin QR : son montant, la cliente le comparera au
     * PDF. Les montants du séjour, elle ne les compare à rien.
     */
    await rendre();

    const ligne = screen.getByText(/226.50/);
    expect(ligne.textContent).toContain("89.–");
    expect(ligne.textContent).toContain("137.50");
    expect(ligne.textContent, "les montants du séjour n'ont plus de CHF").not.toContain("CHF");

    const payer = screen.getByRole("button", { name: /Payer/ });
    expect(payer.textContent, "le bouton suit la facture").toContain("137.50 CHF");
  });

  it("« CHF » n'apparaît QUE dans le bouton qui mène à la facture", async () => {
    // La garde inverse : si un montant du séjour reprend le format pièce, il y
    // aura deux « CHF » sur l'écran, et ce test le dira.
    await rendre();
    expect((lu().match(/CHF/g) ?? []).length).toBe(1);
  });
});

describe("les factures : le format de la pièce, inchangé", () => {
  async function rendre() {
    H.factures = [
      {
        id: "f-1",
        numero: "2026-0041",
        type: "facture",
        statut: "ouverte",
        date_facture: "2026-07-11",
        date_echeance: "2026-08-10",
        montant_total: 226.5,
        montant_restant: 226.5,
      },
    ];
    const { default: Page } = await import("@/app/(client)/mon-compte/factures/page");
    render(await Page());
  }

  it("écrit « 226.50 CHF », comme le PDF que la cliente ouvre à côté", async () => {
    await rendre();
    const texte = lu();
    expect(texte).toContain("226.50 CHF");
    // Le tiret de vitrine n'a rien à faire sur une pièce comptable.
    expect(texte).not.toContain(".–");
  });

  it("le total dû garde aussi le format de la pièce", async () => {
    await rendre();
    expect(lu()).toContain("Reste à payer : 226.50 CHF");
  });

  it("un montant rond s'écrit « 200.00 CHF », jamais « 200.– »", async () => {
    /**
     * C'est le cas qui distingue les deux formats sans ambiguïté possible : un
     * montant à centimes s'écrit pareil des deux côtés, un montant rond non.
     */
    H.factures = [
      {
        id: "f-2", numero: "2026-0042", type: "facture", statut: "ouverte",
        date_facture: "2026-07-11", date_echeance: "2026-08-10",
        montant_total: 200, montant_restant: 200,
      },
    ];
    const { default: Page } = await import("@/app/(client)/mon-compte/factures/page");
    render(await Page());
    const texte = lu();
    expect(texte).toContain("200.00 CHF");
    expect(texte).not.toContain("200.–");
  });
});

// ── Les gardes de source ───────────────────────────────────────────────────

const RACINE = join(__dirname, "..");

function codeSeul(chemin: string): string {
  return readFileSync(join(RACINE, chemin), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");
}

describe("la frontière, relue dans le dépôt", () => {
  const ALIGNES = [
    "app/(client)/mon-compte/page.tsx",
    "app/(client)/mon-compte/tarifs/page.tsx",
    "app/(client)/mon-compte/prestations/page.tsx",
    "app/(client)/mon-compte/prestations/CommandeLocataire.tsx",
    "app/(client)/mon-compte/abonnements/page.tsx",
    "app/(client)/mon-compte/reservations/page.tsx",
    "app/(client)/mon-compte/reservations/[id]/page.tsx",
    "app/(client)/mon-compte/reservations/nouvelle/TunnelReservation.tsx",
    "app/components/BoutonDemanderAdhesion.tsx",
  ];

  it("chaque écran aligné appelle formatPrixClient, et plus aucun « CHF »", () => {
    for (const ecran of ALIGNES) {
      const partage = codeSeul(ecran);
      expect(partage, ecran).toContain("formatPrixClient(");
      expect(partage, `${ecran} : plus de CHF cousu au montant`).not.toContain("CHF");
      expect(partage, `${ecran} : plus de format local`).not.toMatch(/toFixed\(2\)/);
    }
  });

  it("LA GARDE : mon-compte/factures ne doit JAMAIS appeler formatPrixClient", () => {
    /**
     * Ce test échoue si quelqu'un « finit le travail » en alignant les factures.
     * Il ne dit pas que ce serait plus laid : il dit que la cliente compare cet
     * écran au PDF, et que le PDF ne change pas.
     */
    const partage = codeSeul("app/(client)/mon-compte/factures/page.tsx");
    expect(partage, "les factures suivent le PDF, pas la vitrine").not.toContain("formatPrixClient");
    expect(partage).toContain("const chf = (n: number) => `${(Number(n) || 0).toFixed(2)} CHF`;");
  });

  it("le PDF de facture n'a pas bougé non plus", () => {
    const pdf = codeSeul("src/lib/facturePdf.tsx");
    expect(pdf).not.toContain("formatPrixClient");
    expect(pdf).toContain("minimumFractionDigits: 2");
  });

  it("LE POINT 4 : la boîte de paiement garde le format de la facture", () => {
    /**
     * C'est le seul écran client de la pension où un montant renvoie à une
     * facture : la boîte donne le numéro de facture comme référence de virement
     * et cite le bulletin QR. Elle garde donc les deux décimales.
     *
     * Et son champ de saisie est un `input type="number"` : « 226.– » n'est pas
     * un nombre que le navigateur sait relire. Le format de vitrine y est
     * techniquement impossible, pas seulement inopportun.
     */
    const partage = codeSeul("app/(client)/mon-compte/reservations/BoutonPaiementClient.tsx");
    expect(partage).not.toContain("formatPrixClient");
    expect(partage).toContain('type="number"');
    // Le « CHF » du libellé de saisie reste : devant un champ où l'on TAPE un
    // nombre, le mot dit l'unité.
    expect(partage).toContain("Montant à payer (CHF)");
  });

  it("« TTC » n'est dit qu'une fois dans tout l'espace client de la pension", () => {
    /**
     * Les écrans de la pension n'en portaient qu'une seule mention, en pied de
     * la page des tarifs. Elle reste là — un tableau de prix sans total n'a pas
     * d'endroit plus juste — et aucune nouvelle n'a été ajoutée.
     */
    const trouves: string[] = [];
    const parcourir = (dossier: string) => {
      for (const entree of readdirSync(dossier)) {
        const complet = join(dossier, entree);
        if (statSync(complet).isDirectory()) parcourir(complet);
        else if (/\.tsx?$/.test(entree)) {
          const chemin = relative(RACINE, complet).replace(/\\/g, "/");
          // `commandes` est la boutique (APP 30), elle a sa propre mention.
          if (chemin.includes("/mon-compte/commandes/")) continue;
          if (codeSeul(chemin).includes("TTC")) trouves.push(chemin);
        }
      }
    };
    parcourir(join(RACINE, "app/(client)"));
    expect(trouves).toEqual(["app/(client)/mon-compte/tarifs/page.tsx"]);
    expect(codeSeul("app/(client)/mon-compte/tarifs/page.tsx")).toContain("Tarifs TTC");
  });
});
