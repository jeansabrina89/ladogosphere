import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { ONGLETS_EMAILS, ongletEmails, requeteOnglet } from "@/src/lib/ongletsEmails";
import {
  USAGES,
  basculerUsage,
  fournisseurRetenu,
  lireUsages,
  usageDuCompte,
} from "@/src/lib/usagesFournisseurs";

const lire = (chemin: string) => readFileSync(join(__dirname, "..", chemin), "utf8");

describe("Réglages → E-mails en onglets", () => {
  it("trois onglets, dans cet ordre", () => {
    expect(ONGLETS_EMAILS.map((o) => o.libelle)).toEqual(["Modèles", "Message aux membres", "Envoi de test"]);
  });

  it("l'onglet vit dans l'adresse ; « Modèles » par défaut", () => {
    expect(ongletEmails("test")).toBe("test");
    expect(ongletEmails("message")).toBe("message");
    expect(ongletEmails(undefined)).toBe("modeles");
    expect(ongletEmails("autre")).toBe("modeles");
    expect(ongletEmails(["test", "message"])).toBe("test");
    expect(requeteOnglet("test")).toBe("?onglet=test");
    expect(requeteOnglet("modeles")).toBe("");
  });

  it("chaque bloc est dans son onglet, inchangé : l'avis Google avec les modèles, le test à part", () => {
    const source = lire("app/(admin)/(espace-reglages)/emails/GestionEmails.tsx");
    const panneau = (cle: string) => {
      const debut = source.indexOf(`{onglet === "${cle}" && (`);
      return source.slice(debut, source.indexOf(")}", source.indexOf("</div>", debut)));
    };
    expect(panneau("modeles")).toContain("<LienAvisGoogle");
    expect(panneau("modeles")).toContain("<CarteEmail");
    expect(panneau("message")).toContain("<MessageMembres");
    expect(panneau("test")).toContain("<EnvoiDeTest");
    // Le test n'occupe plus le haut de la page : il n'apparaît qu'une fois, dans son onglet.
    expect(source.match(/<EnvoiDeTest /g)).toHaveLength(1);
    expect(source).toContain("router.replace(`${chemin}${requeteOnglet(o)}`");
    expect(lire("app/(admin)/(espace-reglages)/emails/page.tsx")).toContain("ongletInitial={ongletEmails(onglet)}");
  });
});

describe("fournisseurs groupés par usage", () => {
  it("la table compte → usage", () => {
    expect(usageDuCompte("4200")).toBe("magasin");
    expect(usageDuCompte("4000")).toBe("atelier");
    expect(usageDuCompte("4400")).toBe("pension");
    expect(usageDuCompte("4410")).toBe("pension");
    expect(usageDuCompte("6000")).toBe("loyer");
    expect(usageDuCompte("6099")).toBe("loyer");
    expect(usageDuCompte("6300")).toBe("assurances");
    expect(usageDuCompte("6399")).toBe("assurances");
    expect(usageDuCompte(null)).toBe("sans_compte");
    expect(usageDuCompte("  ")).toBe("sans_compte");
  });

  it("un compte hors de toute plage tombe dans « Frais généraux »", () => {
    for (const c of ["6100", "6299", "6400", "4100", "4401", "6500", "8000", "abc"]) {
      expect(usageDuCompte(c), c).toBe("frais_generaux");
    }
  });

  it("les pastilles : union, rien de coché = tout, et une couleur par usage", () => {
    expect(fournisseurRetenu("4200", [])).toBe(true);
    expect(fournisseurRetenu("4200", ["atelier"])).toBe(false);
    expect(fournisseurRetenu("4200", ["atelier", "magasin"])).toBe(true);
    expect(fournisseurRetenu(null, ["sans_compte"])).toBe(true);
    expect(lireUsages("magasin,inconnu,atelier,magasin")).toEqual(["magasin", "atelier"]);
    expect(basculerUsage(["atelier"], "magasin")).toBe("?usages=magasin,atelier");
    expect(basculerUsage(["magasin"], "magasin")).toBe("");
    expect(new Set(USAGES.map((u) => u.fond)).size).toBe(USAGES.length);
    expect(USAGES.map((u) => u.libelle)).toEqual(
      ["Magasin", "Atelier", "Pension", "Loyer et locaux", "Assurances", "Frais généraux", "Sans compte"]);
  });

  it("la page filtre par cette table et pose la même pastille sur chaque ligne", () => {
    const page = lire("app/(admin)/(espace-comptabilite)/comptabilite/fournisseurs/page.tsx");
    expect(page).toContain("fournisseurRetenu(f.compte_charge_defaut as string | null, coches)");
    expect(page).toContain("infoUsage(usageDuCompte(f.compte_charge_defaut as string | null))");
    // Un seul fichier porte la correspondance : pas de « 4200 » écrit dans la page.
    expect(page).not.toMatch(/"4200"|"4000"|"44[01]0"/);
  });
});
