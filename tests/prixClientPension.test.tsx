// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { render, screen, cleanup } from "@testing-library/react";
import "./setup/attenteJsdom";

/**
 * L'espace client de la pension à la suisse — SAUF les factures.
 *
 * ── LA LIGNE QUE CE FICHIER DÉFEND ────────────────────────────────────────
 *
 * La frontière ne passe pas entre les ÉCRANS mais entre les MONTANTS. Un
 * montant de séjour, de tarif ou de boutique s'écrit « 226.50 » et « 200.– ».
 * Un montant calculé à partir des FACTURES ou des AVOIRS — un payé, un reste à
 * payer, un solde d'avoir — s'écrit « 226.50 CHF », parce que la cliente le
 * compare au bulletin de versement qu'elle a sous les yeux.
 *
 * Les deux se croisent donc SUR LA MÊME LIGNE, et c'est le cas le plus utile à
 * tenir : « 💰 226.50 (payé : 89.00 CHF · reste : 137.50 CHF) ».
 *
 * Les deux écrans sont donc RENDUS ici, l'un après l'autre, dans le même
 * fichier. C'est volontaire : une garde qui ne lit qu'un côté laisse l'autre
 * dériver sans bruit, et c'est le côté facture qui dériverait — parce que
 * l'aligner ressemble à finir le travail.
 */

const H = vi.hoisted(() => ({
  factures: [] as Record<string, unknown>[],
  reservations: [] as Record<string, unknown>[],
  soldeAvoir: 0,
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
vi.mock("@/src/lib/avoirs", () => ({ getSoldeAvoir: async () => H.soldeAvoir }));

// Le tableau de bord seul : ce qu'il lit en plus des réservations.
vi.mock("@/src/lib/membre", () => ({ estMembreActif: async () => true }));
vi.mock("@/src/lib/cotisation", () => ({
  cotisationActive: async () => null,
  cotisationEnAttente: async () => null,
}));
vi.mock("@/src/lib/essaiReservation", () => ({
  datesEssaiParChien: async () => new Map<string, string>(),
}));
vi.mock("@/src/lib/abonnementSolde", () => ({ getAbonnementsClient: async () => [] }));

/**
 * jsdom n_implemente pas matchMedia, et le tableau de bord monte
 * InstallerAppButton, qui s_en sert pour savoir si l_application tourne en
 * mode autonome. Le stub rend toujours faux : le bouton s_affiche, ce qui est
 * l_etat par defaut dans un navigateur, et aucun montant n_en depend.
 */
if (!window.matchMedia) {
  window.matchMedia = ((requete: string) => ({
    matches: false, media: requete, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
afterEach(() => {
  cleanup();
  H.factures = [];
  H.reservations = [];
  H.soldeAvoir = 0;
});

/** Le texte visible, espaces normalisés. */
function lu(): string {
  return (document.body.textContent ?? "").replace(/\s+/g, " ");
}

/**
 * ── LES TROIS PAGES SE CHARGENT UNE FOIS, HORS DU CHRONO DU TEST ──────────
 *
 * Le premier `await import` du tableau de bord coûtait 825 à 856 ms sur une
 * machine au repos — pour un test qui durait 771 à 807 ms en tout. Autrement
 * dit, le test ne mesurait pas ce qu'il vérifie : il mesurait la compilation
 * de la page. Les imports suivants, eux, coûtaient 0 ms, le module étant déjà
 * au registre : c'est donc le PREMIER test de chaque describe qui payait, et
 * c'est bien lui qui échouait.
 *
 * Sur une machine chargée, cette compilation se multiplie par trois à six et
 * emportait le délai de 15 secondes. L'échec disait alors « Test timed out »,
 * qui ne nomme ni la page, ni le montant, ni rien de ce qu'on cherchait.
 *
 * Les 60 secondes sont celles du `beforeAll`, pas du test : la compilation a
 * de la marge, le test garde ses 15 secondes pour ce qu'il prouve.
 *
 * Précharger ne dérange aucun mock : les `vi.mock` ci-dessus sont hoistés,
 * donc déjà posés, et leurs fabriques lisent `H` À L'APPEL — au rendu, pas à
 * l'import. Chaque `rendre()` remplit donc `H` comme avant.
 */
let PageReservations: (typeof import("@/app/(client)/mon-compte/reservations/page"))["default"];
let PageTableauDeBord: (typeof import("@/app/(client)/mon-compte/page"))["default"];
let PageFactures: (typeof import("@/app/(client)/mon-compte/factures/page"))["default"];

beforeAll(async () => {
  PageReservations = (await import("@/app/(client)/mon-compte/reservations/page")).default;
  PageTableauDeBord = (await import("@/app/(client)/mon-compte/page")).default;
  PageFactures = (await import("@/app/(client)/mon-compte/factures/page")).default;
}, 60_000);

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
    render(await PageReservations({ searchParams: Promise.resolve({}) }));
  }

  it("le TOTAL du séjour est à la suisse, le payé et le reste au format pièce", async () => {
    await rendre();
    const texte = lu();
    // Le total du séjour : aucun « CHF » accolé, jamais.
    expect(texte).toContain("💰 226.50 (");
    expect(texte, "le total du séjour ne prend pas le format pièce").not.toContain("226.50 CHF");
    // Le payé est un encaissement, le reste vient des factures : les deux
    // portent les deux décimales ET le « CHF ».
    expect(texte).toContain("payé : 89.00 CHF");
    expect(texte).toContain("reste : 137.50 CHF");
    expect(texte, "89 rond s'écrit 89.00, pas 89.–").not.toContain("89.–");
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

    const ligne = screen.getByText(/226\.50/);
    expect(ligne.textContent).toContain("💰 226.50 (");
    expect(ligne.textContent).toContain("payé : 89.00 CHF");
    expect(ligne.textContent).toContain("reste : 137.50 CHF");

    const payer = screen.getByRole("button", { name: /Payer/ });
    expect(payer.textContent, "le bouton suit la facture").toContain("137.50 CHF");
    // LE POINT : le reste écrit dans la parenthèse et le montant du bouton sont
    // le MÊME nombre, écrit de la MÊME façon. C'est ce qui permet de vérifier
    // d'un coup d'oeil qu'on s'apprête à payer la bonne somme.
    expect(payer.textContent).toContain("137.50 CHF");
    expect(ligne.textContent).toContain("137.50 CHF");
  });

  it("« CHF » n'apparaît QUE sur des montants dérivés des factures", async () => {
    /**
     * CE TEST A CHANGÉ D'OBJET, et il est plus strict qu'avant.
     *
     * Il comptait « CHF » et en exigeait UN SEUL : celui du bouton « Payer ».
     * Le payé et le reste étant passés au format pièce, il y en a maintenant
     * trois — et un simple compte ne dirait plus rien de juste.
     *
     * Il vérifie donc ce qu'on voulait vraiment dire : chaque « CHF » de
     * l'écran suit un montant dérivé des factures, et aucun autre. Le seul
     * montant de séjour de la page, le total, n'en porte pas.
     */
    await rendre();
    const texte = lu();
    const avecCHF = [...texte.matchAll(/([0-9'.,]+) CHF/g)].map((m) => m[1]);
    // 89.00 (encaissé), 137.50 (reste dérivé des factures), 137.50 (le bouton).
    expect(avecCHF).toEqual(["89.00", "137.50", "137.50"]);
    // Et le total du séjour n'y est pas.
    expect(avecCHF).not.toContain("226.50");
  });
});

describe("le tableau de bord : les deux tuiles viennent des factures", () => {
  /**
   * « Avoir » est un solde d'avoir, « À régler » la somme des restes dérivés des
   * factures. Deux cents francs ronds : c'est le montant qui distingue les deux
   * formats à coup sûr — « 200.00 CHF » d'un côté, « 200.– » de l'autre.
   */
  async function rendre() {
    H.soldeAvoir = 200;
    H.reservations = [
      {
        id: "res-9",
        numero: 9,
        date_debut: "2026-07-06",
        date_fin: "2026-07-10",
        statut: "terminee",
        statut_paiement: "impaye",
        montant_final: 200,
        montant_paye: 0,
        montant_restant: 200,
        type_reservation: "pension",
        reservation_chiens: [{ chiens: { nom: "Pixel" } }],
      },
    ];
    render(await PageTableauDeBord());
  }

  it("« Avoir » et « À régler » s'écrivent « 200.00 CHF »", async () => {
    await rendre();
    const texte = lu();
    expect((texte.match(/200.00 CHF/g) ?? []).length, "les deux tuiles").toBe(2);
    // Les libellés n'ont pas bougé : le « CHF » est dans le montant, pas dessous.
    expect(texte).toContain("Avoir");
    expect(texte).toContain("À régler");
    expect(texte).not.toContain("Avoir CHF");
    expect(texte).not.toContain("À régler CHF");
  });

  it("DEUX CENTS FRANCS, DEUX ÉCRITURES, SUR LE MÊME ÉCRAN", async () => {
    /**
     * Le meilleur test de la règle, et il est tombé par accident en écrivant le
     * précédent : ce tableau de bord affiche DEUX FOIS le nombre 200, à deux
     * endroits, dans deux formats — et les deux sont justes.
     *
     *   « 200.00 CHF » sous Avoir et sous À régler   → dérivés des factures
     *   « L'adhésion annuelle de 200.– »             → un TARIF
     *
     * La frontière ne passe donc pas entre les écrans, ni entre les montants
     * ronds et les autres : elle passe entre ce qui se compare à une pièce et ce
     * qui ne se compare à rien. Si quelqu'un uniformise un jour cet écran, dans
     * un sens ou dans l'autre, ce test le dira.
     */
    await rendre();
    const texte = lu();
    expect(texte).toContain("200.00 CHF");
    expect(texte).toContain("L'adhésion annuelle de 200.–");
    expect(texte, "la cotisation n'est pas une pièce").not.toContain("adhésion annuelle de 200.00 CHF");
  });

  it("le montant de la PROCHAINE réservation reste un montant de séjour", async () => {
    /**
     * Sur le même écran, et c'est voulu : la prochaine réservation affiche le
     * prix du séjour, qui ne se compare à aucune pièce. Il garde le tiret.
     */
    H.soldeAvoir = 0;
    H.reservations = [
      {
        id: "res-10",
        numero: 10,
        date_debut: "2099-07-06",
        date_fin: "2099-07-10",
        statut: "validee",
        statut_paiement: "paye",
        montant_final: 340,
        montant_paye: 340,
        montant_restant: 0,
        type_reservation: "pension",
        reservation_chiens: [{ chiens: { nom: "Pixel" } }],
      },
    ];
    render(await PageTableauDeBord());
    const texte = lu();
    expect(texte).toContain("340.–");
    expect(texte).not.toContain("340.00 CHF");
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
    render(await PageFactures());
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
    render(await PageFactures());
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
    // Son formateur local a disparu au lot des pièces : l'écran et le PDF
    // appellent désormais la MÊME fonction, ce qui est plus fort que deux
    // écritures qu'un test comparait.
    expect(partage).toContain("formatPrixFacture(");
    expect(partage).not.toMatch(/const chf\s*=/);
  });

  it("le PDF de facture garde le format de la pièce", () => {
    const pdf = codeSeul("src/lib/facturePdf.tsx");
    expect(pdf).not.toContain("formatPrixClient");
    expect(pdf).toContain("formatPrixFacture(");
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
