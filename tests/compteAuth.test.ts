import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  MESSAGE_CLE_ABSENTE,
  choisirCompte,
  compteAuthParEmail,
  normaliserEmail,
} from "@/src/lib/compteAuth";

/**
 * Le rattachement d'une fiche client à son compte Auth.
 *
 * La recherche a le droit de ne rien trouver. Elle n'a pas le droit d'échouer
 * en silence : une fiche créée sans son rattachement ressemble en tout point à
 * une fiche dont le client n'a pas de compte.
 */

const OPTIONS = { url: "https://exemple.test", cle: "cle-de-service" };

/** Une réponse HTTP minimale, pour n'avoir rien à simuler de plus. */
function reponse(corps: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corps,
  } as unknown as Response;
}

describe("le compte retenu", () => {
  it("est celui dont l’adresse est exactement la même", () => {
    expect(choisirCompte([{ id: "a", email: "jean@x.ch" }], "jean@x.ch")).toBe("a");
  });

  it("ignore la casse et les espaces, des deux côtés", () => {
    expect(choisirCompte([{ id: "a", email: "Jean@X.CH" }], "  jean@x.ch ")).toBe("a");
    expect(choisirCompte([{ id: "a", email: "jean@x.ch" }], "JEAN@X.CH")).toBe("a");
  });

  it("refuse une adresse qui CONTIENT la cible sans lui être égale", () => {
    // Le filtre de l'API cherche une sous-chaîne : sans cette égalité, une
    // fiche se rattacherait au compte de quelqu'un d'autre.
    expect(choisirCompte([{ id: "b", email: "paul+jean@x.ch" }], "jean@x.ch")).toBeNull();
    expect(choisirCompte([{ id: "b", email: "jean@x.ch.net" }], "jean@x.ch")).toBeNull();
  });

  it("choisit la bonne quand l’API en rend plusieurs", () => {
    expect(choisirCompte(
      [{ id: "b", email: "paul+jean@x.ch" }, { id: "a", email: "jean@x.ch" }],
      "jean@x.ch"
    )).toBe("a");
  });

  it("rend null sur une liste vide, une liste absente ou une adresse vide", () => {
    expect(choisirCompte([], "jean@x.ch")).toBeNull();
    expect(choisirCompte(null, "jean@x.ch")).toBeNull();
    expect(choisirCompte([{ id: "a", email: "jean@x.ch" }], "")).toBeNull();
  });

  it("normalise sans jamais rendre autre chose qu’une chaîne", () => {
    expect(normaliserEmail(null)).toBe("");
    expect(normaliserEmail(undefined)).toBe("");
    expect(normaliserEmail("  A@B.CH ")).toBe("a@b.ch");
  });
});

describe("le rattachement à la création", () => {
  it("rend l’identifiant quand le compte existe", async () => {
    const r = await compteAuthParEmail("jean@x.ch", {
      ...OPTIONS,
      fetchImpl: async () => reponse({ users: [{ id: "u-1", email: "jean@x.ch" }] }),
    });
    expect(r).toEqual({ ok: true, id: "u-1" });
  });

  it("rend null — et non une erreur — quand l’adresse n’a pas de compte", async () => {
    // Pas de compte est un RÉSULTAT : la fiche se crée, sans rattachement.
    const r = await compteAuthParEmail("personne@x.ch", {
      ...OPTIONS,
      fetchImpl: async () => reponse({ users: [] }),
    });
    expect(r).toEqual({ ok: true, id: null });
  });

  it("interroge l’API avec un filtre, et n’énumère rien", async () => {
    let vue = "";
    await compteAuthParEmail("Jean@X.ch", {
      ...OPTIONS,
      fetchImpl: async (url) => { vue = String(url); return reponse({ users: [] }); },
    });
    expect(vue).toContain("/auth/v1/admin/users?filter=");
    expect(vue).toContain(encodeURIComponent("jean@x.ch"));
  });

  it("accepte aussi un tableau nu, si l’API le rend ainsi", async () => {
    const r = await compteAuthParEmail("jean@x.ch", {
      ...OPTIONS,
      fetchImpl: async () => reponse([{ id: "u-1", email: "jean@x.ch" }]),
    });
    expect(r).toEqual({ ok: true, id: "u-1" });
  });

  it("une adresse vide ne déclenche aucun appel", async () => {
    let appels = 0;
    const r = await compteAuthParEmail("  ", {
      ...OPTIONS,
      fetchImpl: async () => { appels += 1; return reponse({ users: [] }); },
    });
    expect(r).toEqual({ ok: true, id: null });
    expect(appels).toBe(0);
  });
});

describe("une recherche qui échoue ne passe jamais pour « aucun compte »", () => {
  it("une réponse 500 est une ERREUR, pas une absence", async () => {
    // C'est le défaut exact qui a été reproduit : l'API répondait 500 avec un
    // tableau vide, et le code lisait « aucun compte ne correspond ».
    const r = await compteAuthParEmail("jean@x.ch", {
      ...OPTIONS,
      fetchImpl: async () => reponse({ users: [] }, 500),
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toContain("500");
    expect(r.ok === false && r.message).toContain("n'a pas été créée");
  });

  it("chaque code d’erreur remonte, aucun ne se tait", async () => {
    for (const status of [400, 401, 403, 404, 429, 500, 502, 503]) {
      const r = await compteAuthParEmail("jean@x.ch", {
        ...OPTIONS,
        fetchImpl: async () => reponse({}, status),
      });
      expect(r.ok, String(status)).toBe(false);
    }
  });

  it("une panne réseau remonte", async () => {
    const r = await compteAuthParEmail("jean@x.ch", {
      ...OPTIONS,
      fetchImpl: async () => { throw new Error("ECONNRESET"); },
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toContain("ECONNRESET");
  });

  it("une réponse illisible ou inattendue remonte", async () => {
    const illisible = await compteAuthParEmail("jean@x.ch", {
      ...OPTIONS,
      fetchImpl: async () => ({
        ok: true, status: 200, json: async () => { throw new Error("pas du JSON"); },
      } as unknown as Response),
    });
    expect(illisible.ok).toBe(false);

    const inattendue = await compteAuthParEmail("jean@x.ch", {
      ...OPTIONS,
      fetchImpl: async () => reponse({ message: "coucou" }),
    });
    expect(inattendue.ok).toBe(false);
  });

  it("une clé de service absente remonte, plutôt que de chercher sans elle", async () => {
    const r = await compteAuthParEmail("jean@x.ch", { url: "https://exemple.test", cle: "" });
    expect(r).toEqual({ ok: false, message: MESSAGE_CLE_ABSENTE });
  });
});

// ── Le dépôt : plus personne n'énumère les comptes ────────────────────────

const RACINE = join(__dirname, "..");

function fichiers(dossier: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier)) {
    if (entree === "node_modules" || entree === ".next") continue;
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiers(chemin));
    else if (/[.]tsx?$/.test(entree)) trouves.push(chemin);
  }
  return trouves;
}

const SOURCES = ["app", "src"]
  .flatMap((d) => fichiers(join(RACINE, d)))
  .map((chemin) => ({
    chemin: chemin.slice(RACINE.length + 1).split("\\").join("/"),
    contenu: readFileSync(chemin, "utf8"),
  }));

describe("aucune énumération des comptes Auth", () => {
  it("le dépôt est bien relu (garde-fou du garde-fou)", () => {
    expect(SOURCES.length).toBeGreaterThan(200);
    expect(SOURCES.some((f) => f.chemin === "src/lib/compteAuth.ts")).toBe(true);
  });

  it("`listUsers` n’est plus appelé nulle part", () => {
    // Elle ne rend que la première page — cinquante comptes — et, le jour où
    // l'API répond 500, un tableau vide qui se lit comme « rien trouvé ».
    // Seul le module qui la remplace a le droit de la nommer : c'est lui qui
    // explique pourquoi on ne s'en sert plus.
    const coupables = SOURCES
      .filter((f) => f.chemin !== "src/lib/compteAuth.ts")
      .filter((f) => /\blistUsers\s*\(/.test(f.contenu))
      .map((f) => f.chemin);
    expect(coupables).toEqual([]);
  });

  it("aucune autre énumération non plus", () => {
    // createUser, updateUserById, deleteUser et getUserById restent légitimes :
    // ils visent UN compte déjà connu. Seule l'énumération est proscrite.
    const coupables = SOURCES
      .filter((f) => f.chemin !== "src/lib/compteAuth.ts")
      .filter((f) => /auth\.admin\.(listUsers|getUsers)\b/.test(f.contenu))
      .map((f) => f.chemin);
    expect(coupables).toEqual([]);
  });

  it("la création d'une fiche cherche le compte par son adresse", () => {
    const action = SOURCES.find(
      (f) => f.chemin === "app/(admin)/(espace-clients)/clients/nouveau/actions.ts"
    );
    expect(action).toBeDefined();
    expect(action!.contenu).toContain("compteAuthParEmail(");
    expect(action!.contenu).not.toMatch(/listUsers/);
  });

  it("et son résultat n’est jamais utilisé sans que `ok` soit vérifié", () => {
    const coupables: string[] = [];
    for (const f of SOURCES) {
      if (!f.contenu.includes("compteAuthParEmail(")) continue;
      if (f.chemin === "src/lib/compteAuth.ts") continue;
      if (!/\.ok\b/.test(f.contenu)) coupables.push(f.chemin);
    }
    expect(coupables).toEqual([]);
  });
});
