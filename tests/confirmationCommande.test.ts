import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  envoyerConfirmationCommande,
  factureArriveeAvecConfirmation,
  type DependancesConfirmation,
} from "@/src/lib/confirmationCommande";

/**
 * Commande en ligne : un seul e-mail, facture jointe quand le PDF existe.
 *
 * La facture n'est tenue pour arrivée — et retirée de l'envoi du matin — que si
 * la confirmation est partie AVEC le PDF. Sinon elle reste ouverte au
 * rattrapage : aucune commande ne reste sans sa facture.
 */

const PDF = Buffer.from("%PDF-1.4 facture");

function doublures(sur: {
  numero?: string | null;
  pdf?: Buffer | null;
  echec?: boolean;
  sansAdresse?: boolean;
} = {}) {
  const emails: { commandeId: string; facture: { numero: string; pdf: Buffer | null } | null }[] = [];
  const marquages: { factureId: string; options: { destinataire: string; exclureAuto: boolean; via: string } }[] = [];

  const deps: DependancesConfirmation = {
    lireNumeroFacture: async () => (sur.numero === undefined ? "FAC-2026-0300" : sur.numero),
    telechargerPdf: async () => (sur.pdf === undefined ? PDF : sur.pdf),
    envoyerConfirmation: async (commandeId, { facture }) => {
      emails.push({ commandeId, facture });
      if (sur.echec) throw new Error("Resend: quota dépassé");
      if (sur.sansAdresse) return { envoye: false, pdfJoint: false, destinataire: null };
      return { envoye: true, pdfJoint: !!facture?.pdf, destinataire: "client@exemple.ch" };
    },
    marquerFactureEnvoyee: async (factureId, options) => { marquages.push({ factureId, options }); },
  };
  return { deps, emails, marquages };
}

describe("un seul e-mail, facture comprise", () => {
  it("avec le PDF : un e-mail, PDF joint, facture marquée et exclue du matin", async () => {
    const { deps, emails, marquages } = doublures();
    const r = await envoyerConfirmationCommande("cmd-1", "fac-1", deps);

    expect(emails).toHaveLength(1);
    expect(emails[0].facture).toEqual({ numero: "FAC-2026-0300", pdf: PDF });
    expect(r).toEqual({ envoye: true, pdfJoint: true, factureMarquee: true, erreur: null });
    expect(marquages).toEqual([{
      factureId: "fac-1",
      options: { destinataire: "client@exemple.ch", exclureAuto: true, via: "commande_confirmee" },
    }]);
  });

  it("sans le PDF : un e-mail quand même, facture NON marquée donc rattrapée demain", async () => {
    const { deps, emails, marquages } = doublures({ pdf: null });
    const r = await envoyerConfirmationCommande("cmd-1", "fac-1", deps);

    expect(emails).toHaveLength(1);
    expect(emails[0].facture).toEqual({ numero: "FAC-2026-0300", pdf: null });
    expect(r.pdfJoint).toBe(false);
    expect(r.factureMarquee).toBe(false);
    // envoi_auto_exclu reste à false : rien ne l'a posé.
    expect(marquages).toHaveLength(0);
  });

  it("paiement au retrait : un e-mail, aucune facture en jeu", async () => {
    const { deps, emails, marquages } = doublures();
    const r = await envoyerConfirmationCommande("cmd-1", null, deps);

    expect(emails).toHaveLength(1);
    expect(emails[0].facture).toBeNull();
    expect(r.factureMarquee).toBe(false);
    expect(marquages).toHaveLength(0);
  });
});

describe("un échec ne ferme rien", () => {
  it("la confirmation échoue : rien n’est marqué, l’erreur est rendue, la commande tient", async () => {
    const { deps, emails, marquages } = doublures({ echec: true });
    const r = await envoyerConfirmationCommande("cmd-1", "fac-1", deps);

    expect(emails).toHaveLength(1);
    expect(r).toEqual({ envoye: false, pdfJoint: false, factureMarquee: false, erreur: "Resend: quota dépassé" });
    expect(marquages).toHaveLength(0);
  });

  it("client sans adresse : rien n’est parti, rien n’est marqué", async () => {
    const { deps, marquages } = doublures({ sansAdresse: true });
    const r = await envoyerConfirmationCommande("cmd-1", "fac-1", deps);
    expect(r.envoye).toBe(false);
    expect(marquages).toHaveLength(0);
  });

  it("facture sans numéro : rien à joindre, rien à marquer", async () => {
    const { deps, emails, marquages } = doublures({ numero: null });
    await envoyerConfirmationCommande("cmd-1", "fac-1", deps);
    expect(emails[0].facture).toBeNull();
    expect(marquages).toHaveLength(0);
  });
});

describe("la règle seule", () => {
  it("arrivée seulement si l’e-mail est parti, avec le PDF, pour une vraie facture", () => {
    expect(factureArriveeAvecConfirmation({ factureId: "f", envoye: true, pdfJoint: true })).toBe(true);
    expect(factureArriveeAvecConfirmation({ factureId: "f", envoye: true, pdfJoint: false })).toBe(false);
    expect(factureArriveeAvecConfirmation({ factureId: "f", envoye: false, pdfJoint: true })).toBe(false);
    expect(factureArriveeAvecConfirmation({ factureId: null, envoye: true, pdfJoint: true })).toBe(false);
  });
});

// ── Le dépôt ───────────────────────────────────────────────────────────────

const RACINE = join(__dirname, "..");
const lire = (...m: string[]) => readFileSync(join(RACINE, ...m), "utf8");

describe("l’e-mail et l’action", () => {
  const email = lire("src", "lib", "email.ts");
  const debut = email.indexOf("export async function envoyerEmailCommandeConfirmee");
  const corps = email.slice(debut, email.indexOf("\n}\n", debut));

  it("l’e-mail joint le PDF et le dit en une phrase", () => {
    expect(corps).toContain("piecesJointes: [{ filename:");
    expect(corps).toContain(
      "Votre facture n° ${echapper(facture!.numero)} est jointe ; vous la retrouvez aussi dans votre espace client."
    );
  });

  it("sans PDF, il annonce la facture pour plus tard ; au retrait, il n’en parle pas", () => {
    expect(corps).toContain("Votre facture vous parvient par un second e-mail");
    expect(corps).toContain("Vous réglerez votre commande au retrait.");
  });

  it("l’action de commande n’envoie plus la confirmation que par ce chemin", () => {
    const action = lire("app", "(public)", "catalogue", "actions.ts");
    expect(action).toContain("envoyerConfirmationCommande(res.id, factureId, {");
    // Un seul appel à l'e-mail de confirmation, et c'est celui qui est injecté.
    expect(action.match(/envoyerEmailCommandeConfirmee/g)).toHaveLength(2); // import + injection
    expect(action).not.toContain("envoyerEmailCommandeConfirmee(res.id)");
  });
});
