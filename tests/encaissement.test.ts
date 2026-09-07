import { describe, it, expect, beforeEach, vi } from "vitest";

// L'encaissement unique (composant « Encaisser ») sur le vrai code :
//  - le client vient du serveur, jamais du navigateur ;
//  - un double clic n'enregistre qu'un versement ;
//  - le montant saisi est un VERSEMENT, plafonné au reste dû, jamais un cumul ;
//  - un versement partiel laisse la facture partiellement payée ;
//  - les espèces sont arrondies aux 5 centimes ;
//  - les bornes de date s'appliquent comme en phase 0.

const AUJOURDHUI = new Date().toISOString().split("T")[0];
const ANNEE = Number(AUJOURDHUI.slice(0, 4));

type Ligne = Record<string, unknown>;
type Ctx = { table: string; filters: Record<string, string>; op: string | null; vals: Ligne | null };

const H = vi.hoisted(() => ({
  factures: {} as Record<string, Record<string, unknown>>,
  reservations: {} as Record<string, Record<string, unknown>>,
  parametres: {} as Record<string, string>,
  exercices: [] as { annee: number; statut: string }[],
  paiements: [] as Record<string, unknown>[],
  clesVues: new Set<string>(),
  majFactures: [] as { id: unknown; vals: Ligne }[],
  avoirsInseres: [] as Record<string, unknown>[],
  rpcAppels: [] as { nom: string; args: Record<string, unknown> }[],
}));

vi.mock("@/src/lib/supabase-admin", () => {
  function from(table: string) {
    const ctx: Ctx = { table, filters: {}, op: null, vals: null };

    const lignesDe = () => {
      if (table === "paiements_resa") {
        return H.paiements.filter((p) =>
          (!ctx.filters.facture_id || p.facture_id === ctx.filters.facture_id) &&
          (!ctx.filters.reservation_id || p.reservation_id === ctx.filters.reservation_id) &&
          (!ctx.filters.cle_idempotence || p.cle_idempotence === ctx.filters.cle_idempotence));
      }
      if (table === "exercices") return H.exercices;
      return [];
    };

    const uneLigne = () => {
      if (table === "factures") return H.factures[ctx.filters.id] ? { ...H.factures[ctx.filters.id] } : null;
      if (table === "reservations") return H.reservations[ctx.filters.id] ? { ...H.reservations[ctx.filters.id] } : null;
      if (table === "parametres") return { valeur: H.parametres[ctx.filters.cle] ?? "" };
      if (table === "paiements_resa") {
        return H.paiements.find((p) => p.id === ctx.filters.id) ?? null;
      }
      return null;
    };

    const chain = {
      select: () => chain,
      insert: (rows: Ligne | Ligne[]) => {
        const arr = Array.isArray(rows) ? rows : [rows];
        for (const r of arr) {
          if (table === "paiements_resa") {
            const cle = r.cle_idempotence
              ? `${r.facture_id ?? r.reservation_id}|${r.cle_idempotence}` : null;
            if (cle && H.clesVues.has(cle)) {
              const erreur = { error: { code: "23505", message: "duplicate key" } };
              return Object.assign(Promise.resolve(erreur), {
                select: () => ({ single: () => Promise.resolve({ data: null, ...erreur }) }),
              });
            }
            if (cle) H.clesVues.add(cle);
            H.paiements.push(r);
          }
          if (table === "avoirs_mouvements") H.avoirsInseres.push(r);
        }
        const ok = { error: null };
        return Object.assign(Promise.resolve(ok), {
          select: () => ({ single: () => Promise.resolve({ data: { id: "mvt-1" }, error: null }) }),
        });
      },
      update: (vals: Ligne) => { ctx.op = "update"; ctx.vals = vals; return chain; },
      eq: (col: string, val: string) => { ctx.filters[col] = val; return chain; },
      is: (col: string) => { ctx.filters[col] = "null"; return chain; },
      not: () => chain,
      neq: () => chain,
      in: () => chain,
      gte: () => chain,
      lte: () => chain,
      limit: () => Promise.resolve({ data: [], error: null }),
      order: () => Promise.resolve({ data: lignesDe(), error: null }),
      single: () => Promise.resolve({ data: uneLigne(), error: null }),
      maybeSingle: () => Promise.resolve({ data: uneLigne(), error: null }),
      // Le comptage sert au contrôle d'idempotence.
      count: () => Promise.resolve({ count: lignesDe().length, error: null }),
      then: <T,>(onF: (v: { data: unknown; count: number; error: null }) => T) => {
        if (ctx.op === "update") {
          if (table === "factures") {
            H.majFactures.push({ id: ctx.filters.id, vals: ctx.vals ?? {} });
            const f = H.factures[ctx.filters.id];
            if (f) Object.assign(f, ctx.vals);
          }
          if (table === "reservations") {
            const r = H.reservations[ctx.filters.id];
            if (r) Object.assign(r, ctx.vals);
          }
        }
        const data = lignesDe();
        return Promise.resolve({ data, count: data.length, error: null }).then(onF);
      },
    };
    return chain;
  }
  function rpc(nom: string, args: Record<string, unknown>) {
    H.rpcAppels.push({ nom, args });
    return Promise.resolve({ data: null, error: null });
  }
  return { supabaseAdmin: { from, rpc } };
});

vi.mock("@/src/lib/verifierPermission", () => ({
  verifierPermission: () => Promise.resolve({ userId: "u1" }),
}));
vi.mock("@/src/lib/avoirs", () => ({
  getSoldeAvoir: () => Promise.resolve(H.parametres.solde_avoir ? Number(H.parametres.solde_avoir) : 0),
  getAvoirAppliqueReservation: () => Promise.resolve(0),
}));
vi.mock("@/src/lib/comptaResa", () => ({ synchroniserComptaResa: () => Promise.resolve() }));
vi.mock("@/src/lib/journalEvenements", () => ({ tracerEvenement: () => Promise.resolve() }));
vi.mock("@/src/lib/factureDocument", () => ({
  finaliserEmission: () => Promise.resolve(),
  envoyerFactureParEmail: () => Promise.resolve({}),
  genererPdfFacture: () => Promise.resolve(null),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { encaisser, annulerPaiement } from "@/app/(admin)/factures/actions";

function fd(over: Record<string, string> = {}) {
  const f = new FormData();
  f.set("facture_id", "f1");
  f.set("montant", "250");
  f.set("mode", "virement");
  f.set("date_paiement", AUJOURDHUI);
  for (const [k, v] of Object.entries(over)) {
    if (v === "") f.delete(k); else f.set(k, v);
  }
  return f;
}

beforeEach(() => {
  H.factures = {
    f1: {
      id: "f1", client_id: "c1", numero: "FAC-2026-0001", type: "facture", statut: "envoyee",
      date_facture: `${ANNEE}-01-10`, montant_total: 250, montant_paye: 0, montant_restant: 250,
    },
    brouillon: {
      id: "brouillon", client_id: "c1", numero: null, type: "facture", statut: "brouillon",
      date_facture: `${ANNEE}-01-10`, montant_total: 100, montant_paye: 0, montant_restant: 100,
    },
    annulee: {
      id: "annulee", client_id: "c1", numero: "FAC-2026-0002", type: "facture", statut: "annulee_par_avoir",
      date_facture: `${ANNEE}-01-10`, montant_total: 100, montant_paye: 0, montant_restant: 0,
    },
  };
  H.reservations = {
    r1: {
      id: "r1", client_id: "c9", created_at: `${ANNEE}-01-05T09:00:00Z`, statut: "validee",
      montant_final: 100, montant_calcule: 100, montant_paye: 0,
    },
  };
  H.parametres = { arrondi_especes: "true", solde_avoir: "0" };
  H.exercices = [{ annee: ANNEE - 1, statut: "ouvert" }, { annee: ANNEE, statut: "ouvert" }];
  H.paiements = [];
  H.clesVues.clear();
  H.majFactures.length = 0;
  H.avoirsInseres.length = 0;
  H.rpcAppels.length = 0;
});

describe("le client vient toujours du serveur", () => {
  it("le client enregistré est celui de la facture", async () => {
    const res = await encaisser(fd());
    expect(res.error).toBeUndefined();
    expect(H.paiements[0].client_id).toBe("c1");
  });

  it("un client_id envoyé par le navigateur est ignoré", async () => {
    const f = fd();
    f.set("client_id", "client-usurpe");
    await encaisser(f);
    expect(H.paiements[0].client_id).toBe("c1");
  });

  it("sur une réservation, le client vient de la réservation", async () => {
    await encaisser(fd({ facture_id: "", reservation_id: "r1", montant: "100" }));
    expect(H.paiements[0].client_id).toBe("c9");
  });
});

describe("un versement, jamais un cumul", () => {
  it("le montant enregistré est celui du versement", async () => {
    await encaisser(fd({ montant: "100" }));
    expect(Number(H.paiements[0].montant)).toBe(100);
  });

  it("un versement partiel laisse la facture partiellement payée", async () => {
    await encaisser(fd({ montant: "100" }));
    const maj = H.majFactures.find((m) => m.id === "f1");
    expect(maj?.vals.montant_paye).toBe(100);
    expect(maj?.vals.montant_restant).toBe(150);
    expect(maj?.vals.statut).toBe("partiellement_reglee");
  });

  it("deux versements successifs soldent la facture", async () => {
    await encaisser(fd({ montant: "100" }));
    await encaisser(fd({ montant: "150" }));
    expect(H.paiements).toHaveLength(2);
    const maj = H.majFactures[H.majFactures.length - 1];
    expect(maj.vals.montant_paye).toBe(250);
    expect(maj.vals.statut).toBe("acquittee");
  });

  it("un versement supérieur au reste est plafonné", async () => {
    await encaisser(fd({ montant: "400" }));
    expect(Number(H.paiements[0].montant)).toBe(250);
  });

  it("encaisser une facture déjà soldée est refusé", async () => {
    await encaisser(fd({ montant: "250" }));
    const res = await encaisser(fd({ montant: "50" }));
    expect(res.error).toContain("déjà soldée");
  });
});

describe("idempotence du versement", () => {
  it("un double clic n'enregistre qu'un seul versement", async () => {
    const cle = "f1:250.00:x";
    await encaisser(fd({ cle_idempotence: cle }));
    const deux = await encaisser(fd({ cle_idempotence: cle }));
    expect(deux.error).toBeUndefined();
    expect(H.paiements).toHaveLength(1);
  });

  it("sans clé, deux versements distincts restent possibles", async () => {
    await encaisser(fd({ montant: "100" }));
    await encaisser(fd({ montant: "150" }));
    expect(H.paiements).toHaveLength(2);
  });
});

describe("arrondi des espèces", () => {
  it("un montant en espèces est arrondi aux 5 centimes", async () => {
    H.factures.f1.montant_total = 10.02;
    H.factures.f1.montant_restant = 10.02;
    const res = await encaisser(fd({ mode: "cash", montant: "10.02" }));
    expect(res.arrondi).toBe(-0.02);
    expect(Number(H.paiements[0].montant)).toBe(10.02);
    expect(Number(H.paiements[0].arrondi)).toBe(-0.02);
  });

  it("les autres modes ne sont jamais arrondis", async () => {
    H.factures.f1.montant_total = 10.02;
    H.factures.f1.montant_restant = 10.02;
    await encaisser(fd({ mode: "twint", montant: "10.02" }));
    expect(Number(H.paiements[0].arrondi)).toBe(0);
  });

  it("le paramètre désactivé supprime l'arrondi", async () => {
    H.parametres.arrondi_especes = "false";
    H.factures.f1.montant_total = 10.02;
    H.factures.f1.montant_restant = 10.02;
    const res = await encaisser(fd({ mode: "cash", montant: "10.02" }));
    expect(res.arrondi).toBe(0);
  });
});

describe("pièces refusées", () => {
  it("un brouillon ne s'encaisse pas", async () => {
    const res = await encaisser(fd({ facture_id: "brouillon" }));
    expect(res.error).toContain("pas encore émise");
  });

  it("une facture soldée par un avoir non plus", async () => {
    const res = await encaisser(fd({ facture_id: "annulee" }));
    expect(res.error).toContain("annulée");
  });

  it("un mode inconnu est refusé", async () => {
    const res = await encaisser(fd({ mode: "bitcoin" }));
    expect(res.error).toContain("Mode de paiement invalide");
  });

  it("payer par avoir sans solde suffisant est refusé", async () => {
    const res = await encaisser(fd({ mode: "avoir" }));
    expect(res.error).toContain("Avoir insuffisant");
    expect(H.paiements).toHaveLength(0);
  });

  it("payer par avoir avec un solde suffisant consomme l'avoir", async () => {
    H.parametres.solde_avoir = "300";
    const res = await encaisser(fd({ mode: "avoir" }));
    expect(res.error).toBeUndefined();
    expect(H.avoirsInseres[0].type).toBe("utilisation");
    expect(Number(H.avoirsInseres[0].montant)).toBe(-250);
  });
});

describe("bornes de la date de paiement", () => {
  it("dans le futur : refusé", async () => {
    const demain = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const res = await encaisser(fd({ date_paiement: demain }));
    expect(res.error).toContain("futur");
  });

  it("avant la facture : refusé", async () => {
    const res = await encaisser(fd({ date_paiement: `${ANNEE}-01-09` }));
    expect(res.error).toContain("antérieure");
  });

  it("dans un exercice clôturé : refusé", async () => {
    H.exercices = [{ annee: ANNEE, statut: "ouvert" }];
    H.factures.f1.date_facture = `${ANNEE - 1}-01-10`;
    const res = await encaisser(fd({ date_paiement: `${ANNEE - 1}-06-01` }));
    expect(res.error).toContain("clôturé");
  });

  it("une date valide passe", async () => {
    const res = await encaisser(fd({ date_paiement: `${ANNEE}-01-10` }));
    expect(res.error).toBeUndefined();
  });
});

describe("annulation d'un encaissement", () => {
  beforeEach(async () => {
    await encaisser(fd({ montant: "250" }));
    H.paiements[0].id = "p1";
  });

  it("le motif est obligatoire", async () => {
    const f = new FormData();
    f.set("paiement_id", "p1");
    const res = await annulerPaiement(f);
    expect(res.error).toContain("motif est obligatoire");
  });

  it("le versement est contre-passé, jamais effacé", async () => {
    const f = new FormData();
    f.set("paiement_id", "p1");
    f.set("motif", "Erreur de saisie");
    f.set("destination", "rembourser");
    const res = await annulerPaiement(f);
    expect(res.error).toBeUndefined();
    expect(H.paiements).toHaveLength(2);
    expect(Number(H.paiements[1].montant)).toBe(-250);
  });

  it("mise en avoir : la trésorerie ne bouge pas, le client est crédité", async () => {
    const f = new FormData();
    f.set("paiement_id", "p1");
    f.set("motif", "Séjour annulé");
    f.set("destination", "avoir");
    await annulerPaiement(f);
    expect(H.paiements[1].mode).toBe("avoir");
    expect(H.avoirsInseres[0].type).toBe("mise_en_avoir");
    expect(Number(H.avoirsInseres[0].montant)).toBe(250);
  });
});
