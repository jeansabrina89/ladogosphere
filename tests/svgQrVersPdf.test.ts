import { describe, it, expect } from "vitest";
import { versPoints, analyserSvg } from "../src/lib/svgQrVersPdf";

const PT_MM = 72 / 25.4;

describe("conversion des unités du bulletin", () => {
  it("les millimètres deviennent des points", () => {
    expect(versPoints("67mm")).toBeCloseTo(67 * PT_MM, 4);
    expect(versPoints("0mm")).toBe(0);
  });
  it("points et pixels sont déjà des unités utilisateur", () => {
    expect(versPoints("30pt")).toBe(30);
    expect(versPoints("11px")).toBe(11);
    expect(versPoints("229.08070866141733")).toBeCloseTo(229.0807, 4);
  });
  it("les pourcentages retombent sur la valeur par défaut", () => {
    expect(versPoints("100%", 42)).toBe(42);
  });
  it("une valeur absente ou illisible retombe sur le défaut", () => {
    expect(versPoints(undefined, 7)).toBe(7);
    expect(versPoints("", 7)).toBe(7);
    expect(versPoints("abc", 7)).toBe(7);
  });
});

describe("analyse de la chaîne SVG", () => {
  it("lit les attributs et l'imbrication", () => {
    const n = analyserSvg('<svg width="210mm"><g x="1mm"><rect x="2mm" y="3mm" /></g></svg>');
    expect(n?.tag).toBe("svg");
    expect(n?.attrs.width).toBe("210mm");
    expect(n?.enfants).toHaveLength(1);
    expect(n?.enfants[0].tag).toBe("g");
    expect(n?.enfants[0].enfants[0].attrs.y).toBe("3mm");
  });

  it("récupère le texte des tspan", () => {
    const n = analyserSvg('<svg><text><tspan x="0" y="0">Récépissé</tspan></text></svg>');
    expect(n?.enfants[0].enfants[0].texte).toBe("Récépissé");
  });

  it("gère les balises auto-fermantes sans casser la pile", () => {
    const n = analyserSvg('<svg><rect x="0" /><line x1="1" /><rect x="2" /></svg>');
    expect(n?.enfants.map((e) => e.tag)).toEqual(["rect", "line", "rect"]);
  });

  it("une chaîne vide ne renvoie rien plutôt que de jeter", () => {
    expect(analyserSvg("")).toBeNull();
  });
});

describe("sur le vrai bulletin swissqrbill", () => {
  // Import dynamique : swissqrbill est ESM et lourd, on ne le charge qu'ici.
  it("le QR code tombe bien à sa place normalisée (67 mm, 17 mm, 46 × 46 mm)", async () => {
    const { SwissQRBill } = await import("swissqrbill/svg");
    const svg = new SwissQRBill(
      {
        currency: "CHF",
        amount: 250,
        creditor: {
          account: "CH4431999123000889012", name: "La Dogosphère",
          address: "Rue Test", buildingNumber: "1", zip: "1000", city: "Lausanne", country: "CH",
        },
        debtor: {
          name: "Jean Test", address: "Av. Client",
          buildingNumber: "2", zip: "1200", city: "Genève", country: "CH",
        },
        reference: "000000000000000000202600084",
      },
      { language: "FR" },
    ).toString();

    const racine = analyserSvg(svg);
    expect(racine?.tag).toBe("svg");
    expect(racine?.attrs.width).toBe("210mm");
    expect(racine?.attrs.height).toBe("105mm");

    const qr = racine!.enfants.find(
      (e) => e.tag === "svg" && e.attrs.width === "46mm" && e.attrs.height === "46mm",
    );
    expect(qr).toBeDefined();
    expect(versPoints(qr!.attrs.x)).toBeCloseTo(67 * PT_MM, 3);
    expect(versPoints(qr!.attrs.y)).toBeCloseTo(17 * PT_MM, 3);
    // Le QR est une grille de modules carrés.
    expect(qr!.enfants.filter((e) => e.tag === "rect").length).toBeGreaterThan(100);
  });

  it("le débiteur figure bien sur le bulletin", async () => {
    const { SwissQRBill } = await import("swissqrbill/svg");
    const svg = new SwissQRBill(
      {
        currency: "CHF", amount: 250,
        creditor: {
          account: "CH4431999123000889012", name: "La Dogosphère",
          address: "Rue Test", buildingNumber: "1", zip: "1000", city: "Lausanne", country: "CH",
        },
        debtor: {
          name: "Jean Test", address: "Av. Client",
          buildingNumber: "2", zip: "1200", city: "Genève", country: "CH",
        },
        reference: "000000000000000000202600084",
      },
      { language: "FR" },
    ).toString();

    expect(svg).toContain("Jean Test");
    expect(svg).toContain("Genève");
  });

  it("aucun élément inconnu du convertisseur", async () => {
    const { SwissQRBill } = await import("swissqrbill/svg");
    const svg = new SwissQRBill(
      {
        currency: "CHF", amount: 250,
        creditor: {
          account: "CH4431999123000889012", name: "La Dogosphère",
          address: "Rue Test", buildingNumber: "1", zip: "1000", city: "Lausanne", country: "CH",
        },
        reference: "000000000000000000202600084",
      },
      { language: "FR" },
    ).toString();

    const connus = new Set(["svg", "g", "rect", "line", "path", "text", "tspan"]);
    const balises = new Set([...svg.matchAll(/<([a-zA-Z][\w:-]*)[\s/>]/g)].map((m) => m[1]));
    for (const b of balises) expect(connus.has(b)).toBe(true);
  });
});
