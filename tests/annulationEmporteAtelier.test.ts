import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * APP 51 — annuler une commande en ligne emporte l'atelier PAS ENCORE COMMENCÉ.
 *
 * ── CE QUI EXISTAIT AVANT, ET QUI ÉTAIT FAUX ──────────────────────────────
 *
 * Deux mécanismes se superposaient :
 *
 *  1. la fonction SQL n'annulait que « attente_paiement » ;
 *  2. l'action `annulerCommande` rebouclait ENSUITE sur les lignes et appelait
 *     `changer_statut_commande(…, 'annulee')` pour CHACUNE — sans aucun filtre
 *     de statut, et hors de la transaction.
 *
 * Le second l'emportait : une pièce « en_cours » ou « prete » était annulée
 * elle aussi. Or `changer_statut_commande` a sorti ses fournitures du stock au
 * passage en « en_cours » (`composants_consommes`), et l'annulation ne les rend
 * pas. On effaçait donc un travail fait, et l'inventaire restait faux sans que
 * rien ne le dise.
 *
 * La règle est désormais TOUTE ENTIÈRE dans la fonction SQL, donc dans la même
 * transaction que l'annulation, et l'action se contente de NOMMER ce qui reste
 * ouvert.
 */

// ── La migration ───────────────────────────────────────────────────────────

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");
const ANCRE = "function public.annuler_commande_en_ligne";

/**
 * La DERNIÈRE migration qui définit la fonction — c'est elle qui fait foi, et
 * c'est elle qu'une base reconstruite depuis le dépôt appliquera en dernier.
 * Viser un nom de fichier figé aurait laissé le test verrouiller une portée
 * que la migration suivante a déjà changée : c'est exactement ce qui est
 * arrivé au test d'APP 38.
 */
function derniereDefinition(): string {
  const f = readdirSync(MIGRATIONS)
    .filter((x) => x.endsWith(".sql"))
    .sort()
    .filter((x) => readFileSync(join(MIGRATIONS, x), "utf8").includes(ANCRE))
    .at(-1);
  if (!f) throw new Error("aucune migration ne définit annuler_commande_en_ligne");
  return readFileSync(join(MIGRATIONS, f), "utf8");
}

/** Le corps de la fonction, sans les REVOKE / GRANT qui la suivent. */
function corps(): string {
  const sql = derniereDefinition();
  return sql.slice(sql.indexOf(ANCRE));
}

describe("la dernière définition annule les deux statuts qui n'ont rien fabriqué", () => {
  it("la boucle prend « attente_paiement » ET « a_faire »", () => {
    expect(corps()).toMatch(/and cp\.statut in \('attente_paiement', 'a_faire'\)/);
  });

  it("et la mise à jour reteste le même couple, pour ne pas courir après elle-même", () => {
    /**
     * Le `where` du `update` répète la condition : entre le `select` de la
     * boucle et l'écriture, quelqu'un a pu faire passer la pièce en
     * fabrication. Sans ce retest, on l'annulerait quand même.
     */
    expect(corps()).toMatch(
      /set statut = 'annulee'\s+where id = r\.id and statut in \('attente_paiement', 'a_faire'\)/,
    );
  });

  it("« en_cours » et « prete » ne sont JAMAIS visés par la boucle", () => {
    /**
     * L'assertion inverse de la précédente, et la plus importante : elle tombe
     * si quelqu'un élargit la boucle « pour faire propre ».
     */
    const c = corps();
    expect(c).not.toMatch(/cp\.statut in \([^)]*'en_cours'/);
    expect(c).not.toMatch(/cp\.statut in \([^)]*'prete'/);
    expect(c).not.toMatch(/cp\.statut = 'en_cours'/);
    expect(c).not.toMatch(/cp\.statut = 'prete'/);
  });

  it("le journal garde le statut d'AVANT, relu sur la ligne", () => {
    /**
     * La version d'APP 38 écrivait « attente_paiement » en dur : elle ne
     * pouvait pas se tromper, puisqu'elle n'annulait que celui-là. Avec deux
     * statuts de départ, un littéral ferait mentir le journal une fois sur
     * deux.
     */
    const c = corps();
    expect(c).toMatch(/select cp\.id, cp\.numero, cp\.statut/);
    expect(c).toMatch(/jsonb_build_object\('statut', r\.statut\)/);
    expect(c).not.toMatch(/jsonb_build_object\('statut', 'attente_paiement'\)/);
  });

  it("la migration dit POURQUOI « en_cours » et « prete » restent", () => {
    // Sans la raison écrite, le prochain lot élargira la boucle en croyant
    // corriger un oubli.
    const sql = derniereDefinition();
    expect(sql).toMatch(/fournitures/i);
    expect(sql).toMatch(/en_cours/);
  });
});

describe("la fonction reste fermée", () => {
  it("REVOKE puis GRANT, sur la signature exacte", () => {
    const sql = derniereDefinition();
    expect(sql).toMatch(
      /revoke execute on function public\.annuler_commande_en_ligne\(uuid, text, uuid\) from public, anon, authenticated;/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.annuler_commande_en_ligne\(uuid, text, uuid\) to service_role;/,
    );
  });

  it("même signature, même SECURITY DEFINER, même search_path", () => {
    const c = corps();
    expect(c).toMatch(/security definer/i);
    expect(c).toMatch(/set search_path to 'public'/i);
    expect(c).toMatch(/p_commande_id uuid/);
    expect(c).toMatch(/p_motif\s+text/);
    expect(c).toMatch(/p_user_id\s+uuid/);
  });
});

// ── L'action, RPC bouchonnée ───────────────────────────────────────────────

type Atelier = { numero: string; statut: string };

const H = vi.hoisted(() => ({
  ateliers: [] as Atelier[],
  lignes: [] as { commande_personnalisee_id: string | null }[],
  rpc: [] as { nom: string; args: Record<string, unknown> }[],
  rpcErreur: null as { message: string } | null,
  filtres: [] as { col: string; vals: string[] }[],
}));

vi.mock("@/src/lib/supabase-admin", () => {
  function from(table: string) {
    const pris: string[][] = [];
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: (col: string, vals: string[]) => {
        H.filtres.push({ col, vals });
        pris.push(vals);
        return chain;
      },
      then: <T,>(onF: (v: { data: unknown; error: null }) => T) => {
        // Le second `.in` porte sur les statuts : on rend ce qu'il demande.
        const statuts = pris[1] ?? [];
        const data = table === "commandes_personnalisees"
          ? H.ateliers.filter((a) => statuts.includes(a.statut)).map((a) => ({ numero: a.numero }))
          : [];
        return Promise.resolve({ data, error: null }).then(onF);
      },
    };
    return chain;
  }
  return {
    supabaseAdmin: {
      from,
      rpc: (nom: string, args: Record<string, unknown>) => {
        H.rpc.push({ nom, args });
        return Promise.resolve({ data: null, error: H.rpcErreur });
      },
    },
  };
});

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/src/lib/permissions", () => ({
  verifierPermissionBoutique: () => Promise.resolve({ userId: "u1" }),
}));
vi.mock("@/src/lib/venteEnLigne", () => ({
  lireCommande: () => Promise.resolve({ id: "c1", statut: "confirmee", facture_id: null }),
  lignesDeCommande: () => Promise.resolve(H.lignes),
}));
vi.mock("@/src/lib/email", () => ({ envoyerEmailCommandeExpediee: () => Promise.resolve() }));
vi.mock("@/src/lib/boutique", () => ({ coutMatieresDeChoix: () => 0 }));
vi.mock("@/src/lib/personnalisation", () => ({ choixDeCommande: () => Promise.resolve([]) }));

import { annulerCommande } from "@/app/(admin)/boutique/commandes-en-ligne/actions";

beforeEach(() => {
  H.ateliers.length = 0;
  H.lignes.length = 0;
  H.rpc.length = 0;
  H.filtres.length = 0;
  H.rpcErreur = null;
});

describe("l'action nomme ce qui reste ouvert à l'atelier", () => {
  it("une pièce « en_cours » : l'avertissement, mot pour mot", async () => {
    H.lignes.push({ commande_personnalisee_id: "p1" });
    H.ateliers.push({ numero: "SM-2026-014", statut: "en_cours" });

    const r = await annulerCommande("c1", "client injoignable");

    expect(r.error).toBeUndefined();
    expect(r.avertissement).toBe(
      "Commande annulée. La fabrication de la commande d'atelier n° SM-2026-014"
      + " a déjà commencé : elle reste ouverte, à régler à la main.",
    );
    // Le geste a bien eu lieu : le message habituel ne disparaît pas.
    expect(r.message).toContain("Commande annulée, stock libéré.");
  });

  it("une pièce « prete » compte aussi", async () => {
    H.lignes.push({ commande_personnalisee_id: "p1" });
    H.ateliers.push({ numero: "SM-2026-015", statut: "prete" });

    const r = await annulerCommande("c1", "erreur de saisie");
    expect(r.avertissement).toContain("SM-2026-015");
  });

  it("une pièce « a_faire » : AUCUN avertissement, la fonction SQL l'a emportée", async () => {
    H.lignes.push({ commande_personnalisee_id: "p1" });
    H.ateliers.push({ numero: "SM-2026-016", statut: "a_faire" });

    const r = await annulerCommande("c1", "client injoignable");
    expect(r.avertissement).toBeUndefined();
    expect(r.message).toBe("Commande annulée, stock libéré.");
  });

  it("aucune commande d'atelier : le message habituel, et pas de lecture inutile", async () => {
    H.lignes.push({ commande_personnalisee_id: null });

    const r = await annulerCommande("c1", "doublon");
    expect(r.avertissement).toBeUndefined();
    expect(r.message).toBe("Commande annulée, stock libéré.");
    expect(H.filtres).toHaveLength(0);
  });

  it("L'ACTION N'ANNULE PLUS RIEN ELLE-MÊME", async () => {
    /**
     * Le cœur du lot. La boucle d'avant appelait `changer_statut_commande`
     * pour chaque ligne, sans filtre : c'est elle qui annulait les pièces
     * déjà fabriquées. Un seul appel doit partir, celui de l'annulation.
     */
    H.lignes.push({ commande_personnalisee_id: "p1" });
    H.ateliers.push({ numero: "SM-2026-017", statut: "en_cours" });

    await annulerCommande("c1", "client injoignable");

    expect(H.rpc.map((x) => x.nom)).toEqual(["annuler_commande_en_ligne"]);
    expect(H.rpc[0].args).toMatchObject({ p_commande_id: "c1", p_motif: "client injoignable" });
  });

  it("elle ne relit les statuts qu'à travers « en_cours » et « prete »", async () => {
    H.lignes.push({ commande_personnalisee_id: "p1" });
    H.ateliers.push({ numero: "SM-2026-018", statut: "en_cours" });

    await annulerCommande("c1", "client injoignable");
    expect(H.filtres.at(-1)).toEqual({ col: "statut", vals: ["en_cours", "prete"] });
  });

  it("si l'annulation échoue, rien n'est relu et rien n'est promis", async () => {
    H.lignes.push({ commande_personnalisee_id: "p1" });
    H.ateliers.push({ numero: "SM-2026-019", statut: "en_cours" });
    H.rpcErreur = { message: "Indiquez le motif de l'annulation." };

    const r = await annulerCommande("c1", "peu importe");
    expect(r.error).toBe("Indiquez le motif de l'annulation.");
    expect(r.avertissement).toBeUndefined();
    expect(H.filtres).toHaveLength(0);
  });
});

// ── L'écran ────────────────────────────────────────────────────────────────

describe("la carte affiche l'avertissement en or, pas en rouge", () => {
  it("une couleur à elle, et le rôle « status » : le geste a réussi", () => {
    /**
     * En grenat, l'avertissement se lirait comme un échec, et on chercherait
     * une commande non annulée qui l'est pourtant.
     */
    const src = readFileSync(
      join(__dirname, "..", "app/(admin)/boutique/commandes-en-ligne/CarteCommandeEnLigne.tsx"),
      "utf8",
    );
    expect(src).toMatch(/const OR = "#8A6A1F";/);

    // Le paragraphe de l'avertissement, et lui seul : chercher « GRENAT »
    // plus loin ferait tomber le test sur le bloc « commande annulée », qui a
    // toutes les raisons d'être rouge.
    const para = src.match(/\{alerte && \(\s*<p[^>]*>/);
    expect(para, "le paragraphe de l'avertissement est absent").toBeTruthy();
    expect(para![0]).toContain("color: OR");
    expect(para![0]).toContain('role="status"');
    expect(para![0]).not.toContain("GRENAT");
    expect(src).toMatch(/setAlerte\(res\.error \? null : res\.avertissement \?\? null\)/);
  });
});
