import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * APP 73 (point 19, signalé par APP 74) — modifier une réservation, TOUT OU
 * RIEN. Quand la nouvelle place en box est refusée, la réservation garde son
 * box, ses dates et tout le reste, et le message s'affiche.
 *
 * La vraie route est appelée. La base est un double en mémoire, qui joue aussi
 * le filet `bloquer_surbooking_box` : on peut lui faire refuser une insertion,
 * pour le cas où une autre écriture passe entre la vérification et le
 * déplacement.
 */

type Ligne = Record<string, unknown>;

const H = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  ecritures: [] as string[],
  boxRefuse: null as string | null,
  boxSeulAppels: [] as boolean[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/src/utils/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/src/lib/apiAuth", () => ({ exigerPermissionApi: async () => null }));
vi.mock("@/src/lib/permissions", () => ({ idUtilisateurCourant: async () => "u1" }));
vi.mock("@/src/lib/journalEvenements", () => ({ tracerEvenement: async () => { H.ecritures.push("journal"); } }));
vi.mock("@/src/lib/horairesServeur", async () => {
  const { HORAIRES_DEFAUT } = await import("@/src/lib/horaires");
  return { lireHoraires: async () => HORAIRES_DEFAUT };
});
vi.mock("@/app/(admin)/(espace-clients)/reservations/[id]/actions", () => ({
  definirBoxSeul: async (id: string, v: boolean) => {
    H.boxSeulAppels.push(v);
    const r = H.tables.reservations.find((x) => x.id === id)!;
    r.box_seul = v;
    return {};
  },
  recalculerMontantSejour: async () => { H.ecritures.push("recalcul"); return {}; },
}));
vi.mock("@/src/lib/supabase-admin", () => {
  const joindre = (table: string, rows: Record<string, unknown>[], colonnes: string) => rows.map((row) => {
    const r = { ...row };
    const liens = (resaId: unknown) => H.tables.reservation_chiens
      .filter((rc) => rc.reservation_id === resaId)
      .map((rc) => ({ chien_id: rc.chien_id, chiens: { doit_etre_isole: rc.isole === true } }));
    if (table === "reservations" && colonnes.includes("reservation_chiens")) r.reservation_chiens = liens(row.id);
    if (table === "occupation_boxes" && colonnes.includes("reservations (")) {
      const resa = H.tables.reservations.find((x) => x.id === row.reservation_id);
      r.reservations = resa ? { ...resa, reservation_chiens: liens(resa.id) } : null;
    }
    return r;
  });

  function from(table: string) {
    const filtres: ((r: Record<string, unknown>) => boolean)[] = [];
    let op: "select" | "update" | "delete" | "insert" = "select";
    let colonnes = "";
    let valeurs: unknown = null;
    const lignes = () => (H.tables[table] ?? []).filter((r) => filtres.every((f) => f(r)));
    const executer = (): { data: unknown; error: { message: string } | null } => {
      if (op === "select") return { data: joindre(table, lignes(), colonnes), error: null };
      if (op === "update") {
        for (const r of lignes()) Object.assign(r, valeurs);
        H.ecritures.push(`update ${table}`);
        return { data: null, error: null };
      }
      if (op === "delete") {
        const garder = (H.tables[table] ?? []).filter((r) => !filtres.every((f) => f(r)));
        H.tables[table] = garder;
        H.ecritures.push(`delete ${table}`);
        return { data: null, error: null };
      }
      const nouvelles = (Array.isArray(valeurs) ? valeurs : [valeurs]) as Record<string, unknown>[];
      // Le filet en base, joué par le double.
      if (table === "occupation_boxes" && nouvelles.some((n) => n.box_id === H.boxRefuse)) {
        return { data: null, error: { message: "Ce box est déjà occupé (filet en base)." } };
      }
      H.tables[table] = [...(H.tables[table] ?? []), ...nouvelles.map((n) => ({ id: n.id ?? `neuf-${Math.random()}`, ...n }))];
      H.ecritures.push(`insert ${table}`);
      return { data: null, error: null };
    };
    const chain: Record<string, unknown> = {
      select: (c = "*") => { colonnes = c; return chain; },
      eq: (c: string, v: unknown) => { filtres.push((r) => r[c] === v); return chain; },
      neq: (c: string, v: unknown) => { filtres.push((r) => r[c] !== v); return chain; },
      lt: (c: string, v: string) => { filtres.push((r) => String(r[c]) < v); return chain; },
      gt: (c: string, v: string) => { filtres.push((r) => String(r[c]) > v); return chain; },
      update: (v: unknown) => { op = "update"; valeurs = v; return chain; },
      delete: () => { op = "delete"; return chain; },
      insert: (v: unknown) => { op = "insert"; valeurs = v; return chain; },
      single: () => { const r = executer(); return Promise.resolve({ ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }); },
      maybeSingle: () => { const r = executer(); return Promise.resolve({ ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }); },
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(executer()).then(ok, ko),
    };
    return chain;
  }
  return { supabaseAdmin: { from } };
});

const { POST } = await import("@/app/api/reservations/[id]/modifier/route");
const { MESSAGE_BOX_OCCUPE } = await import("@/src/lib/placementBox");

const DEBUT = "2026-11-10";
const FIN = "2026-11-12";

function decor() {
  H.tables = {
    reservations: [
      { id: "R", client_id: "C1", type_reservation: "sejour", date_debut: DEBUT, date_fin: FIN,
        heure_arrivee: "17:00", heure_depart: "10:00", type_sejour: "pension", numero: "R-1",
        statut: "validee", box_id: "B1", commentaire_admin: null, box_seul: false },
      { id: "AUTRE", client_id: "C2", type_reservation: "sejour", date_debut: DEBUT, date_fin: FIN,
        statut: "validee", box_id: "B2", box_seul: false },
    ],
    occupation_boxes: [
      { id: "o1", box_id: "B1", chien_id: "k1", reservation_id: "R", date_debut: DEBUT, date_fin: FIN, created_at: "2026-10-01T10:00:00Z" },
      { id: "o2", box_id: "B2", chien_id: "k2", reservation_id: "AUTRE", date_debut: DEBUT, date_fin: FIN, created_at: "2026-10-01T10:00:00Z" },
    ],
    reservation_chiens: [
      { reservation_id: "R", chien_id: "k1" },
      { reservation_id: "AUTRE", chien_id: "k2" },
    ],
    checkin_checkout: [],
  };
  H.ecritures = [];
  H.boxRefuse = null;
  H.boxSeulAppels = [];
}

function envoyer(champs: Record<string, string>) {
  const fd = new FormData();
  const tout: Record<string, string> = {
    statut: "validee", box_id: "B1", date_debut: DEBUT, date_fin: FIN,
    heure_arrivee: "17:00", heure_depart: "10:00", type_sejour: "pension",
    commentaire_admin: "", ...champs,
  };
  for (const [k, v] of Object.entries(tout)) fd.set(k, v);
  const req = new NextRequest("http://localhost/api/reservations/R/modifier", { method: "POST", body: fd });
  return POST(req, { params: Promise.resolve({ id: "R" }) });
}

const etat = () => JSON.parse(JSON.stringify({
  resa: H.tables.reservations.find((r) => r.id === "R"),
  // L'ordre des lignes ne compte pas ; leur contenu, si.
  occupations: [...H.tables.occupation_boxes].sort((a, b) => String(a.id).localeCompare(String(b.id))),
})) as { resa: Ligne; occupations: Ligne[] };

beforeEach(decor);

describe("le nouveau box est déjà pris : rien ne bouge", () => {
  it("box d'un autre client, et d'autres changements dans le même envoi", async () => {
    const avant = etat();
    const r = await envoyer({ box_id: "B2", commentaire_admin: "nouveau commentaire", date_fin: "2026-11-13" });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe(MESSAGE_BOX_OCCUPE);
    // Même box, mêmes données qu'avant ; aucune écriture.
    expect(etat()).toEqual(avant);
    expect(H.ecritures).toEqual([]);
  });

  it("la case « box seul » cochée en même temps ne s'enregistre pas non plus", async () => {
    const avant = etat();
    const r = await envoyer({ box_id: "B2", box_seul: "on" });
    expect(r.status).toBe(409);
    expect(H.boxSeulAppels).toEqual([]);
    expect(etat()).toEqual(avant);
  });
});

describe("la base refuse au dernier moment : l'ancienne place revient", () => {
  it("même box, mêmes lignes d'occupation (mêmes identifiants), réservation intacte", async () => {
    const avant = etat();
    H.boxRefuse = "B3"; // libre à la vérification, refusé à l'insertion
    const r = await envoyer({ box_id: "B3", commentaire_admin: "nouveau commentaire" });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toContain("filet en base");
    expect(etat()).toEqual(avant);
    expect(H.ecritures).not.toContain("update reservations");
    expect(H.ecritures).not.toContain("journal");
  });

  it("la case « box seul » reprend sa valeur", async () => {
    H.boxRefuse = "B3";
    const r = await envoyer({ box_id: "B3", box_seul: "on" });
    expect(r.status).toBe(409);
    expect(H.boxSeulAppels).toEqual([true, false]);
    expect(etat().resa.box_seul).toBe(false);
  });
});

describe("témoin : un box libre", () => {
  it("le déplacement et les autres changements s'enregistrent", async () => {
    const r = await envoyer({ box_id: "B3", commentaire_admin: "nouveau commentaire" });
    expect(r.status).toBe(200);
    const apres = etat();
    expect(apres.resa.box_id).toBe("B3");
    expect(apres.resa.commentaire_admin).toBe("nouveau commentaire");
    expect(apres.occupations.filter((o) => o.reservation_id === "R").map((o) => o.box_id)).toEqual(["B3"]);
  });

  it("le même client peut partager son box (rien n'a changé là)", async () => {
    H.tables.reservations[1].client_id = "C1";
    const r = await envoyer({ box_id: "B2" });
    expect(r.status).toBe(200);
  });
});
