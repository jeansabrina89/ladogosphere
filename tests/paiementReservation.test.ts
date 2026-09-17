import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/src/lib/supabase-admin", () => ({ supabaseAdmin: {} }));

const { deriverPaiement } = await import("@/src/lib/paiementReservation");
type PieceCouvrante = import("@/src/lib/paiementReservation").PieceCouvrante;

/**
 * Le paiement d'une réservation se DÉRIVE de ses factures : une seule règle,
 * testée cas par cas, puis un dépôt relu pour qu'aucune autre écriture n'existe.
 */

const base = { prix: 250, regleeAutrement: false, pieces: [] as PieceCouvrante[], paiementsDirects: 0, tropPercuReverse: 0 };
const facture = (p: Partial<PieceCouvrante> = {}): PieceCouvrante => ({
  id: "f1", type: "facture", statut: "envoyee", lignesReservation: 250, lignesTotal: 250, paiements: 0, ...p,
});
const avoir = (p: Partial<PieceCouvrante> = {}): PieceCouvrante => ({
  id: "a1", type: "avoir", statut: "envoyee", lignesReservation: 250, lignesTotal: 250, paiements: 0,
  typeOrigine: "facture", ...p,
});

describe("la dérivation : facture et réservation disent la même chose", () => {
  it("facture payée → réservation payée", () => {
    const d = deriverPaiement({ ...base, pieces: [facture({ statut: "acquittee", paiements: 250 })] });
    expect(d).toMatchObject({ du: 250, paye: 250, reste: 0, statut: "paye", facturee: true });
  });

  it("facture partiellement payée → réservation partiellement payée", () => {
    const d = deriverPaiement({ ...base, pieces: [facture({ statut: "partiellement_reglee", paiements: 100 })] });
    expect(d).toMatchObject({ du: 250, paye: 100, reste: 150, statut: "partiel" });
  });

  it("facture émise sans paiement → impayée", () => {
    expect(deriverPaiement({ ...base, pieces: [facture()] }).statut).toBe("impaye");
  });

  it("le dû est celui de la facture, pas le prix enregistré", () => {
    const d = deriverPaiement({ ...base, prix: 999, pieces: [facture({ lignesReservation: 230, lignesTotal: 230 })] });
    expect(d.du).toBe(230);
  });

  it("un brouillon ne couvre rien : le dû reste le prix", () => {
    const d = deriverPaiement({ ...base, pieces: [facture({ statut: "brouillon", paiements: 250 })] });
    expect(d).toMatchObject({ du: 250, paye: 0, statut: "impaye", facturee: false });
  });
});

describe("les avoirs", () => {
  it("un avoir qui annule une facture impayée → soldée, plus rien n'est dû", () => {
    const d = deriverPaiement({ ...base, pieces: [facture({ statut: "annulee_par_avoir" }), avoir()] });
    expect(d).toMatchObject({ du: 0, paye: 0, reste: 0, statut: "paye" });
  });

  it("avoir puis nouvelle facture → impayée : la nouvelle facture est due", () => {
    const d = deriverPaiement({
      ...base,
      pieces: [facture({ statut: "annulee_par_avoir" }), avoir(), facture({ id: "f2" })],
    });
    expect(d).toMatchObject({ du: 250, paye: 0, reste: 250, statut: "impaye" });
  });

  it("un avoir partiel sur une facture impayée réduit ce qui reste", () => {
    const d = deriverPaiement({ ...base, pieces: [facture(), avoir({ lignesReservation: 100, lignesTotal: 100 })] });
    expect(d).toMatchObject({ du: 150, reste: 150, statut: "impaye" });
  });

  it("une facture payée puis annulée par avoir (remboursé ou crédité) → soldée", () => {
    const d = deriverPaiement({ ...base, pieces: [facture({ statut: "annulee_par_avoir", paiements: 250 }), avoir()] });
    expect(d).toMatchObject({ du: 0, reste: 0, statut: "paye" });
  });

  it("un avoir sur une facture d'acompte ne touche pas au dû du séjour", () => {
    const d = deriverPaiement({
      ...base, prix: 400,
      pieces: [
        facture({ id: "acompte", type: "acompte", statut: "annulee_par_avoir", lignesReservation: 150, lignesTotal: 150 }),
        avoir({ lignesReservation: 150, lignesTotal: 150, typeOrigine: "acompte" }),
        facture({ id: "def", lignesReservation: 400, lignesTotal: 400 }),
      ],
    });
    expect(d).toMatchObject({ du: 400, statut: "impaye" });
  });
});

describe("une facture qui couvre plusieurs réservations", () => {
  it("chaque versement se répartit au prorata des lignes", () => {
    // Facture de 400 : séjour A 100, séjour B 300. Versement de 200.
    const pieces = (resa: number) => [facture({ lignesReservation: resa, lignesTotal: 400, paiements: 200, statut: "partiellement_reglee" })];
    const a = deriverPaiement({ ...base, prix: 100, pieces: pieces(100) });
    const b = deriverPaiement({ ...base, prix: 300, pieces: pieces(300) });
    expect(a).toMatchObject({ du: 100, paye: 50, reste: 50, statut: "partiel" });
    expect(b).toMatchObject({ du: 300, paye: 150, reste: 150, statut: "partiel" });
    expect(a.paye + b.paye).toBe(200);
  });

  it("des lignes libres sur la même facture prennent leur part du versement", () => {
    // Séjour 250 + une laisse à 50 : un versement de 150 revient pour 125 au séjour.
    const d = deriverPaiement({ ...base, pieces: [facture({ lignesTotal: 300, paiements: 150, statut: "partiellement_reglee" })] });
    expect(d.paye).toBe(125);
  });

  it("une facture entièrement payée solde chacune de ses réservations", () => {
    for (const part of [80, 170]) {
      const d = deriverPaiement({ ...base, prix: part, pieces: [facture({ lignesReservation: part, lignesTotal: 250, paiements: 250, statut: "acquittee" })] });
      expect(d.statut).toBe("paye");
    }
  });
});

describe("acomptes et paiements hors facture", () => {
  it("un acompte avant facture compte entièrement pour la réservation", () => {
    const d = deriverPaiement({ ...base, paiementsDirects: 100 });
    expect(d).toMatchObject({ du: 250, paye: 100, reste: 150, statut: "partiel", facturee: false });
  });

  it("acompte facturé et encaissé, puis facture définitive : le reste tient compte de l'acompte", () => {
    const d = deriverPaiement({
      ...base, prix: 400,
      pieces: [
        facture({ id: "ac", type: "acompte", statut: "acquittee", lignesReservation: 150, lignesTotal: 150, paiements: 150 }),
        facture({ id: "def", lignesReservation: 400, lignesTotal: 400 }),
      ],
    });
    expect(d).toMatchObject({ du: 400, paye: 150, reste: 250, statut: "partiel" });
  });

  it("une contre-passation directe annule un paiement de facture", () => {
    const d = deriverPaiement({ ...base, pieces: [facture({ statut: "acquittee", paiements: 250 })], paiementsDirects: -250 });
    expect(d).toMatchObject({ paye: 0, statut: "impaye" });
  });

  it("avant le journal des paiements, l'avoir consommé sur la réservation était son paiement", () => {
    const d = deriverPaiement({ ...base, prix: 60, payeAvantJournal: 60 });
    expect(d).toMatchObject({ du: 60, paye: 60, reste: 0, statut: "paye" });
  });

  it("un trop-perçu reversé en avoir ne compte plus comme payé", () => {
    const d = deriverPaiement({ ...base, prix: 200, paiementsDirects: 250, tropPercuReverse: 50 });
    expect(d).toMatchObject({ du: 200, paye: 200, reste: 0, statut: "paye" });
  });
});

describe("réservations qui ne doivent rien", () => {
  it("réglée par une carte journées → payée sans paiement", () => {
    expect(deriverPaiement({ ...base, prix: 40, regleeAutrement: true })).toMatchObject({ du: 0, statut: "paye" });
  });

  it("une demande dont le prix n'est pas encore calculé reste impayée", () => {
    expect(deriverPaiement({ ...base, prix: 0 }).statut).toBe("impaye");
  });

  it("les centimes ne font pas basculer un statut", () => {
    const d = deriverPaiement({ ...base, prix: 100, pieces: [facture({ lignesReservation: 100, lignesTotal: 300, paiements: 300, statut: "acquittee" })] });
    expect(d).toMatchObject({ paye: 100, reste: 0, statut: "paye" });
  });
});

// ── Le dépôt ───────────────────────────────────────────────────────────────

const RACINE = join(__dirname, "..");
const MODULE = "src/lib/paiementReservation.ts";

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

const CHAMPS_DERIVES = new Set(["statut_paiement", "montant_restant"]);

/** Les écritures (insert/update/upsert) sur reservations qui posent un champ dérivé. */
function ecrituresDerivees(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const visiter = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
        && ["insert", "update", "upsert"].includes(n.expression.name.text)) {
      // Remonter la chaîne jusqu'au .from("…").
      let x: ts.Expression = n.expression.expression;
      let table: string | null = null;
      while (ts.isCallExpression(x) || ts.isPropertyAccessExpression(x)) {
        if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression)
            && x.expression.name.text === "from" && x.arguments[0] && ts.isStringLiteral(x.arguments[0])) {
          table = x.arguments[0].text;
          break;
        }
        x = ts.isCallExpression(x) ? x.expression : x.expression;
      }
      const arg = n.arguments[0];
      const cles = (o: ts.Node): string[] => ts.isObjectLiteralExpression(o)
        ? o.properties.flatMap((p) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? [p.name.text] : []))
        : ts.isArrayLiteralExpression(o) ? o.elements.flatMap(cles) : [];
      if (table === "reservations" && arg) {
        for (const c of cles(arg)) if (CHAMPS_DERIVES.has(c)) out.push(`${c} @${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
      }
    }
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return out;
}

describe("une seule source : aucune autre écriture du statut de paiement", () => {
  it("la règle attrape bien une écriture directe", () => {
    const sf = ts.createSourceFile("x.ts",
      `await supabaseAdmin.from("reservations").update({ montant_paye: 1, statut_paiement: "paye" }).eq("id", id);`,
      ts.ScriptTarget.Latest, true);
    expect(ecrituresDerivees(sf)).toEqual(["statut_paiement @1"]);
  });

  it("hors de src/lib/paiementReservation.ts, personne n'écrit statut_paiement ni montant_restant d'une réservation", () => {
    const fautes = SOURCES.filter((s) => s.rel !== MODULE)
      .flatMap((s) => ecrituresDerivees(s.sf).map((e) => `${s.rel} : ${e}`));
    expect(fautes).toEqual([]);
  });

  it("les objets posés sur une réservation par une fonction partagée n'en portent pas non plus", () => {
    const personnel = SOURCES.find((s) => s.rel === "src/lib/personnel.ts")!;
    expect(personnel.code).not.toMatch(/statut_paiement:\s*"/);
  });

  it("aucune fonction SQL en vigueur n'écrit le statut de paiement d'une réservation", () => {
    const dossier = join(RACINE, "supabase", "migrations");
    const derniere = new Map<string, string>();
    for (const f of readdirSync(dossier).filter((x) => x.endsWith(".sql")).sort()) {
      const sql = readFileSync(join(dossier, f), "utf8");
      const re = /create\s+or\s+replace\s+function\s+(?:public\.)?(\w+)\s*\([\s\S]*?\$(\w*)\$([\s\S]*?)\$\2\$/gi;
      for (const m of sql.matchAll(re)) derniere.set(m[1], m[3]);
    }
    expect(derniere.has("payer_reservation_avec_avoir")).toBe(true);
    const fautes = [...derniere].filter(([, corps]) =>
      [...corps.matchAll(/update\s+(?:public\.)?reservations\b([\s\S]*?);/gi)]
        .some((u) => /statut_paiement\s*=|montant_paye\s*=/i.test(u[1])))
      .map(([nom]) => nom);
    expect(fautes).toEqual([]);
  });
});

/** Les fonctions qui, dans ce fichier, appellent la dérivation. */
function appelantsDeLaDerivation(rel: string): Set<string> {
  const s = SOURCES.find((x) => x.rel === rel);
  if (!s) throw new Error(`introuvable : ${rel}`);
  const noms = new Set<string>();
  const nomDe = (f: ts.Node): string | null => {
    if (ts.isFunctionDeclaration(f) && f.name) return f.name.text;
    if ((ts.isArrowFunction(f) || ts.isFunctionExpression(f)) && ts.isVariableDeclaration(f.parent)) return f.parent.name.getText(s.sf);
    return null;
  };
  const visiter = (n: ts.Node, courante: string | null) => {
    const nom = nomDe(n) ?? courante;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)
        && /^(recalculerPaiement|apresMouvementDePaiement)/.test(n.expression.text) && nom) {
      noms.add(nom);
    }
    ts.forEachChild(n, (c) => visiter(c, nom));
  };
  visiter(s.sf, null);
  return noms;
}

describe("chaque chemin de paiement se termine par la dérivation", () => {
  const CHEMINS: [string, string, string][] = [
    ["app/(admin)/(espace-comptabilite)/factures/actions.ts", "encaisser", "encaisser (fiche facture et fiche réservation)"],
    ["app/(admin)/(espace-comptabilite)/factures/actions.ts", "annulerPaiement", "annulation de paiement"],
    ["app/(admin)/(espace-comptabilite)/factures/actions.ts", "apresMouvementDePaiement", "après un mouvement"],
    ["app/(admin)/(espace-comptabilite)/factures/actions.ts", "emettreFactureAction", "émission d'une facture"],
    ["app/(admin)/(espace-comptabilite)/factures/actionsCreation.ts", "creerAvoir", "avoir (crédit ou remboursement)"],
    ["app/(admin)/(espace-comptabilite)/factures/actionsCreation.ts", "creerFactureLibre", "facture libre reprenant des réservations"],
    ["src/lib/factureResa.ts", "figerFactureResa", "émission au check-out"],
    ["src/lib/caisse.ts", "finaliserVente", "caisse avec report sur facture"],
    ["src/lib/caisse.ts", "retournerVente", "retour de caisse sur facture"],
    ["app/api/reservations/[id]/payer-avoir/route.ts", "POST", "paiement par avoir (espace client)"],
    ["src/lib/prixReservation.ts", "recalculerTotalEtPaiement", "prix modifié"],
    ["app/(admin)/(espace-clients)/reservations/[id]/modifier/actions.ts", "annulerReservation", "annulation avec mise en avoir"],
    ["src/lib/consommationAbonnement.ts", "consommerAbonnementResa", "réglée par carte"],
    ["src/lib/consommationAbonnement.ts", "recrediterAbonnementResa", "carte recréditée"],
    ["src/lib/reservationPersonnel.ts", "creerReservationsPersonnel", "réservation du personnel"],
  ];

  for (const [rel, fonction, quoi] of CHEMINS) {
    it(`${quoi} — ${fonction}`, () => {
      expect(appelantsDeLaDerivation(rel)).toContain(fonction);
    });
  }

  it("encaisser et annulerPaiement passent tous deux par apresMouvementDePaiement", () => {
    const code = SOURCES.find((s) => s.rel === "app/(admin)/(espace-comptabilite)/factures/actions.ts")!.code;
    expect(code.match(/await apresMouvementDePaiement\(/g)?.length).toBe(2);
    expect(code).not.toMatch(/rafraichirPaiementReservation/);
  });
});

describe("la fiche de réservation encaisse comme la fiche facture", () => {
  const bloc = SOURCES.find((s) => s.rel === "app/(admin)/(espace-clients)/reservations/[id]/BlocFacturation.tsx")!.code;
  const actions = SOURCES.find((s) => s.rel === "app/(admin)/(espace-comptabilite)/factures/actions.ts")!.code;

  it("le bouton vise la facture ouverte, et disparaît quand le reste dérivé est nul", () => {
    expect(bloc).toContain("lirePaiementsReservations([reservation.id])");
    expect(bloc).toMatch(/permEncaissements && reste > 0 && reservation\.statut !== "annulee"/);
    expect(bloc).toMatch(/factureId=\{ouverte \? \(ouverte\.id as string\) : null\}/);
  });

  it("côté serveur aussi : une réservation couverte par une facture ouverte encaisse sur la facture", () => {
    expect(actions).toMatch(/const ouverte = await factureOuverteDeReservation\(reservationId\);[\s\S]{0,80}factureId = ouverte\.id;[\s\S]{0,40}reservationId = null;/);
  });
});
