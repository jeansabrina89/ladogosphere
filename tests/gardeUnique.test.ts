import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * La garde unique (src/lib/garde.ts) et la porte des tâches planifiées
 * (src/lib/cron.ts).
 *
 * Les règles sont pures : on les éprouve directement. Le reste — la garde
 * posée en première ligne, la route séparée, la révocation des sessions — se
 * lit dans le code, et c'est ce que vérifie la seconde partie.
 */

vi.mock("@sentry/nextjs", () => ({ captureMessage: () => {}, captureException: () => {} }));

import { deciderGarde, permissionsEffectives, AccesRefuse } from "@/src/lib/garde";
import { verifierCron } from "@/src/lib/cron";
import { PERMISSIONS_PERSONNEL } from "@/src/lib/permissionsCatalogue";

const lire = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

const appelant = (
  role: string | null,
  perms: Partial<Record<(typeof PERMISSIONS_PERSONNEL)[number], boolean>> = {},
  actif = true,
) => ({ role, actif, permissions: permissionsEffectives(role, perms as Record<string, unknown>) });

// ── La règle ───────────────────────────────────────────────────────────────

describe("deciderGarde", () => {
  it("sans session : refus, et c'est un 401", () => {
    const d = deciderGarde(null, {});
    expect(d).toMatchObject({ ok: false, motif: "non_connecte" });
    expect(new AccesRefuse("non_connecte", "x").statut).toBe(401);
  });

  it("profil désactivé : refus, même pour l'admin", () => {
    expect(deciderGarde(appelant("employe", { perm_checkin: true }, false), {}))
      .toMatchObject({ ok: false, motif: "inactif" });
    expect(deciderGarde(appelant("admin", {}, false), {}))
      .toMatchObject({ ok: false, motif: "inactif" });
    expect(new AccesRefuse("inactif", "x").statut).toBe(403);
  });

  it("l'admin passe toujours, permission demandée ou non", () => {
    expect(deciderGarde(appelant("admin"), {})).toEqual({ ok: true });
    expect(deciderGarde(appelant("admin"), { permissions: ["perm_depenses"] })).toEqual({ ok: true });
    expect(deciderGarde(appelant("admin"), { adminSeul: true })).toEqual({ ok: true });
  });

  it("un client ne passe pas une porte du personnel, même avec les colonnes à vrai", () => {
    const client = appelant("client", { perm_checkin: true, perm_encaissements: true });
    expect(deciderGarde(client, {})).toMatchObject({ ok: false, motif: "role" });
    expect(deciderGarde(client, { permissions: ["perm_checkin"] })).toMatchObject({ ok: false, motif: "role" });
    // Un rôle client garde ses portes à lui : rien n'est exigé du personnel.
    expect(deciderGarde(client, { personnel: false })).toEqual({ ok: true });
  });

  it("un employé : sa permission ou rien, et jamais une porte réservée à l'admin", () => {
    const employe = appelant("employe", { perm_checkin: true });
    expect(deciderGarde(employe, { permissions: ["perm_checkin"] })).toEqual({ ok: true });
    expect(deciderGarde(employe, { permissions: ["perm_depenses"] }))
      .toMatchObject({ ok: false, motif: "permission" });
    expect(deciderGarde(employe, { permissions: ["perm_checkin", "perm_depenses"] }))
      .toMatchObject({ ok: false, motif: "permission" });
    expect(deciderGarde(employe, { adminSeul: true })).toMatchObject({ ok: false, motif: "role" });
    expect(deciderGarde(employe, {})).toEqual({ ok: true });
  });

  it("la gestion de la boutique emporte la vente, comme peut_boutique()", () => {
    const gestionnaire = appelant("employe", { perm_boutique_gestion: true });
    expect(deciderGarde(gestionnaire, { permissions: ["perm_boutique_vente"] })).toEqual({ ok: true });
    const vendeuse = appelant("employe", { perm_boutique_vente: true });
    expect(deciderGarde(vendeuse, { permissions: ["perm_boutique_gestion"] }))
      .toMatchObject({ ok: false, motif: "permission" });
  });

  it("l'admin a toutes les permissions du catalogue, l'employé seulement les siennes", () => {
    const admin = permissionsEffectives("admin", {});
    for (const p of PERMISSIONS_PERSONNEL) expect(admin[p]).toBe(true);
    const employe = permissionsEffectives("employe", { perm_box: true });
    expect(employe.perm_box).toBe(true);
    expect(employe.perm_encaissements).toBe(false);
  });
});

// ── La porte des crons ─────────────────────────────────────────────────────

describe("verifierCron", () => {
  const SECRET = "un-secret-de-cron-assez-long-0923";
  const requete = (entete?: string) =>
    new Request("http://localhost/api/cron/quotidien-matin", {
      headers: entete === undefined ? {} : { authorization: entete },
    });

  beforeEach(() => { vi.stubEnv("CRON_SECRET", SECRET); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("(a) variable absente : 500, et la tâche ne tourne pas", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const r = verifierCron(requete(`Bearer ${SECRET}`), "quotidien-matin");
    expect(r?.status).toBe(500);
    expect(await r!.json()).toMatchObject({ error: expect.stringContaining("non configurée") });
  });

  it("(a bis) variable vide d'espaces : même refus", () => {
    vi.stubEnv("CRON_SECRET", "   ");
    expect(verifierCron(requete("Bearer    "), "quotidien-matin")?.status).toBe(500);
  });

  it("(b) « Bearer undefined » : 401 — c'est le trou d'avant", () => {
    expect(verifierCron(requete("Bearer undefined"), "quotidien-matin")?.status).toBe(401);
  });

  it("(c) mauvais secret, secret vide, en-tête absent : 401", () => {
    expect(verifierCron(requete(`Bearer ${SECRET}x`), "rappel-veille")?.status).toBe(401);
    expect(verifierCron(requete("Bearer autre-chose"), "rappel-veille")?.status).toBe(401);
    expect(verifierCron(requete(), "rappel-veille")?.status).toBe(401);
    expect(verifierCron(requete(SECRET), "rappel-veille")?.status).toBe(401);
  });

  it("(d) bon secret : la tâche passe", () => {
    expect(verifierCron(requete(`Bearer ${SECRET}`), "quotidien-matin")).toBeNull();
  });

  it("compare en temps constant, sur des tampons de même longueur", () => {
    const src = lire("src", "lib", "cron.ts");
    expect(src).toContain("timingSafeEqual");
    expect(src).toMatch(/recu\.length !== attendu\.length \|\| !timingSafeEqual/);
  });

  it("les deux crons passent par cette porte, et par elle seule", () => {
    for (const tache of ["quotidien-matin", "rappel-veille"]) {
      const src = lire("app", "api", "cron", tache, "route.ts");
      expect(src).toMatch(/const refus = verifierCron\(req, "/);
      expect(src).not.toContain("process.env.CRON_SECRET");
    }
  });
});

// ── Ce que le code doit dire ───────────────────────────────────────────────

describe("les quatre portes fermées", () => {
  it("basculerFicheEnInterne exige l'admin en première ligne", () => {
    const src = lire("app", "(client)", "mon-compte", "actionsPersonnel.ts");
    const corps = src.slice(src.indexOf("export async function basculerFicheEnInterne"));
    const premiere = corps.split("\n").find((l) => l.includes("await"));
    expect(premiere).toContain('exigerAdmin("basculerFicheEnInterne")');
    // Le layout client ne passe plus par l'action : il appelle le helper serveur.
    const layout = lire("app", "(client)", "layout.tsx");
    expect(layout).toContain("basculerFicheEnInterneServeur");
    expect(layout).not.toContain("actionsPersonnel");
    // Le helper n'est pas une action : aucune directive en tête de fichier.
    expect(lire("src", "lib", "ficheInterne.ts").trimStart().startsWith('"use server"')).toBe(false);
  });

  it("l'identité de paiement a sa route, réservée à l'admin ; les tarifs n'y touchent plus", () => {
    const entite = lire("app", "api", "entite", "coordonnees", "route.ts");
    expect(entite).toContain('exigerAdmin("coordonnees_entite")');
    expect(entite).toContain('from("entites_juridiques")');
    expect(entite).toContain("tracerEvenement");
    const tarifs = lire("app", "api", "tarifs", "route.ts");
    expect(tarifs).toContain('exigerAdmin("tarifs")');
    expect(tarifs).not.toContain("entites_juridiques");
    expect(tarifs).not.toContain("iban");
    // Plus aucune route ne garde l'entité derrière le simple personnel.
    expect(tarifs).not.toContain("exigerPersonnel");
  });

  it("désactiver un employé révoque ses sessions", () => {
    const src = lire("app", "(admin)", "(espace-equipe)", "employes", "[id]", "modifier", "actions.ts");
    expect(src).toMatch(/const desactive = avant\?\.actif !== false && formData\.get\("actif"\) !== "on"/);
    expect(src).toMatch(/if \(desactive\) \{\s*await supabaseAdmin\.rpc\("revoquer_sessions", \{ p_user_id: profil_id \}\)/);
    const migration = lire("supabase", "migrations", "20260922144855_securite_revoquer_sessions.sql");
    expect(migration).toContain("delete from auth.sessions where user_id = p_user_id");
    expect(migration).toContain("revoke execute on function public.revoquer_sessions(uuid) from public, anon, authenticated;");
  });

  it("les gardes historiques passent toutes par la garde unique", () => {
    const perms = lire("src", "lib", "permissions.ts");
    for (const g of [
      "exigerPersonnel", "exigerPermissionApi", "verifierPermission", "verifierAdmin",
      "exigerAdminApi", "verifierPermissionBoutique", "exigerBoutiqueApi", "getProfilePerms",
    ]) {
      expect(perms).toContain(`export async function ${g}`);
    }
    // Plus une seule lecture de rôle à la main dans ce fichier ni dans les pages.
    expect(perms).not.toContain('select("role")');
    expect(perms).toContain('from "./garde"');
    expect(lire("src", "lib", "accesAdmin.ts")).toContain("lireAppelant");
  });

  it("le refus laisse une trace, sans donnée sensible", () => {
    const src = lire("src", "lib", "garde.ts");
    const bloc = src.slice(src.indexOf("export async function journaliserRefus"), src.indexOf("export async function verifierAppelant"));
    expect(bloc).toContain('entite: "acces"');
    expect(bloc).toContain('evenement: "refus"');
    expect(bloc).toMatch(/action,\s*\n\s*motif,/);
    for (const interdit of ["corps", "body", "formData", "email"]) expect(bloc).not.toContain(interdit);
  });
});
