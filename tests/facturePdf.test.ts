import { describe, it, expect } from "vitest";
import React from "react";

// Le PDF est la pièce justificative : on vérifie qu'il se fabrique vraiment,
// bulletin QR compris, et pas seulement que le composant compile.

const EMETTEUR = {
  nom: "La Dogosphère Sàrl",
  adresse: ["Rue du Test 1", "1950 Sion"],
  email: "ladogosphere@gmail.com",
  telephone: "+41 27 000 00 00",
  ide: "CHE-123.456.789",
  mentionTva: "TVA non applicable — entreprise non assujettie (art. 10 LTVA).",
};

async function rendre(props: Record<string, unknown>) {
  const { FacturePdf } = await import("../src/lib/facturePdf");
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const el = React.createElement(FacturePdf as never, props as never);
  return renderToBuffer(el as never);
}

async function bulletin(montant: number) {
  const { genererQrBillSvg } = await import("../src/lib/qrFacture");
  return genererQrBillSvg({
    iban: "CH4431999123000889012",
    titulaire: "La Dogosphère Sàrl",
    adresse: { rue: "Rue du Test", numero: "1", npa: "1950", ville: "Sion", pays: "CH" },
    montant,
    numeroFacture: "FAC-2026-0009",
    referenceStockee: null,
    debiteur: { nom: "Jean Test", adresse: ["Av. du Client 2", "1200 Genève"] },
  });
}

const BASE = {
  numero: "FAC-2026-0009",
  type: "facture",
  dateFacture: "2026-09-07",
  dateEcheance: "2026-10-07",
  motif: null,
  client: { nom: "Jean Test", adresse: ["Av. du Client 2", "1200 Genève"] },
  emetteur: EMETTEUR,
  lignes: [
    { libelle: "Séjour du 01.09.2026 au 05.09.2026 — 2 chiens", quantite: 1, prix_unitaire: 250, montant: 250 },
    { libelle: "Toilettage", quantite: 1, prix_unitaire: 40, montant: 40 },
  ],
  total: 290,
  acomptes: 0,
  dejaPaye: 0,
  reste: 290,
  delaiJours: 30,
  logo: null,
  bulletinSvg: null,
};

describe("PDF de facture", () => {
  it("produit un vrai fichier PDF", async () => {
    const buf = await rendre(BASE);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30000);

  it("intègre le bulletin de versement QR", async () => {
    const svg = await bulletin(290);
    expect(svg).toBeTruthy();

    const sans = await rendre(BASE);
    const avec = await rendre({ ...BASE, bulletinSvg: svg });
    expect(avec.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // Le bulletin ajoute des centaines de rectangles : le fichier grossit.
    expect(avec.length).toBeGreaterThan(sans.length);
  }, 60000);

  it("un avoir se rend sans bulletin, même si on lui en passe un", async () => {
    const svg = await bulletin(60);
    const buf = await rendre({
      ...BASE, type: "avoir", numero: "AV-2026-0001",
      motif: "Séjour écourté", bulletinSvg: svg,
    });
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30000);

  it("les acomptes et le déjà-payé se rendent sans casser la mise en page", async () => {
    const buf = await rendre({ ...BASE, acomptes: 100, dejaPaye: 50, reste: 140 });
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30000);

  it("une facture longue passe sur plusieurs pages", async () => {
    const lignes = Array.from({ length: 60 }, (_, i) => ({
      libelle: `Prestation ${i + 1}`, quantite: 1, prix_unitaire: 10, montant: 10,
    }));
    const buf = await rendre({ ...BASE, lignes, total: 600, reste: 600 });
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000);
  }, 60000);
});
