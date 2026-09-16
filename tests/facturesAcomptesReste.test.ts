import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { deriverPaiement, type PieceCouvrante } from "@/src/lib/paiementReservation";
import { montantsDuDocument, MENTION_REGLEE } from "@/src/lib/factureMontantsDocument";

/**
 * Trois corrections sur le lien paiements ↔ factures.
 *
 * A. L'acompte versé sur une réservation la suit jusqu'à sa facture : à
 *    l'émission, il est rattaché à la facture (emettre_facture, en base, dans
 *    la même transaction). La facture naît avec payé = acomptes, et le PDF
 *    et le QR portent le reste.
 * B. Le reste d'une facture vaut TOUJOURS total − paiements − avoirs ; un
 *    seul endroit le calcule (recalculer_paiement_facture).
 * C. La régénération d'un brouillon ne remplace que les lignes venues de la
 *    réservation : les achats reportés par la caisse restent.
 */

const RACINE = join(__dirname, "..");
const MIGRATIONS = join(RACINE, "supabase", "migrations");

/** La DERNIÈRE définition de chaque fonction SQL, telle qu'elle est en vigueur. */
function fonctionsEnVigueur(): Map<string, string> {
  const derniere = new Map<string, string>();
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    const re = /create\s+or\s+replace\s+function\s+(?:public\.)?(\w+)\s*\([\s\S]*?\$(\w*)\$([\s\S]*?)\$\2\$/gi;
    for (const m of sql.matchAll(re)) derniere.set(m[1], m[3]);
  }
  return derniere;
}
const FONCTIONS = fonctionsEnVigueur();
const corps = (nom: string) => {
  const c = FONCTIONS.get(nom);
  if (!c) throw new Error(`fonction introuvable : ${nom}`);
  return c;
};

// ── B. Le reste d'une facture : la formule en base, évaluée ici ─────────────

/**
 * Traduit en JavaScript le calcul du reste et du statut tel qu'il est ÉCRIT
 * dans recalculer_paiement_facture. Le test n'a pas sa propre formule : il
 * exécute celle de la migration.
 */
function formuleSql(): (f: { numero: string | null; type: string; statut: string; montant_total: number },
  paye: number, avoirs: number) => { reste: number; statut: string } {
  const c = corps("recalculer_paiement_facture");
  const reste = c.match(/v_reste\s*:=\s*([\s\S]*?);/)![1];
  const cas = c.match(/v_statut\s*:=\s*case([\s\S]*?)end;/)![1];

  const expr = (sql: string) => sql
    .replace(/v_f\.(\w+)/g, "f.$1")
    .replace(/\bv_paye\b/g, "paye").replace(/\bv_avoirs\b/g, "avoirs").replace(/\bv_reste\b/g, "reste")
    .replace(/greatest\(/g, "Math.max(")
    .replace(/coalesce\(([^,()]+),\s*0\)/g, "($1 ?? 0)")
    .replace(/round\(([\s\S]+),\s*2\)/g, "r2($1)")
    .replace(/(\S+)\s+is\s+null/g, "$1 == null")
    .replace(/(\S+)\s+in\s+\(([^)]*)\)/g, "[$2].includes($1)")
    .replace(/(?<![<>!=])=(?!=)/g, "===");

  const branches = [...cas.matchAll(/when\s+([\s\S]*?)\s+then\s+([\s\S]*?)(?=\s+when\s|\s+else\s)/g)]
    .map((m) => `(${expr(m[1])}) ? (${expr(m[2])}) :`).join(" ");
  const sinon = expr(cas.match(/else\s+([\s\S]*?)\s*$/)![1]);

  const fn = new Function("f", "paye", "avoirs",
    `const r2 = (n) => Math.round(n * 100) / 100;
     const reste = ${expr(reste)};
     const statut = ${branches} ${sinon};
     return { reste, statut };`);
  return fn as never;
}

describe("B — le reste d'une facture : total − paiements − avoirs", () => {
  const calcul = formuleSql();
  const facture = { numero: "FAC-2026-9001", type: "facture", statut: "envoyee", montant_total: 100 };

  it("les sommes lues sont les bonnes : TOUS les paiements de la facture, les avoirs émis", () => {
    const c = corps("recalculer_paiement_facture");
    // Aucun filtre de mode : un acompte rattaché compte comme payé.
    expect(c).toMatch(/sum\(montant\), 0\), 2\) into v_paye\s+from paiements_resa where facture_id = p_facture_id;/);
    expect(c).toMatch(/into v_avoirs\s+from factures\s+where facture_origine_id = p_facture_id and type = 'avoir' and numero is not null;/);
    expect(c).toMatch(/update factures\s+set montant_paye = v_paye, montant_restant = v_reste, statut = v_statut/);
  });

  it("facture 100, avoir 30, encaissement 70 → reste 0, payée", () => {
    expect(calcul(facture, 0, 30)).toEqual({ reste: 70, statut: "envoyee" });
    expect(calcul(facture, 70, 30)).toEqual({ reste: 0, statut: "acquittee" });
  });

  it("facture 100, avoir 30, encaissement 50 → reste 20, partiellement payée", () => {
    expect(calcul(facture, 50, 30)).toEqual({ reste: 20, statut: "partiellement_reglee" });
  });

  it("un avoir partiel n'est plus écrasé par un encaissement : l'ancien calcul disait 50", () => {
    // Avant : reste = total − payé, sans l'avoir. Le voici, pour mémoire.
    expect(100 - 50).toBe(50);
    expect(calcul(facture, 50, 30).reste).toBe(20);
  });

  it("le reste n'est jamais négatif ; un brouillon, un avoir, une facture annulée gardent leur statut", () => {
    expect(calcul(facture, 90, 30)).toEqual({ reste: 0, statut: "acquittee" });
    expect(calcul({ ...facture, numero: null, statut: "brouillon" }, 0, 0).statut).toBe("brouillon");
    expect(calcul({ ...facture, type: "avoir" }, 0, 0).statut).toBe("envoyee");
    expect(calcul({ ...facture, statut: "annulee_par_avoir" }, 0, 100)).toEqual({ reste: 0, statut: "annulee_par_avoir" });
  });
});

// ── B. Un seul endroit l'écrit ─────────────────────────────────────────────

function fichiers(dossier: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dossier)) {
    if (e === "node_modules" || e === ".next") continue;
    const p = join(dossier, e);
    if (statSync(p).isDirectory()) out.push(...fichiers(p));
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

const SOURCES = ["app", "src"].flatMap((d) => fichiers(join(RACINE, d))).map((chemin) => {
  const rel = relative(RACINE, chemin).split("\\").join("/");
  const code = readFileSync(chemin, "utf8");
  return { rel, code, sf: ts.createSourceFile(rel, code, ts.ScriptTarget.Latest, true, rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS) };
});

const CHAMPS_RESTE = new Set(["montant_restant", "montant_paye"]);

/** Les écritures (insert/update/upsert) sur factures qui posent payé ou reste. */
function ecrituresDuReste(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const visiter = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
        && ["insert", "update", "upsert"].includes(n.expression.name.text)) {
      let x: ts.Expression = n.expression.expression;
      let table: string | null = null;
      while (ts.isCallExpression(x) || ts.isPropertyAccessExpression(x)) {
        if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression)
            && x.expression.name.text === "from" && x.arguments[0] && ts.isStringLiteral(x.arguments[0])) {
          table = x.arguments[0].text;
          break;
        }
        x = x.expression;
      }
      const cles = (o: ts.Node): string[] => ts.isObjectLiteralExpression(o)
        ? o.properties.flatMap((p) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? [p.name.text] : []))
        : ts.isArrayLiteralExpression(o) ? o.elements.flatMap(cles) : [];
      const arg = n.arguments[0];
      if (table === "factures" && arg) {
        for (const c of cles(arg)) if (CHAMPS_RESTE.has(c)) out.push(`${c} @${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
      }
    }
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return out;
}

describe("B — un seul endroit calcule le reste d'une facture", () => {
  it("la règle attrape bien une écriture directe", () => {
    const sf = ts.createSourceFile("x.ts",
      `await supabaseAdmin.from("factures").update({ statut: "x", montant_restant: 0 }).eq("id", id);`,
      ts.ScriptTarget.Latest, true);
    expect(ecrituresDuReste(sf)).toEqual(["montant_restant @1"]);
  });

  it("aucun fichier de l'application n'écrit montant_restant ni montant_paye d'une facture", () => {
    const fautes = SOURCES.flatMap((s) => ecrituresDuReste(s.sf).map((e) => `${s.rel} : ${e}`));
    expect(fautes).toEqual([]);
  });

  it("en base, seule recalculer_paiement_facture les écrit", () => {
    expect(FONCTIONS.size).toBeGreaterThan(50);
    const fautes = [...FONCTIONS].filter(([nom, c]) => nom !== "recalculer_paiement_facture" && (
      [...c.matchAll(/update\s+(?:public\.)?factures\b([\s\S]*?);/gi)]
        .some((u) => /montant_restant\s*=|montant_paye\s*=/i.test(u[1]))
      || [...c.matchAll(/insert\s+into\s+(?:public\.)?factures\s*\(([^)]*)\)/gi)]
        .some((u) => /montant_restant|montant_paye/i.test(u[1]))
    )).map(([nom]) => nom);
    expect(fautes).toEqual([]);
  });

  it("émission, caisse et retour l'appellent en base", () => {
    for (const nom of ["emettre_facture", "finaliser_vente", "retourner_vente"]) {
      expect(corps(nom), nom).toMatch(/perform\s+public\.recalculer_paiement_facture\(/);
    }
  });

  it("encaissement, avoir, annulation de paiement et totaux de brouillon l'appellent côté application", () => {
    const code = (rel: string) => SOURCES.find((s) => s.rel === rel)!.code;
    expect(code("src/lib/comptaFacture.ts")).toMatch(/export async function recalculerResteFacture[\s\S]*?rpc\("recalculer_paiement_facture"/);
    expect(code("src/lib/comptaFacture.ts")).toMatch(/export async function rafraichirPaiementFacture[\s\S]*?await recalculerResteFacture\(factureId\);/);
    const actions = code("app/(admin)/(espace-comptabilite)/factures/actions.ts");
    // Encaisser lit le reste recalculé ; l'annulation passe par apresMouvementDePaiement.
    expect(actions).toContain("resteDu = (await recalculerResteFacture(factureId))?.reste ?? 0;");
    expect(actions).toMatch(/async function apresMouvementDePaiement[\s\S]*?rafraichirPaiementFacture\(/);
    expect(code("app/(admin)/(espace-comptabilite)/factures/actionsCreation.ts"))
      .toMatch(/export async function creerAvoir[\s\S]*?await rafraichirPaiementFacture\(factureId, /);
    expect(code("src/lib/factureResa.ts")).toMatch(/async function rafraichirTotauxBrouillon[\s\S]*?await recalculerResteFacture\(factureId\);/);
  });

  it("un acompte rattaché ne s'annule pas comme un versement", () => {
    const actions = SOURCES.find((s) => s.rel === "app/(admin)/(espace-comptabilite)/factures/actions.ts")!.code;
    expect(actions).toMatch(/export async function annulerPaiement[\s\S]*?p\.mode === "rattachement"[\s\S]*?\.eq\("rattache_de", paiementId\)[\s\S]*?Contre-passation/);
  });
});

// ── A. L'acompte suit la réservation jusqu'à sa facture ────────────────────

describe("A — le rattachement, écrit dans emettre_facture", () => {
  const emettre = corps("emettre_facture");

  it("chaque paiement hors facture d'une réservation couverte est rattaché une fois, dans la transaction d'émission", () => {
    expect(emettre).toMatch(/if v_f\.type in \('facture', 'libre'\) then/);
    expect(emettre).toMatch(/p\.facture_id is null\s+and p\.mode <> 'rattachement'\s+and p\.montant <> 0\s+and not exists \(select 1 from public\.paiements_resa r where r\.rattache_de = p\.id\)/);
    // Deux lignes : −x sur la réservation (aujourd'hui), +x sur la facture (à la date du versement).
    expect(emettre).toMatch(/current_date, 'rattachement', -a\.montant/);
    expect(emettre).toMatch(/\(null, p_facture_id, a\.client_id, a\.date_paiement, 'rattachement', a\.montant,/);
    expect(emettre).toContain("'acompte_rattache'");
    // Le rattachement précède le calcul du reste et l'écriture comptable.
    const i = (s: string) => emettre.indexOf(s);
    expect(i("'rattachement', a.montant")).toBeLessThan(i("perform public.recalculer_paiement_facture"));
    expect(i("perform public.recalculer_paiement_facture")).toBeLessThan(i("'2030'"));
  });

  it("le passif des acomptes est le 2030, soldé contre le 1100 pour ce qui est imputé", () => {
    expect(emettre).toMatch(/'compte', '2030', 'debit', v_acomptes, 'credit', 0/);
    expect(emettre).toMatch(/'compte', '1100', 'debit', 0, 'credit', v_acomptes/);
    const imputer = corps("acomptes_a_imputer");
    expect(imputer).toMatch(/\(p\.facture_id = p_facture_id and p\.mode = 'rattachement'\)/);
  });
});

/** Une facture définitive émise, avec ses lignes et ses paiements. */
const facture = (lignesReservation: number, lignesTotal: number, paiements: number): PieceCouvrante =>
  ({ id: "F", type: "facture", statut: "envoyee", lignesReservation, lignesTotal, paiements });
const brouillon = (montant: number): PieceCouvrante =>
  ({ id: "F", type: "facture", statut: "brouillon", lignesReservation: montant, lignesTotal: montant, paiements: 0 });

describe("A — la dérivation 17j, rejouée avant et après l'émission", () => {
  const calcul = formuleSql();
  const resteFacture = (total: number, paye: number) =>
    calcul({ numero: "FAC", type: "facture", statut: "envoyee", montant_total: total }, paye, 0);

  it("acompte partiel : 100 sur 250 → partielle avant, partielle après ; la facture naît à 150", () => {
    const avant = deriverPaiement({ prix: 250, regleeAutrement: false, pieces: [brouillon(250)], paiementsDirects: 100, tropPercuReverse: 0 });
    expect(avant).toMatchObject({ du: 250, paye: 100, reste: 150, statut: "partiel" });

    // À l'émission : −100 côté réservation, +100 côté facture.
    const apres = deriverPaiement({ prix: 250, regleeAutrement: false, pieces: [facture(250, 250, 100)], paiementsDirects: 100 - 100, tropPercuReverse: 0 });
    expect(apres).toMatchObject({ du: 250, paye: 100, reste: 150, statut: "partiel", facturee: true });
    expect(resteFacture(250, 100)).toEqual({ reste: 150, statut: "partiellement_reglee" });

    // Encaissement du solde sur la facture : les deux côtés sont payés.
    const solde = deriverPaiement({ prix: 250, regleeAutrement: false, pieces: [facture(250, 250, 250)], paiementsDirects: 0, tropPercuReverse: 0 });
    expect(solde).toMatchObject({ reste: 0, statut: "paye" });
    expect(resteFacture(250, 250)).toEqual({ reste: 0, statut: "acquittee" });
  });

  it("acompte total : payée avant, payée après ; la facture naît acquittée", () => {
    const avant = deriverPaiement({ prix: 250, regleeAutrement: false, pieces: [brouillon(250)], paiementsDirects: 250, tropPercuReverse: 0 });
    expect(avant).toMatchObject({ reste: 0, statut: "paye" });
    const apres = deriverPaiement({ prix: 250, regleeAutrement: false, pieces: [facture(250, 250, 250)], paiementsDirects: 0, tropPercuReverse: 0 });
    expect(apres).toMatchObject({ du: 250, paye: 250, reste: 0, statut: "paye" });
    expect(resteFacture(250, 250)).toEqual({ reste: 0, statut: "acquittee" });
  });

  it("une facture qui couvre deux réservations : l'acompte se répartit au prorata, rien n'est compté deux fois", () => {
    // A : 100, acompte 100 ; B : 300, rien. Facture 400, payé 100.
    const a = deriverPaiement({ prix: 100, regleeAutrement: false, pieces: [facture(100, 400, 100)], paiementsDirects: 0, tropPercuReverse: 0 });
    const b = deriverPaiement({ prix: 300, regleeAutrement: false, pieces: [facture(300, 400, 100)], paiementsDirects: 0, tropPercuReverse: 0 });
    expect(a).toMatchObject({ paye: 25, reste: 75, statut: "partiel" });
    expect(b).toMatchObject({ paye: 75, reste: 225, statut: "partiel" });
    expect(a.paye + b.paye).toBe(100);
    expect(a.reste + b.reste).toBe(resteFacture(400, 100).reste);
  });

  it("sans acompte : rien n'est rattaché, la facture naît au total", () => {
    const avant = deriverPaiement({ prix: 250, regleeAutrement: false, pieces: [brouillon(250)], paiementsDirects: 0, tropPercuReverse: 0 });
    const apres = deriverPaiement({ prix: 250, regleeAutrement: false, pieces: [facture(250, 250, 0)], paiementsDirects: 0, tropPercuReverse: 0 });
    expect(avant).toMatchObject({ reste: 250, statut: "impaye" });
    expect(apres).toMatchObject({ reste: 250, statut: "impaye" });
    expect(resteFacture(250, 0)).toEqual({ reste: 250, statut: "envoyee" });
  });
});

describe("A — le PDF et le QR portent le reste", () => {
  const base = { type: "facture", total: 250, acomptesImputes: 0, rattachements: [] as { date_paiement: string; montant: number }[] };

  it("acompte partiel : une ligne « Acompte reçu le … », QR au reste", () => {
    const m = montantsDuDocument({ ...base, montantPaye: 100, montantRestant: 150, acomptesImputes: 100,
      rattachements: [{ date_paiement: "2026-09-10", montant: 100 }] });
    expect(m).toEqual({ acomptesRecus: [{ date: "2026-09-10", montant: 100 }], acomptes: 0, dejaPaye: 0, reste: 150, montantQr: 150, mentionReglee: null });
  });

  it("acompte total : pas de bulletin, « Réglée — aucun montant à verser »", () => {
    const m = montantsDuDocument({ ...base, montantPaye: 250, montantRestant: 0, acomptesImputes: 250,
      rattachements: [{ date_paiement: "2026-09-02", montant: 200 }, { date_paiement: "2026-09-01", montant: 50 }] });
    expect(m.acomptesRecus.map((a) => a.date)).toEqual(["2026-09-01", "2026-09-02"]);
    expect(m.montantQr).toBeNull();
    expect(m.mentionReglee).toBe("Réglée — aucun montant à verser");
    expect(m.mentionReglee).toBe(MENTION_REGLEE);
  });

  it("une facture d'acompte garde sa ligne « Acomptes déjà versés » ; sans acompte, QR au total", () => {
    expect(montantsDuDocument({ ...base, montantPaye: 0, montantRestant: 250, acomptesImputes: 80 }))
      .toMatchObject({ acomptesRecus: [], acomptes: 80, montantQr: 250 });
    expect(montantsDuDocument({ ...base, montantPaye: 0, montantRestant: 250 }))
      .toMatchObject({ acomptes: 0, dejaPaye: 0, reste: 250, montantQr: 250, mentionReglee: null });
  });

  it("le bulletin QR généré porte le reste (150), jamais le total (250)", async () => {
    const { genererQrBillSvg } = await import("@/src/lib/qrFacture");
    const m = montantsDuDocument({ ...base, montantPaye: 100, montantRestant: 150, acomptesImputes: 100,
      rattachements: [{ date_paiement: "2026-09-10", montant: 100 }] });
    const svg = genererQrBillSvg({
      iban: "CH4431999123000889012", titulaire: "La Dogosphère Sàrl",
      adresse: { rue: "Rue du Test", numero: "1", npa: "1950", ville: "Sion", pays: "CH" },
      montant: m.montantQr!, numeroFacture: "FAC-2026-9001", referenceStockee: null,
      debiteur: { nom: "Jean Test", adresse: ["Av. du Client 2", "1200 Genève"] },
    })!;
    expect(svg).toMatch(/150.00/);
    expect(svg).not.toMatch(/250.00/);
  });

  it("un avoir n'a ni bulletin ni mention", () => {
    expect(montantsDuDocument({ ...base, type: "avoir", montantPaye: 0, montantRestant: 0 }))
      .toMatchObject({ montantQr: null, mentionReglee: null });
  });

  it("le document relit les rattachements, et un PDF existant n'est jamais refait", () => {
    const doc = SOURCES.find((s) => s.rel === "src/lib/factureDocument.ts")!.code;
    expect(doc).toMatch(/if \(f\.pdf_path\) return infos;[\s\S]*montantsDuDocument\(/);
    expect(doc).toContain(`.eq("facture_id", factureId).eq("mode", "rattachement")`);
    expect(doc).toContain("montant: montants.montantQr,");
    const pdf = SOURCES.find((s) => s.rel === "src/lib/facturePdf.tsx")!.code;
    expect(pdf).toContain("Acompte reçu le {jolieDate(a.date)}");
    expect(pdf).toContain("p.bulletinSvg && !estAvoir && !p.mentionReglee");
  });
});

// ── C. Le brouillon garde les lignes de la caisse ──────────────────────────

type Ligne = Record<string, unknown>;
const H = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  suivant: 0,
}));

vi.mock("@/src/lib/supabase-admin", () => {
  type Filtre = (r: Record<string, unknown>) => boolean;
  const requete = (table: string) => {
    const filtres: Filtre[] = [];
    let action: { type: "select" | "insert" | "update" | "delete"; valeur?: unknown; head?: boolean; colonnes?: string } = { type: "select" };
    let unique = false;
    const lignes = () => (H.tables[table] ??= []);
    const executer = () => {
      const t = lignes();
      if (action.type === "insert") {
        const nouvelles = (Array.isArray(action.valeur) ? action.valeur : [action.valeur]) as Record<string, unknown>[];
        const posees = nouvelles.map((n) => {
          const l: Record<string, unknown> = { id: `id-${++H.suivant}`, ...n };
          // Le trigger trg_facture_lignes_montant.
          if (table === "facture_lignes") l.montant = Math.round(Number(l.quantite) * Number(l.prix_unitaire) * 100) / 100;
          if (table === "facture_lignes" && !l.origine) l.origine = "manuelle";
          t.push(l);
          return l;
        });
        return { data: unique ? posees[0] : posees, error: null };
      }
      const vises = t.filter((r) => filtres.every((f) => f(r)));
      if (action.type === "update") { vises.forEach((r) => Object.assign(r, action.valeur)); return { data: null, error: null }; }
      if (action.type === "delete") { H.tables[table] = t.filter((r) => !vises.includes(r)); return { data: null, error: null }; }
      if (action.head) return { data: null, count: vises.length, error: null };
      const avecJointure = vises.map((r) => (table === "facture_reservations" && action.colonnes?.includes("factures!inner")
        ? { ...r, factures: (H.tables.factures ?? []).find((f) => f.id === r.facture_id) }
        : r));
      return { data: unique ? avecJointure[0] ?? null : avecJointure, error: null };
    };
    const b: Record<string, unknown> = {
      select: (colonnes?: string, opts?: { head?: boolean }) => {
        if (action.type === "select") action = { type: "select", colonnes, head: opts?.head };
        return b;
      },
      insert: (valeur: unknown) => { action = { type: "insert", valeur }; return b; },
      update: (valeur: unknown) => { action = { type: "update", valeur }; return b; },
      delete: () => { action = { type: "delete" }; return b; },
      eq: (k: string, v: unknown) => { filtres.push((r) => (r[k] ?? (k === "facture_annulee" ? false : undefined)) === v); return b; },
      order: () => b,
      limit: () => b,
      maybeSingle: () => { unique = true; return b; },
      single: () => { unique = true; return b; },
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(executer()).then(ok, ko),
    };
    return b;
  };
  return { supabaseAdmin: { from: requete } };
});
vi.mock("@/src/lib/tva", () => ({ tvaDeLaPrestation: async () => ({ taux: 0, motif: null }) }));
vi.mock("@/src/lib/comptaResa", () => ({ synchroniserComptaResa: async () => {} }));
vi.mock("@/src/lib/journalEvenements", () => ({ tracerEvenement: async () => {} }));
vi.mock("@/src/lib/paiementReservation", async (orig) => ({
  ...(await orig<typeof import("@/src/lib/paiementReservation")>()),
  recalculerPaiementsDeFacture: async () => {},
}));
vi.mock("@/src/lib/comptaFacture", () => ({
  synchroniserComptaFacture: async () => {},
  // L'endroit unique, vu d'ici : payé et reste relus depuis les tables.
  recalculerResteFacture: async (id: string) => {
    const f = H.tables.factures.find((x) => x.id === id)!;
    const paye = (H.tables.paiements_resa ?? []).filter((p) => p.facture_id === id).reduce((s, p) => s + Number(p.montant), 0);
    f.montant_paye = paye;
    f.montant_restant = Math.max(Number(f.montant_total) - paye, 0);
    return { paye, avoirs: 0, reste: f.montant_restant, statut: f.statut };
  },
}));

describe("C — le brouillon ne perd rien", () => {
  beforeEach(() => {
    H.suivant = 0;
    H.tables = {
      reservations: [{ id: "R1", client_id: "C1", type_reservation: "sejour", date_debut: "2026-09-20", date_fin: "2026-09-25",
        montant_calcule: 250, montant_final: 250, ajustement_manuel: 0, montant_paye: 0 }],
      reservation_extras: [], cotisations_membres: [], reservation_chiens: [{ id: "c", reservation_id: "R1" }],
      factures: [], facture_reservations: [], facture_lignes: [], paiements_resa: [],
    };
  });

  it("réservation → deux achats reportés par la caisse → changement de prix : les achats restent, le total est juste", async () => {
    const { creerOuMajFactureBrouillon } = await import("@/src/lib/factureResa");

    await creerOuMajFactureBrouillon("R1");
    const factureId = H.tables.factures[0].id as string;
    expect(H.tables.facture_lignes.map((l) => [l.origine, l.montant])).toEqual([["reservation", 250]]);

    // La caisse (finaliser_vente) reporte deux achats sur le brouillon.
    H.tables.facture_lignes.push(
      { id: "v1", facture_id: factureId, ordre: 2, libelle: "Friandises", quantite: 2, prix_unitaire: 6.5, montant: 13, compte_produit: "3200", origine: "caisse" },
      { id: "v2", facture_id: factureId, ordre: 3, libelle: "Laisse", quantite: 1, prix_unitaire: 24, montant: 24, compte_produit: "3200", origine: "caisse" },
    );

    // Le prix du séjour change.
    H.tables.reservations[0].montant_final = 300;
    await creerOuMajFactureBrouillon("R1");

    const lignes = H.tables.facture_lignes.filter((l: Ligne) => l.facture_id === factureId);
    expect(lignes.map((l) => [l.origine, l.libelle, l.montant]).sort()).toEqual([
      ["caisse", "Friandises", 13],
      ["caisse", "Laisse", 24],
      ["reservation", "Séjour du 20.09.2026 au 25.09.2026 — 1 chien", 300],
    ]);
    const f = H.tables.factures[0];
    expect(f.montant_total).toBe(337);
    expect(f.montant_ttc).toBe(337);
    expect(f.montant_tva).toBe(0);
    expect(f.montant_restant).toBe(337);
    expect(H.tables.facture_reservations[0].montant).toBe(300);
  });

  it("seules les lignes « reservation » partent à la régénération", () => {
    const code = SOURCES.find((s) => s.rel === "src/lib/factureResa.ts")!.code;
    expect(code).toMatch(/from\("facture_lignes"\)\.delete\(\)\s*\.eq\("facture_id", factureId\)\s*\.eq\("origine", "reservation"\);/);
  });

  it("l'origine est posée par chaque chemin qui écrit des lignes", () => {
    const code = (rel: string) => SOURCES.find((s) => s.rel === rel)!.code;
    expect(corps("finaliser_vente")).toMatch(/'caisse'/);
    expect(corps("retourner_vente")).toMatch(/'caisse'/);
    expect(code("app/(public)/catalogue/actions.ts")).toContain(`origine: "caisse"`);
    const creation = code("app/(admin)/(espace-comptabilite)/factures/actionsCreation.ts");
    expect(creation).toContain(`origine: "manuelle"`);
    expect(creation).toContain(`origine: "reservation"`);
    expect(creation).toContain(`origine: l.origine ?? "manuelle"`);
  });
});
