import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  facturesAEnvoyerCeMatin,
  factureAEnvoyerCeMatin,
  jourEmission,
  raisonDeNePasEnvoyer,
  type FactureCandidate,
} from "@/src/lib/facturesOuvertesLogique";

/**
 * Une facture ne part plus à son émission : elle part le lendemain matin, si
 * elle est encore impayée, et une seule fois.
 */

const AUJOURDHUI = "2026-09-16";

/** Une facture émise hier, impayée, jamais envoyée : le cas qui part. */
function facture(sur: Partial<FactureCandidate> = {}): FactureCandidate {
  return {
    id: "f1",
    type: "facture",
    numero: "FAC-2026-0100",
    statut: "envoyee",
    montant_restant: 120,
    email_envoye_le: null,
    envoi_auto_exclu: false,
    emise_le: "2026-09-15T14:30:00.000Z",
    date_facture: "2026-09-15",
    email_client: "client@exemple.ch",
    ...sur,
  };
}

describe("ce qui part ce matin", () => {
  it("une facture impayée émise hier → part", () => {
    expect(factureAEnvoyerCeMatin(facture(), AUJOURDHUI)).toBe(true);
  });

  it("une facture libre ou d’acompte part aussi : seul l’avoir est exclu", () => {
    // Les factures de commande, de caisse et de l'assistant sont de type
    // « libre » ; sans elles, le rattrapage du lendemain ne vaudrait rien.
    expect(factureAEnvoyerCeMatin(facture({ type: "libre" }), AUJOURDHUI)).toBe(true);
    expect(factureAEnvoyerCeMatin(facture({ type: "acompte" }), AUJOURDHUI)).toBe(true);
  });

  it("une facture partiellement payée, avec un reste dû → part", () => {
    expect(factureAEnvoyerCeMatin(
      facture({ statut: "partiellement_reglee", montant_restant: 40 }), AUJOURDHUI
    )).toBe(true);
  });
});

describe("ce qui ne part pas", () => {
  it("payée → non", () => {
    expect(raisonDeNePasEnvoyer(facture({ montant_restant: 0 }), AUJOURDHUI)).toBe("payée");
    expect(raisonDeNePasEnvoyer(facture({ statut: "acquittee", montant_restant: 0 }), AUJOURDHUI))
      .not.toBeNull();
  });

  it("déjà envoyée → non : une facture ne part qu’une fois", () => {
    expect(raisonDeNePasEnvoyer(
      facture({ email_envoye_le: "2026-09-15T15:00:00.000Z" }), AUJOURDHUI
    )).toBe("déjà envoyée");
  });

  it("exclue de l’envoi du matin → non (locataire, commande déjà confirmée)", () => {
    expect(raisonDeNePasEnvoyer(facture({ envoi_auto_exclu: true }), AUJOURDHUI))
      .toBe("exclue de l'envoi du matin");
  });

  it("émise aujourd’hui → non ; le lendemain → oui", () => {
    const ceMatin = facture({ emise_le: "2026-09-16T06:10:00.000Z", date_facture: "2026-09-16" });
    expect(raisonDeNePasEnvoyer(ceMatin, "2026-09-16")).toBe("émise aujourd'hui");
    expect(factureAEnvoyerCeMatin(ceMatin, "2026-09-17")).toBe(true);
  });

  it("un avoir → jamais, même « ouvert », même impayé, même des mois plus tard", () => {
    // En base, les avoirs portent statut « envoyee » et un reste positif :
    // sans cette exclusion, chacun partirait comme une facture à payer.
    const avoir = facture({ type: "avoir", statut: "envoyee", montant_restant: 80 });
    for (const jour of ["2026-09-17", "2026-12-31", "2027-06-01"]) {
      expect(factureAEnvoyerCeMatin(avoir, jour), jour).toBe(false);
    }
  });

  it("brouillon, annulée ou client sans adresse → non", () => {
    expect(factureAEnvoyerCeMatin(facture({ numero: null }), AUJOURDHUI)).toBe(false);
    expect(factureAEnvoyerCeMatin(facture({ statut: "brouillon" }), AUJOURDHUI)).toBe(false);
    expect(factureAEnvoyerCeMatin(facture({ statut: "annulee_par_avoir" }), AUJOURDHUI)).toBe(false);
    expect(factureAEnvoyerCeMatin(facture({ email_client: "  " }), AUJOURDHUI)).toBe(false);
    expect(factureAEnvoyerCeMatin(facture({ email_client: null }), AUJOURDHUI)).toBe(false);
  });
});

describe("le jour d’émission", () => {
  it("se lit à l’heure de Sion, pas en UTC", () => {
    // 23 h 30 UTC le 15 = 1 h 30 à Sion le 16 : émise le 16.
    expect(jourEmission({ emise_le: "2026-09-15T23:30:00.000Z", date_facture: "2026-09-15" }))
      .toBe("2026-09-16");
  });

  it("vient de l’horodatage d’émission, pas de la date de la pièce", () => {
    // Une facture de séjour datée du séjour mais émise ce matin attend demain.
    const f = facture({ date_facture: "2026-08-01", emise_le: "2026-09-16T07:05:00.000Z" });
    expect(factureAEnvoyerCeMatin(f, "2026-09-16")).toBe(false);
  });

  it("retombe sur la date de la pièce quand l’horodatage manque", () => {
    expect(jourEmission({ emise_le: null, date_facture: "2026-09-10" })).toBe("2026-09-10");
    expect(factureAEnvoyerCeMatin(facture({ emise_le: null, date_facture: "2026-09-10" }), AUJOURDHUI))
      .toBe(true);
  });
});

describe("la liste complète", () => {
  it("ne garde que ce qui part, dans l’ordre reçu", () => {
    const liste = [
      facture({ id: "part" }),
      facture({ id: "payee", montant_restant: 0 }),
      facture({ id: "avoir", type: "avoir" }),
      facture({ id: "aussi", type: "libre" }),
    ];
    expect(facturesAEnvoyerCeMatin(liste, AUJOURDHUI).map((f) => f.id)).toEqual(["part", "aussi"]);
  });
});

// ── Le dépôt ───────────────────────────────────────────────────────────────

const RACINE = join(__dirname, "..");
const lire = (...m: string[]) => readFileSync(join(RACINE, ...m), "utf8");
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("l’émission n’envoie plus rien", () => {
  const source = lire("src", "lib", "factureDocument.ts");

  /** Le corps de la fonction, de sa signature à l’accolade qui la ferme. */
  function corps(nom: string): string {
    const debut = source.indexOf(`export async function ${nom}`);
    expect(debut, `${nom} introuvable`).toBeGreaterThan(-1);
    const fin = source.indexOf("\n}\n", debut);
    return sansCommentaires(source.slice(debut, fin));
  }

  it("finaliserEmission n’appelle aucune fonction d’envoi d’e-mail", () => {
    const f = corps("finaliserEmission");
    expect(f).not.toMatch(/\benvoyer\w*\s*\(/);
    expect(f).not.toContain("@/src/lib/email");
    expect(f).not.toMatch(/resend/i);
    // Et elle fait toujours son travail : le document.
    expect(f).toContain("genererPdfFacture(");
  });

  it("le garde-fou attrape bien un envoi (garde-fou du garde-fou)", () => {
    const factice = "export async function x() {\n  await envoyerFactureParEmail(id);\n}\n";
    expect(sansCommentaires(factice)).toMatch(/\benvoyer\w*\s*\(/);
  });

  it("un envoi réussi, et lui seul, pose email_envoye_le", () => {
    const f = corps("envoyerFactureParEmail");
    const echec = f.indexOf("catch (e)");
    const marque = f.indexOf("marquerFactureEnvoyee(");
    expect(echec).toBeGreaterThan(-1);
    // La marque vient APRÈS le bloc d'erreur, qui rend sans rien poser.
    expect(marque).toBeGreaterThan(echec);
    expect(f.slice(echec, marque)).toContain("return { error:");
  });
});

describe("l’envoi du matin", () => {
  const route = lire("app", "api", "cron", "quotidien-matin", "route.ts");

  it("vit au nouveau chemin, que vercel.json appelle à 7 h", () => {
    const vercel = JSON.parse(lire("vercel.json")) as { crons: { path: string; schedule: string }[] };
    expect(vercel.crons).toContainEqual({ path: "/api/cron/quotidien-matin", schedule: "0 7 * * *" });
    expect(vercel.crons.some((c) => c.path.includes("rappel-cotisation"))).toBe(false);
  });

  it("tranche avec la règle testée ici, et envoie par le chemin commun", () => {
    expect(route).toContain("facturesAEnvoyerCeMatin(");
    expect(route).toContain("envoyerFactureParEmail(");
    expect(route).toContain('.neq("type", "avoir")');
  });

  it("rend compte des deux tâches, et trace aussi les échecs", () => {
    expect(route).toContain("return NextResponse.json({ ok: true, date: aujourdhui, adhesions, factures })");
    expect(route).toContain('evenement: "envoi_echec"');
  });
});
