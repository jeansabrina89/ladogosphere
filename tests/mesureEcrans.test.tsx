import { describe, it, expect, vi, beforeAll } from "vitest";
import {
  creerClientSimule,
  detailVagues,
  enSerie,
  estSortieNext,
  rendre,
  type Appel,
  type Resolveur,
} from "./helpers/clientSimule";

/**
 * APP 70 — lectures, et lectures EN SÉRIE, des écrans les plus utilisés.
 *
 * Chaque écran est rendu comme une requête le rend : le layout de son groupe
 * (et la barre de navigation qu'il contient), les layouts intermédiaires et la
 * page, EN MÊME TEMPS — c'est ainsi que Next les rend —, avec un client
 * Supabase simulé qui met 20 ms à répondre à chaque lecture.
 *
 * On compte les lectures, et surtout la longueur du CHEMIN CRITIQUE : combien
 * de lectures se sont attendues l'une l'autre. Depuis Washington, chacune
 * coûtait un aller-retour complet jusqu'à Zurich.
 *
 * Le getUser du proxy n'est pas compté : il précède toujours la page, une fois,
 * et ce lot ne le change pas (voir src/lib/garde.ts, « une fois par requête »).
 *
 * ── AVANT / APRÈS ─────────────────────────────────────────────────────────
 *
 * Mesuré avec CE fichier, sur le code d'avant (commit 1fea886) puis sur celui
 * d'APP 70 — même scénario, mêmes données :
 *
 *   Écran                   lectures      en série
 *   Aujourd'hui              16 → 10        6 → 3
 *   Chiens du jour           16 →  8        8 → 4
 *   Check-in                 13 →  5        7 → 4
 *   Réservations (liste)     15 →  6        9 → 4
 *   Réservations (fiche)     30 → 22       16 → 6
 *   Clients (liste)          12 →  4        6 → 4
 *   Clients (fiche)          22 → 14       16 → 3
 *   Fiche chien              15 →  5        9 → 3
 *   Caisse                   14 →  6        6 → 4
 *   Boutique → Articles      12 →  4        6 → 3
 *   Mon compte               11 → 10        8 → 3
 *   Nouvelle réservation      5 →  4        2 → 2
 *
 * Ce qui reste à 4 a une vraie dépendance : session → profil → lignes → ce qui
 * se lit À PARTIR des lignes (pointages des lignes du jour, adhésions des
 * clients listés, articles d'une rubrique de prix).
 *
 * Les seuils ci-dessous sont ceux d'après : un écran qui refait des lectures
 * en cascade fait rougir — c'est le garde-fou contre leur retour.
 */

const SIM = vi.hoisted(() => ({
  courant: null as null | ReturnType<typeof import("./helpers/clientSimule").creerClientSimule>,
  /** Le cache d'UNE requête : vidé avant chaque écran, comme Next le fait. */
  cache: new Map<unknown, Map<string, unknown>>(),
}));

/*
 * React.cache ne mémorise qu'à l'intérieur d'un rendu serveur React — dans
 * vitest, il laisse tout passer. On le remplace par l'équivalent exact d'une
 * requête : une mémoire par fonction, vidée entre deux écrans.
 */
vi.mock("react", async (original) => {
  const reel = await original<typeof import("react")>();
  return {
    ...reel,
    cache: <A extends unknown[], R>(fn: (...a: A) => R) => (...args: A): R => {
      let parFn = SIM.cache.get(fn);
      if (!parFn) { parFn = new Map(); SIM.cache.set(fn, parFn); }
      const cle = JSON.stringify(args);
      if (!parFn.has(cle)) parFn.set(cle, fn(...args));
      return parFn.get(cle) as R;
    },
  };
});

vi.mock("@/src/lib/supabase-admin", () => ({
  get supabaseAdmin() { return SIM.courant!.client; },
}));
vi.mock("@/src/utils/supabase/server", () => ({ createClient: async () => SIM.courant!.client }));
vi.mock("@/src/lib/supabase-server", () => ({ createSupabaseServerClient: async () => SIM.courant!.client }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => SIM.courant!.client,
  createBrowserClient: () => SIM.courant!.client,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => {}, has: () => false }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`NEXT_REDIRECT ${url}`); },
  permanentRedirect: (url: string) => { throw new Error(`NEXT_REDIRECT ${url}`); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  forbidden: () => { throw new Error("NEXT_HTTP_ERROR_FALLBACK;403"); },
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: <T,>(f: T) => f,
  unstable_noStore: () => {},
}));
vi.mock("server-only", () => ({}));
// Instancié à l'import par src/lib/email.ts : sans clé, il lève. Rien ne part.
vi.mock("resend", () => ({ Resend: class { emails = { send: async () => ({ data: null, error: null }) }; } }));

const ADMIN = { role: "admin", actif: true, email: "admin@exemple.ch" };
const CLIENT = { role: "client", actif: true, email: "client@exemple.ch" };
const ID = "00000000-0000-4000-8000-000000000001";

/** Une ligne plausible, quelle que soit la table : les fiches doivent s'ouvrir. */
function ligneGenerique(): Record<string, unknown> {
  return {
    id: ID, nom: "Pixel", prenom: "Sabrina", email: "client@exemple.ch", statut: "validee",
    type_reservation: "sejour", date_debut: "2026-10-10", date_fin: "2026-10-12",
    client_id: ID, chien_id: ID, reservation_id: ID, numero: 1, montant: 0, montant_total: 0,
    actif: true, reservation_chiens: [], chiens: [], clients: null, factures: [], paiements: [],
  };
}

function resolveur(profil: Record<string, unknown>, propre?: Resolveur): Resolveur {
  return (q) => {
    const specifique = propre?.(q);
    if (specifique !== undefined) return specifique;
    if (q.table === "profiles") return q.unique ? profil : [profil];
    if (q.table === "parametres") return q.unique ? null : [];
    // Une ligne aussi dans les listes : sans elle, les lectures qui DÉPENDENT
    // d'une liste (les colis des clients du jour, par exemple) ne partiraient
    // jamais, et l'écran paraîtrait plus rapide qu'il n'est.
    return q.unique ? ligneGenerique() : [ligneGenerique()];
  };
}

type Ecran = {
  nom: string;
  groupe: "admin" | "client";
  page: () => Promise<{ default: (p: unknown) => unknown }>;
  params?: Record<string, string>;
  /** Les layouts intermédiaires, rendus en même temps que la page. */
  layouts?: (() => Promise<{ default: (p: unknown) => unknown }>)[];
  /** Des données propres à l'écran, quand le cas générique ne suffit pas. */
  donnees?: Resolveur;
  /** Le maximum de lectures en série admis après APP 70. */
  enSerieMax: number;
};

/**
 * Chiens du jour : des lignes rattachées à un client et à une réservation,
 * sans quoi colis, conditions et pointages ne seraient jamais lus.
 */
const lignesDuJour: Resolveur = ({ table, unique }) =>
  table === "checkin_checkout" && !unique
    ? [{ ...ligneGenerique(), reservations: { clients: { id: ID } }, reservation_id: ID }]
    : undefined;

const ECRANS: Ecran[] = [
  { nom: "Aujourd'hui", groupe: "admin", page: () => import("@/app/(admin)/(espace-aujourdhui)/page"), enSerieMax: 3 },
  { nom: "Chiens du jour", groupe: "admin", page: () => import("@/app/(admin)/(espace-pension)/chiens-du-jour/page"), donnees: lignesDuJour, enSerieMax: 4 },
  { nom: "Check-in", groupe: "admin", page: () => import("@/app/(admin)/(espace-pension)/checkin/page"), enSerieMax: 4 },
  { nom: "Réservations (liste)", groupe: "admin", page: () => import("@/app/(admin)/(espace-clients)/reservations/page"), enSerieMax: 4 },
  { nom: "Réservations (fiche)", groupe: "admin", page: () => import("@/app/(admin)/(espace-clients)/reservations/[id]/page"), params: { id: ID }, enSerieMax: 6 },
  { nom: "Clients (liste)", groupe: "admin", page: () => import("@/app/(admin)/(espace-clients)/clients/page"), enSerieMax: 4 },
  { nom: "Clients (fiche)", groupe: "admin", page: () => import("@/app/(admin)/(espace-clients)/clients/[id]/page"), params: { id: ID }, enSerieMax: 3 },
  { nom: "Fiche chien", groupe: "admin", page: () => import("@/app/(admin)/(espace-clients)/chiens/[id]/page"), params: { id: ID }, enSerieMax: 3 },
  { nom: "Caisse", groupe: "admin", page: () => import("@/app/(admin)/boutique/caisse/page"), layouts: [() => import("@/app/(admin)/boutique/layout")], enSerieMax: 4 },
  { nom: "Boutique → Articles", groupe: "admin", page: () => import("@/app/(admin)/boutique/articles/page"), layouts: [() => import("@/app/(admin)/boutique/layout")], enSerieMax: 3 },
  { nom: "Mon compte", groupe: "client", page: () => import("@/app/(client)/mon-compte/page"), enSerieMax: 3 },
  { nom: "Nouvelle réservation", groupe: "client", page: () => import("@/app/(client)/mon-compte/reservations/nouvelle/page"), enSerieMax: 2 },
];

type Mesure = { nom: string; lectures: number; enSerie: number; sortie: string; detail: string[][]; appels: Appel[] };

async function mesurer(e: Ecran): Promise<Mesure> {
  SIM.cache.clear();
  SIM.courant = creerClientSimule({
    donnees: resolveur(e.groupe === "admin" ? ADMIN : CLIENT, e.donnees),
    latence: 20,
    utilisateur: { id: ID, email: "x@exemple.ch" },
  });
  const [{ default: Page }, { default: Layout }] = await Promise.all([
    e.page(),
    e.groupe === "admin" ? import("@/app/(admin)/layout") : import("@/app/(client)/layout"),
  ]);
  const props = { params: Promise.resolve(e.params ?? {}), searchParams: Promise.resolve({}) };
  let sortie = "rendu";
  try {
    // Le layout (et ce qu'il contient : la barre de navigation), les layouts
    // intermédiaires et la page partent ensemble, comme dans Next.
    const intermediaires = await Promise.all((e.layouts ?? []).map((l) => l()));
    await Promise.all([
      rendre(Layout({ children: null })),
      ...intermediaires.map((l) => rendre(l.default({ children: null }))),
      rendre(Page(props)),
    ]);
  } catch (err) {
    sortie = estSortieNext(err) ? (err as Error).message : `interrompu : ${(err as Error).message.slice(0, 80)}`;
  }
  const appels = [...SIM.courant.appels];
  return { nom: e.nom, lectures: appels.length, enSerie: enSerie(appels), sortie, detail: detailVagues(appels), appels };
}

const MESURES = new Map<string, Mesure>();
const mesure = (nom: string) => MESURES.get(nom)!;
/** L'étape (1, 2, 3…) où part chaque lecture d'une table. */
const etapesDe = (m: Mesure, table: string) =>
  m.detail.flatMap((tables, i) => tables.filter((t) => t === table).map(() => i + 1));

beforeAll(async () => {
  // Une passe à blanc d'abord : le premier rendu d'un module paie sa
  // compilation, et le chronomètre la prendrait pour des lectures.
  for (const e of ECRANS) await mesurer(e);
  for (const e of ECRANS) MESURES.set(e.nom, await mesurer(e));
  // Le tableau ne s'affiche que sur demande (MESURE_DETAIL=1) : la suite reste muette.
  if (process.env.MESURE_DETAIL === "1") {
    const sortie = ["", "| Écran | Lectures | En série | Rendu |", "|---|---|---|---|"];
    for (const m of MESURES.values()) sortie.push(`| ${m.nom} | ${m.lectures} | ${m.enSerie} | ${m.sortie} |`);
    for (const m of MESURES.values()) {
      sortie.push(`\n${m.nom}\n${m.detail.map((v, i) => `  ${i + 1}. ${v.join(", ")}`).join("\n")}`);
    }
    process.stdout.write(sortie.join("\n") + "\n");
  }
}, 120_000);

describe("chaque écran se rend, sans lectures en cascade", () => {
  it.each(ECRANS.map((e) => [e.nom, e] as const))("%s", (_nom, e) => {
    const m = mesure(e.nom);
    expect(m.sortie, "l'écran doit se rendre jusqu'au bout").toBe("rendu");
    expect(m.lectures).toBeGreaterThan(0);
    expect(m.enSerie, m.detail.map((v, i) => `${i + 1}. ${v.join(", ")}`).join("\n")).toBeLessThanOrEqual(e.enSerieMax);
  });

  it.each(ECRANS.map((e) => [e.nom] as const))("%s : la session n'est vérifiée qu'UNE fois dans la requête", (nom) => {
    // Avant : layout, barre de navigation, page et getProfilePerms la
    // revérifiaient chacun — jusqu'à cinq getUser par écran.
    const m = mesure(nom);
    expect(m.appels.filter((a) => a.cible === "auth:user")).toHaveLength(1);
  });

  it.each(ECRANS.filter((e) => e.groupe === "admin").map((e) => [e.nom] as const))(
    "%s : le profil du personnel n'est lu qu'UNE fois",
    (nom) => {
      expect(mesure(nom).appels.filter((a) => a.cible === "profiles")).toHaveLength(1);
    },
  );
});

describe("les lectures indépendantes partent ENSEMBLE (client simulé, ordre d'appel enregistré)", () => {
  it("Aujourd'hui : arrivées, départs, échéances, justificatifs et prestations en une seule étape", () => {
    const m = mesure("Aujourd'hui");
    // Étape 1 : la session ; étape 2 : le profil ; puis TOUT le reste.
    expect(m.detail[0]).toEqual(["auth:user"]);
    expect(m.detail[1]).toEqual(["profiles"]);
    expect([...m.detail[2]].sort()).toEqual([
      "checkin_checkout", "checkin_checkout", "commandes_personnalisees", "cotisations_membres",
      "depenses", "factures", "pieces",
      // APP 73 — demandes en attente et réservations du personnel à voir,
      // venues de l'accueil Clients : dans la MÊME étape, pas une de plus.
      "reservations", "reservations",
      "taches_prestations",
    ]);
  });

  it("Chiens du jour : colis, conditions et pointages partent ensemble, APRÈS les lignes du jour dont ils dépendent", () => {
    const m = mesure("Chiens du jour");
    const lignes = etapesDe(m, "checkin_checkout");
    expect(lignes).toEqual([3, 3, 3]);
    const dependantes = [
      ...etapesDe(m, "commandes"),
      ...etapesDe(m, "acceptations_conditions"),
      ...etapesDe(m, "journal_evenements"),
    ];
    expect(dependantes.length, "les trois lectures dépendantes doivent partir").toBeGreaterThanOrEqual(3);
    // Toutes à la même étape, et après les lignes.
    expect(new Set(dependantes)).toEqual(new Set([4]));
  });

  it("fiche client : les douze lectures de la fiche partent en une seule étape", () => {
    const m = mesure("Clients (fiche)");
    expect(m.detail).toHaveLength(3);
    for (const table of ["clients", "reservations", "factures", "abonnements", "avoirs_mouvements", "acceptations_conditions"]) {
      expect(etapesDe(m, table), table).toEqual([3]);
    }
    expect(etapesDe(m, "cotisations_membres").every((k) => k === 3)).toBe(true);
  });

  it("fiche réservation : ce qui dépend de l'identifiant d'abord, ce qui dépend de la réservation ensuite — deux étapes", () => {
    const m = mesure("Réservations (fiche)");
    // Temps 1 : la réservation, les tarifs, les lignes de check-in.
    for (const table of ["reservations", "tarifs", "checkin_checkout"]) {
      expect(etapesDe(m, table)[0], table).toBe(3);
    }
    // Temps 2 : ce qui a besoin de la réservation lue (son client) — une étape.
    expect(etapesDe(m, "commandes"), "colis du client").toEqual([4]);
    expect(etapesDe(m, "cotisations_membres"), "cotisation en attente").toEqual([4]);
  });
});
