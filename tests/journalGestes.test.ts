import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/src/lib/supabase-admin", () => ({ supabaseAdmin: {} }));
const { libelleEvenement } = await import("@/src/lib/journalEvenements");

/**
 * Chaque geste du personnel (ou du client) laisse une trace.
 *
 * Ce test relit le dépôt : toute fonction qui insère ou modifie une ligne de
 * reservations, reservation_chiens, paiements_resa, ventes, clients ou chiens
 * doit appeler tracerEvenement DANS LA MÊME FONCTION (la fonction de plus haut
 * niveau qui contient l'écriture). Une écriture sans trace est soit un oubli,
 * soit une exception écrite ci-dessous avec sa raison.
 *
 * Les ventes, retours et remises passent par des fonctions SQL qui journalisent
 * elles-mêmes (p_user_id) : ils n'écrivent pas `ventes` depuis TypeScript.
 */

const TABLES = new Set(["reservations", "reservation_chiens", "paiements_resa", "ventes", "clients", "chiens"]);
const ECRITURES = new Set(["insert", "update", "upsert"]);

/**
 * Écritures sans trace, chacune pour une raison. La clé est
 * « fichier::fonction ». Toute entrée ici doit dire pourquoi ce n'est pas un geste.
 */
const EXCEPTIONS: Record<string, string> = {
  "app/(admin)/(espace-clients)/reservations/actionsPersonnel.ts::marquerReservationsPersonnelVues":
    "Marque des réservations comme vues pour éteindre un badge : un état d'écran, rien ne change pour la réservation.",
  "app/(admin)/(espace-comptabilite)/factures/actions.ts::rafraichirPaiementReservation":
    "Recalcule montant_paye depuis paiements_resa ; appelée par encaisser et annulerPaiement, qui tracent le geste.",
  "src/lib/comptaResa.ts::marquerStatutCompta":
    "État technique de la synchronisation comptable (compta_synchronisee, compta_erreur).",
  "src/lib/prixReservation.ts::recalculerTotalEtPaiement":
    "Dérive montant_final et statut_paiement ; toujours appelée par un geste tracé (prix, ligne, encaissement).",
  "src/lib/prixReservation.ts::assurerMontantCalcule":
    "Pose le prix manquant au moment de la validation, qui porte sa propre trace.",
  "src/lib/essaiReservation.ts::marquerChiensEssaiProgramme":
    "Conséquence de la création ou de la validation d'une journée d'essai, déjà tracées.",
  "src/lib/consommationAbonnement.ts::consommerAbonnementResa":
    "Débit de la carte ; l'appelant (reglerReservationAvecAbonnement) trace le règlement avec son auteur.",
  "src/lib/consommationAbonnement.ts::recrediterAbonnementResa":
    "Recrédit de la carte, conséquence d'une annulation déjà tracée par la route de statut.",
  "src/lib/cohabitationDb.ts::appliquerCohabitationClient":
    "Appelée par creerChienClient et modifierChienClient, qui tracent le geste du client.",
};

function fichiers(dossier: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dossier)) {
    if (e === "node_modules" || e === ".next") continue;
    const p = join(dossier, e);
    if (statSync(p).isDirectory()) out.push(...fichiers(p));
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

type Fonction = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration;

const estFonction = (n: ts.Node): n is Fonction =>
  ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n);

function nomDe(f: Fonction, sf: ts.SourceFile): string {
  if (ts.isFunctionDeclaration(f) && f.name) return f.name.text;
  if (ts.isMethodDeclaration(f)) return f.name.getText(sf);
  if (ts.isVariableDeclaration(f.parent)) return f.parent.name.getText(sf);
  return "(anonyme)";
}

function fonctionHaute(n: ts.Node): Fonction | null {
  let haute: Fonction | null = null;
  for (let c: ts.Node | undefined = n; c; c = c.parent) if (estFonction(c)) haute = c;
  return haute;
}

/** Le verbe d'écriture d'une chaîne `.from("table").update(...)…`, s'il y en a un. */
function ecritureDe(from: ts.CallExpression): string | null {
  let n: ts.Node = from;
  while (ts.isPropertyAccessExpression(n.parent) && ts.isCallExpression(n.parent.parent)) {
    const verbe = n.parent.name.text;
    if (ECRITURES.has(verbe)) return verbe;
    n = n.parent.parent;
  }
  return null;
}

function contientTrace(f: Fonction): boolean {
  let trouve = false;
  const visiter = (n: ts.Node) => {
    if (trouve) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "tracerEvenement") {
      trouve = true;
      return;
    }
    ts.forEachChild(n, visiter);
  };
  visiter(f);
  return trouve;
}

type Ecriture = { cle: string; table: string; verbe: string; trace: boolean };

function recenser(): Ecriture[] {
  const racine = process.cwd();
  const out: Ecriture[] = [];
  for (const chemin of [...fichiers(join(racine, "app")), ...fichiers(join(racine, "src"))]) {
    const texte = readFileSync(chemin, "utf8");
    if (!/from\(\s*["'](reservations|reservation_chiens|paiements_resa|ventes|clients|chiens)["']/.test(texte)) continue;
    const sf = ts.createSourceFile(chemin, texte, ts.ScriptTarget.Latest, true,
      chemin.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const rel = relative(racine, chemin).split("\\").join("/");

    const visiter = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
          && n.expression.name.text === "from" && n.arguments.length === 1
          && ts.isStringLiteral(n.arguments[0]) && TABLES.has(n.arguments[0].text)) {
        const verbe = ecritureDe(n);
        const f = fonctionHaute(n);
        if (verbe && f) {
          out.push({
            cle: `${rel}::${nomDe(f, sf)}`,
            table: n.arguments[0].text,
            verbe,
            trace: contientTrace(f),
          });
        }
      }
      ts.forEachChild(n, visiter);
    };
    visiter(sf);
  }
  return out;
}

const ecritures = recenser();

describe("journal : chaque écriture métier a sa trace", () => {
  it("trouve bien des écritures (le test lit le dépôt, pas le vide)", () => {
    expect(ecritures.length).toBeGreaterThan(40);
    expect(ecritures.some((e) => e.cle.endsWith("checkinCheckout.ts::appliquerCheckout"))).toBe(true);
  });

  it("toute fonction qui écrit sur les six tables appelle tracerEvenement, sauf exception motivée", () => {
    const oublis = [...new Set(
      ecritures.filter((e) => !e.trace && !EXCEPTIONS[e.cle]).map((e) => `${e.cle} (${e.table}.${e.verbe})`)
    )];
    expect(oublis).toEqual([]);
  });

  it("chaque exception existe encore et n'a pas, entre-temps, reçu sa trace", () => {
    for (const cle of Object.keys(EXCEPTIONS)) {
      const concernees = ecritures.filter((e) => e.cle === cle);
      expect(concernees.length, `exception périmée : ${cle}`).toBeGreaterThan(0);
      expect(concernees.every((e) => !e.trace), `exception devenue inutile : ${cle}`).toBe(true);
      expect(EXCEPTIONS[cle].length, `raison manquante : ${cle}`).toBeGreaterThan(20);
    }
  });

  it("les gestes du minimum demandé sont tracés là où ils se font", () => {
    const traces = new Set(ecritures.filter((e) => e.trace).map((e) => e.cle));
    for (const cle of [
      "src/lib/checkinCheckout.ts::appliquerCheckout",
      "src/lib/checkinCheckout.ts::enregistrerResultatEssai",
      "app/api/reservations/route.ts::POST",
      "app/api/reservations/client/route.ts::POST",
      "app/(admin)/(espace-clients)/reservations/nouvelle/actions.ts::creerReservation",
      "app/(client)/mon-compte/reservations/actions.ts::creerDemandeReservation",
      "app/api/reservations/[id]/statut/route.ts::POST",
      "app/(admin)/(espace-clients)/reservations/[id]/modifier/actions.ts::modifierReservation",
      "app/(admin)/(espace-clients)/reservations/[id]/modifier/actions.ts::annulerReservation",
      "app/(admin)/(espace-comptabilite)/factures/actions.ts::encaisser",
      "app/(admin)/(espace-comptabilite)/factures/actions.ts::annulerPaiement",
      "app/api/clients/cotisation/route.ts::POST",
      "app/(admin)/(espace-clients)/clients/nouveau/actions.ts::creerClient",
      "app/(admin)/(espace-clients)/clients/[id]/modifier/actions.ts::modifierClient",
      "app/(admin)/(espace-clients)/chiens/nouveau/actions.ts::creerChien",
      "app/(admin)/(espace-clients)/chiens/[id]/modifier/actions.ts::modifierChien",
    ]) {
      expect(traces.has(cle), cle).toBe(true);
    }
  });

  it("l'arrivée passe par le même chemin d'auteur que le départ", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/checkinCheckout.ts"), "utf8");
    expect(src).toMatch(/tracerPointage\(checkinId, "arrivee", profilId\)/);
    const route = readFileSync(join(process.cwd(), "app/api/checkin/[id]/route.ts"), "utf8");
    expect(route).toMatch(/appliquerCheckin\(id, user\?\.id \?\? null\)/);
    expect(route).toMatch(/annulerCheckout\(id, user\?\.id \?\? null\)/);
  });
});

describe("journal : chaque code de geste a son libellé", () => {
  it("aucun code ne s'affiche brut à l'écran", () => {
    const codes: [string, string][] = [
      ["reservation", "creation"], ["reservation", "validation"], ["reservation", "refus"],
      ["reservation", "annulation"], ["reservation", "modification"], ["reservation", "box"],
      ["reservation", "prix_modifie"], ["reservation", "prix_recalcule"],
      ["reservation", "extra_ajoute"], ["reservation", "extra_retire"],
      ["reservation", "arrivee"], ["reservation", "depart"], ["reservation", "arrivee_annulee"],
      ["reservation", "depart_annule"], ["reservation", "relance"], ["reservation", "demande_paiement"],
      ["chien", "creation"], ["chien", "modification"], ["chien", "resultat_essai"],
      ["client", "creation"], ["client", "modification"], ["client", "adhesion_enregistree"],
      ["client", "adhesion_payee"], ["client", "adhesion_paiement_annule"], ["client", "inscription"],
      ["paiement", "paiement"], ["paiement", "paiement_annule"], ["paiement", "paiement_avoir"],
      ["paiement", "paiement_abonnement"], ["vente", "vente"], ["vente", "retour"],
      ["abonnement", "abonnement_commande"], ["campagne", "message_libre"],
    ];
    for (const [entite, code] of codes) {
      expect(libelleEvenement(code, entite), `${entite}/${code}`).not.toBe(code);
    }
  });

  it("tout code littéral passé à tracerEvenement dans le dépôt a un libellé", () => {
    const racine = process.cwd();
    const manquants: string[] = [];
    for (const chemin of [...fichiers(join(racine, "app")), ...fichiers(join(racine, "src"))]) {
      const texte = readFileSync(chemin, "utf8");
      if (!texte.includes("tracerEvenement(")) continue;
      const sf = ts.createSourceFile(chemin, texte, ts.ScriptTarget.Latest, true);
      const visiter = (n: ts.Node) => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "tracerEvenement"
            && n.arguments[0] && ts.isObjectLiteralExpression(n.arguments[0])) {
          let entite: string | null = null;
          const evenements: string[] = [];
          for (const p of n.arguments[0].properties) {
            if (!ts.isPropertyAssignment(p)) continue;
            const nom = p.name.getText(sf);
            const lire = (e: ts.Expression) => {
              if (ts.isStringLiteral(e)) evenements.push(e.text);
              else if (ts.isConditionalExpression(e)) { lire(e.whenTrue); lire(e.whenFalse); }
            };
            if (nom === "entite" && ts.isStringLiteral(p.initializer)) entite = p.initializer.text;
            if (nom === "evenement") lire(p.initializer);
          }
          // Les gestes du personnel : réservation, chien, client, paiement, vente.
          if (entite && ["reservation", "chien", "client", "paiement", "vente"].includes(entite)) {
            for (const ev of evenements) {
              if (libelleEvenement(ev, entite) === ev) manquants.push(`${entite}/${ev}`);
            }
          }
        }
        ts.forEachChild(n, visiter);
      };
      visiter(sf);
    }
    expect([...new Set(manquants)]).toEqual([]);
  });
});
