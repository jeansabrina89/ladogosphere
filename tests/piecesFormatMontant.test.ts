import { inflateSync } from "node:zlib";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";
import React from "react";
import { formatPrixFacture } from "@/src/lib/prixClient";
import { pourPdf } from "@/src/lib/texteWinAnsi";

/**
 * Les pièces écrivent toutes leurs montants de la même façon.
 *
 * ── CE QUI A MOTIVÉ CE FICHIER ────────────────────────────────────────────
 *
 * Les PDF passaient par `Intl.NumberFormat("fr-CH")`, qui rend « 226,50 » et
 * « 1'250,50 » — avec une VIRGULE décimale. L'écran des factures, lui, rendait
 * « 226.50 ». La cliente recevait donc un e-mail dont le corps et la pièce
 * jointe n'écrivaient pas le même montant de la même façon.
 *
 * Et `Intl` dépend de la version d'ICU embarquée par le runtime : un PDF émis
 * est une pièce justificative figée pour dix ans, son écriture ne peut pas
 * dépendre de la machine qui l'a produit un jour donné. C'est le dernier
 * describe qui tient cette règle-là, pour tous les fichiers de pièces.
 *
 * ── CE QUI NE PASSE PAS PAR LÀ, ET CE N'EST PAS UN OUBLI ──────────────────
 *
 * Le bulletin QR et les exports CSV suivent des règles qui ne sont pas les
 * nôtres. Des tests le disent explicitement, pour qu'un futur lot ne les
 * « aligne » pas en croyant finir le travail.
 */

// ── L'extraction du texte d'un PDF react-pdf ──────────────────────────────

/**
 * Le texte réellement écrit dans le PDF, run par run.
 *
 * react-pdf compresse ses flux de contenu (Flate) et n'écrit PAS le texte en
 * chaînes littérales : il l'écrit en HEXADÉCIMAL, `[<31273235302E3530> 0] TJ`,
 * un run par appel. Les octets sont ceux de WinAnsi, donc directement lisibles
 * en latin1 — c'est la même raison pour laquelle U+2212 ne s'imprime pas.
 *
 * Un run s'arrête à l'espace : « 1'250.50 CHF » sort en deux runs, `"1'250.50 "`
 * puis `"CHF"`. On les recolle pour lire le document.
 */
function runsDuPdf(buf: Buffer): string[] {
  const brut = buf.toString("latin1");
  const runs: string[] = [];
  const flux = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = flux.exec(brut)) !== null) {
    let donnees = Buffer.from(m[1], "latin1");
    try {
      donnees = inflateSync(donnees);
    } catch {
      // Flux non compressé (image, police) : il ne porte pas de texte.
      continue;
    }
    const t = donnees.toString("latin1");
    for (const bloc of t.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      let run = "";
      for (const hex of bloc[1].matchAll(/<([0-9A-Fa-f]*)>/g)) {
        run += Buffer.from(hex[1], "hex").toString("latin1");
      }
      if (run) runs.push(run);
    }
  }
  return runs;
}

/** Le document recollé : ce qu'un œil lit, dans l'ordre. */
function texteDuPdf(buf: Buffer): string {
  return runsDuPdf(buf).join("");
}

// ── La largeur d'un montant, en points Helvetica ──────────────────────────

/**
 * Les largeurs de glyphes d'Helvetica, en millièmes de cadratin.
 *
 * POURQUOI MESURER PLUTÔT QUE REGARDER : quand un montant dépasse la largeur de
 * sa colonne, react-pdf ne déborde pas et ne lève rien — il COUPE en deux
 * lignes. « 12'345.67 CHF » deviendrait « 12'345.67 » sur une ligne et « CHF »
 * sur la suivante, et personne ne s'en apercevrait avant qu'une cliente le
 * signale. L'arithmétique, elle, le dit d'avance.
 */
const LARGEURS: Record<string, number> = {
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556,
  "5": 556, "6": 556, "7": 556, "8": 556, "9": 556,
  "'": 191, ".": 278, " ": 278, "-": 333, C: 722, H: 722, F: 611,
};

function largeurPt(texte: string, corps: number): number {
  let mille = 0;
  for (const c of texte) {
    const w = LARGEURS[c];
    if (w === undefined) throw new Error(`glyphe non mesuré : ${JSON.stringify(c)}`);
    mille += w;
  }
  return (mille / 1000) * corps;
}

const EMETTEUR = {
  nom: "La Dogosphère Sàrl",
  adresse: ["Rue du Test 1", "1950 Sion"],
  email: "ladogosphere@gmail.com",
  telephone: "+41 27 000 00 00",
  ide: "CHE-123.456.789",
  mentionTva: "TVA non applicable — entreprise non assujettie (art. 10 LTVA).",
};

async function facture(props: Record<string, unknown>): Promise<Buffer> {
  const { FacturePdf } = await import("@/src/lib/facturePdf");
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const el = React.createElement(FacturePdf as never, props as never);
  return renderToBuffer(el as never) as Promise<Buffer>;
}

const BASE_FACTURE = {
  numero: "FAC-2026-0009",
  type: "facture",
  dateFacture: "2026-09-07",
  dateEcheance: "2026-10-07",
  motif: null,
  client: { nom: "Jean Test", adresse: ["Av. du Client 2", "1200 Genève"] },
  emetteur: EMETTEUR,
  lignes: [
    { libelle: "Séjour long", quantite: 1, prix_unitaire: 1250.5, montant: 1250.5 },
    { libelle: "Gros montant", quantite: 1, prix_unitaire: 12345.67, montant: 12345.67 },
  ],
  total: 13596.17,
  acomptes: 0,
  dejaPaye: 500,
  reste: 13096.17,
  qrSvg: null,
  tva: null,
};

describe("le PDF de facture écrit les montants comme l'écran", () => {
  it("« 1'250.50 CHF » s'imprime, apostrophe et point compris", async () => {
    const texte = texteDuPdf(await facture(BASE_FACTURE));
    expect(texte).toContain("1'250.50 CHF");
    expect(texte).toContain("12'345.67 CHF");
    expect(texte).toContain("13'596.17 CHF");
  });

  it("aucune virgule décimale nulle part", async () => {
    // C'était la signature d'`Intl.NumberFormat("fr-CH")` : « 226,50 ».
    expect(texteDuPdf(await facture(BASE_FACTURE))).not.toMatch(/\d,\d\d/);
  });

  it("l'apostrophe des milliers est la DROITE, celle que WinAnsi imprime", async () => {
    /**
     * L'apostrophe courbe U+2019 est absente de WinAnsi : elle ne lève aucune
     * erreur, elle ne s'imprime pas. « 1250.50 » au lieu de « 1'250.50 » ne se
     * remarquerait pas sur une facture — sauf en la relisant à l'addition.
     */
    const texte = texteDuPdf(await facture(BASE_FACTURE));
    expect(texte).toContain("1'250.50");
    expect(texte).not.toContain("’");
  });

  it("un acompte se déduit avec un trait d'union visible", async () => {
    // Le « − » typographique s'évapore en WinAnsi ; `pourPdf` le convertit.
    // Sans cela, « − 500.00 CHF » s'imprimerait « 500.00 CHF », qui se lit
    // comme une charge de plus.
    const texte = texteDuPdf(await facture(BASE_FACTURE));
    expect(texte).toContain("- 500.00 CHF");
    expect(texte).not.toContain("−");
  });

  it("un avoir imprime son montant, signe compris", async () => {
    const texte = texteDuPdf(
      await facture({
        ...BASE_FACTURE,
        type: "avoir",
        lignes: [{ libelle: "Annulation", quantite: 1, prix_unitaire: -12.05, montant: -12.05 }],
        total: -12.05,
        dejaPaye: 0,
        reste: -12.05,
      }),
    );
    expect(texte).toContain("-12.05 CHF");
  });

  it("le montant TIENT dans sa colonne, jusqu'à cinq chiffres", () => {
    /**
     * Colonnes de la facture : 74 points pour le prix unitaire, 78 pour le
     * montant, en Helvetica 9.5. Ce test dit jusqu'où on va sans couper.
     */
    expect(largeurPt(formatPrixFacture(1250.5), 9.5)).toBeLessThan(74);
    expect(largeurPt(formatPrixFacture(12345.67), 9.5)).toBeLessThan(74);
    expect(largeurPt(formatPrixFacture(-12345.67), 9.5)).toBeLessThan(74);
    // LA LIMITE, dite plutôt que découverte : au-delà du million, ça coupe.
    // « 1'000'000.00 CHF » demande 82.3 points. Aucune facture de pension n'y
    // va, et si un jour l'une y va, ce test l'aura annoncé.
    expect(largeurPt(formatPrixFacture(1000000), 9.5)).toBeGreaterThan(74);
  });

  it("et il tient aussi sur le ticket, plus étroit", () => {
    /**
     * Le rouleau fait 80 mm et sa colonne de montant 70 points — elle en faisait
     * 58 avant ce lot, ce qui ne suffisait plus une fois « CHF » ajouté.
     */
    for (const montant of [226.5, 1250.5, 12345.67, -12345.67]) {
      expect(largeurPt(formatPrixFacture(montant), 8.5), String(montant)).toBeLessThan(70);
    }
  });

  it("la colonne du ticket est assez large pour ce qu'on y écrit", () => {
    /**
     * LE TROU QUE CE TEST FERME, trouvé par mutation : le test précédent
     * comparait la largeur du montant à la constante 70 écrite dans le test.
     * Ramener la colonne à 58 dans `ticketPdf.tsx` ne le faisait donc pas
     * rougir — et les montants se seraient coupés en deux lignes en silence.
     *
     * La largeur se lit maintenant DANS LE FICHIER.
     */
    const source = readFileSync(join(__dirname, "..", "src/lib/ticketPdf.tsx"), "utf8");
    const m = source.match(/montant: \{ width: (\d+)/);
    expect(m, "la colonne « montant » du ticket doit se laisser lire").toBeTruthy();
    const colonne = Number(m![1]);
    for (const montant of [226.5, 1250.5, 12345.67, -12345.67]) {
      expect(
        largeurPt(formatPrixFacture(montant), 8.5),
        `${montant} dans une colonne de ${colonne} points`,
      ).toBeLessThan(colonne);
    }
  });

});

describe("le format d'une pièce, sur les huit cas qui comptent", () => {
  it("rend ce qu'on attend, du zéro au million", () => {
    expect(formatPrixFacture(0)).toBe("0.00 CHF");
    expect(formatPrixFacture(12.5)).toBe("12.50 CHF");
    expect(formatPrixFacture(226.5)).toBe("226.50 CHF");
    expect(formatPrixFacture(1250.5)).toBe("1'250.50 CHF");
    expect(formatPrixFacture(12345.67)).toBe("12'345.67 CHF");
    expect(formatPrixFacture(1000000)).toBe("1'000'000.00 CHF");
    expect(formatPrixFacture(-12.05)).toBe("-12.05 CHF");
    expect(formatPrixFacture(0.1 + 0.2)).toBe("0.30 CHF");
  });

  it("le négatif prend le TRAIT D'UNION, et ce n'est pas un goût", () => {
    /**
     * U+2212 est absent de WinAnsi, l'encodage des polices de base des PDF : il
     * ne s'imprime pas du tout. Un avoir de −12.05 se serait imprimé
     * « 12.05 CHF », c'est-à-dire l'inverse de ce qu'il dit.
     */
    expect(formatPrixFacture(-12.05)).toContain("-");
    expect(formatPrixFacture(-12.05)).not.toContain("−");
    expect(formatPrixFacture(-1250.5)).toBe("-1'250.50 CHF");
  });

  it("un zéro venu d'une soustraction ne s'écrit pas « -0.00 »", () => {
    // L'arrondi au centime vient AVANT le signe : sans lui, −0.001 donnait
    // « -0.00 CHF », un montant nul qui a l'air d'un avoir.
    expect(formatPrixFacture(-0)).toBe("0.00 CHF");
    expect(formatPrixFacture(-0.001)).toBe("0.00 CHF");
  });

  it("accepte ce que Postgres renvoie pour un « numeric » : une chaîne", () => {
    expect(formatPrixFacture("1250.5")).toBe("1'250.50 CHF");
    expect(formatPrixFacture(null)).toBe("0.00 CHF");
    expect(formatPrixFacture(undefined)).toBe("0.00 CHF");
    expect(formatPrixFacture("pas un nombre")).toBe("0.00 CHF");
  });

  it("LA GARANTIE PDF : la sortie traverse pourPdf sans changer", () => {
    /**
     * C'est ce test qui rend le format sûr pour une pièce imprimée. Si quelqu'un
     * remet un jour U+2212 ou une apostrophe courbe, le montant changerait en
     * passant par `pourPdf` — donc s'imprimerait autrement qu'il s'affiche — et
     * ce test le dirait avant la première facture.
     */
    for (const montant of [0, 12.5, 226.5, 1250.5, 12345.67, 1000000, -12.05, -1250.5]) {
      const ecrit = formatPrixFacture(montant);
      expect(pourPdf(ecrit), String(montant)).toBe(ecrit);
    }
  });
});

// ── Ce qui suit une autre règle que la nôtre ──────────────────────────────

describe("le bulletin QR suit la norme SIX, pas notre format", () => {
  async function bulletin(montant: number): Promise<string> {
    const { genererQrBillSvg } = await import("@/src/lib/qrFacture");
    const svg = genererQrBillSvg({
      iban: "CH5800791123000889012",
      titulaire: "La Dogosphère Sàrl",
      adresse: { rue: "Rue du Test", numero: "1", npa: "1950", ville: "Sion", pays: "CH" },
      montant,
      numeroFacture: "FAC-2026-0009",
      referenceStockee: null,
      debiteur: { nom: "Jean Test", adresse: ["Av. du Client 2", "1200 Genève"] },
    });
    expect(svg, "le bulletin doit se générer").toBeTruthy();
    return svg as string;
  }

  it("la zone « Montant » imprimée garde l'espace des Implementation Guidelines", async () => {
    /**
     * Les Swiss Implementation Guidelines du QR-facture imposent, pour le
     * montant IMPRIMÉ, un séparateur de milliers ESPACE et un point décimal :
     * « 1 250.50 ». Ce n'est pas nous qui l'écrivons — on ne passe à
     * `swissqrbill` qu'un NOMBRE, et la bibliothèque applique la règle.
     *
     * Y mettre notre apostrophe rendrait le bulletin non conforme, et une banque
     * peut le refuser. Ce test existe pour qu'on ne l'« aligne » pas.
     */
    const svg = await bulletin(1250.5);
    const textes = [...svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, "").trim(),
    );
    const montants = textes.filter((t) => t.includes("250"));
    expect(montants.length, "la zone Montant apparaît sur le bulletin").toBeGreaterThan(0);
    for (const t of montants) {
      expect(t).toContain("1 250.50");
      expect(t, "surtout pas notre apostrophe").not.toContain("1'250.50");
    }
  });

  it("le montant lui est passé en NOMBRE : on ne le formate jamais", () => {
    /**
     * La charge utile du QR impose « 1250.50 » — deux décimales, point, AUCUN
     * séparateur de milliers. Tant que le code passe un nombre, cette règle est
     * celle de la bibliothèque et aucun format de chez nous ne peut la casser.
     */
    const source = readFileSync(join(__dirname, "..", "src/lib/qrFacture.ts"), "utf8");
    expect(source).toContain("data.amount = Math.round(montant * 100) / 100;");
    expect(source, "aucun format de montant ici").not.toContain("formatPrixFacture");
    expect(source).not.toContain("toFixed");
  });
});

describe("l'unité vit dans la VARIABLE, plus dans le texte des modèles", () => {
  /**
   * LE TROU QUE CE TEST FERME, trouvé par mutation : quatre modèles d'e-mail
   * écrivaient « CHF {montant} ». La variable portant désormais son unité, ces
   * textes auraient donné « CHF 226.50 CHF ». Rien ne l'empêchait.
   *
   * Vérifié en base le 28.09.2026 avant de changer la variable : aucune ligne de
   * `modeles_email` ne contient {montant}. Le seul champ personnalisé est
   * `paiement.message_final`, qui n'en parle pas. Le changement ne pouvait donc
   * doubler aucune unité déjà écrite — mais un texte futur, si.
   */
  const SOURCE = readFileSync(join(__dirname, "..", "src/lib/email.ts"), "utf8");

  it("aucun modèle n'écrit « CHF » autour de {montant}", () => {
    expect(SOURCE).not.toContain("CHF {montant}");
    expect(SOURCE).not.toContain("{montant} CHF");
  });

  it("l'aperçu de l'écran d'édition montre l'unité dans la variable", () => {
    const editeur = readFileSync(
      join(__dirname, "..", "app/(admin)/(espace-reglages)/emails/GestionEmails.tsx"),
      "utf8",
    );
    // « montant » est une PIÈCE, « prix » est la vitrine : deux formats, deux
    // exemples, et l'aperçu doit apprendre le bon à qui rédige.
    expect(editeur).toContain('montant: "120.00 CHF"');
    expect(editeur).toContain('prix: "35.\u2013"');
  });
});

describe("les exports gardent des nombres bruts", () => {
  it("le CSV des statistiques n'a ni apostrophe ni « CHF »", () => {
    /**
     * Une apostrophe devant un nombre en fait du TEXTE dans un tableur : la
     * colonne ne s'additionne plus, et le décompte TVA se fait à la main.
     */
    const source = readFileSync(
      join(__dirname, "..", "src/lib/statistiquesBoutiqueLogique.ts"),
      "utf8",
    );
    expect(source).toContain('const nombreCsv = (n: number | null) => (n === null ? "" : n.toFixed(2));');
    expect(source).not.toContain("formatPrixFacture");
  });

  it("l'export comptable écrit des nombres, pas des chaînes", () => {
    const source = readFileSync(join(__dirname, "..", "app/api/comptabilite/export/route.ts"), "utf8");
    expect(source).not.toContain("formatPrixFacture");
    expect(source).toContain("Math.round(totalTTC * 100) / 100");
  });
});

// ── La garde de fond ──────────────────────────────────────────────────────

/** Le fichier sans ses commentaires : un commentaire n'est pas du code. */
function codeSeul(chemin: string): string {
  return readFileSync(join(__dirname, "..", chemin), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");
}

describe("aucune pièce ne dépend de l'ICU du runtime", () => {
  /**
   * `Intl.NumberFormat` et `toLocaleString` rendent un résultat qui dépend de la
   * version d'ICU embarquée par le runtime — et qui a déjà changé sous nos
   * pieds : `fr-CH` donnait autrefois « 1'250.50 », il donne aujourd'hui
   * « 1'250,50 ». Une pièce justificative figée pour dix ans ne peut pas
   * s'écrire autrement selon la machine qui l'a produite.
   */
  const PIECES = [
    "src/lib/facturePdf.tsx",
    "src/lib/ticketPdf.tsx",
    "src/lib/prixClient.ts",
    "app/(client)/mon-compte/factures/page.tsx",
    "app/(client)/mon-compte/reservations/BoutonPaiementClient.tsx",
  ];

  it("ni Intl.NumberFormat ni toLocaleString dans les fichiers de pièces", () => {
    for (const piece of PIECES) {
      const source = codeSeul(piece);
      expect(source, `${piece} : Intl.NumberFormat`).not.toContain("Intl.NumberFormat");
      expect(source, `${piece} : toLocaleString`).not.toContain("toLocaleString");
    }
  });

  it("aucun formateur local ne subsiste dans ces fichiers", () => {
    /**
     * Le formateur local de `mon-compte/factures` a disparu : c'est ce qui rend
     * inutile l'ancien test qui comparait les deux écritures. Il n'y a plus deux
     * écritures à comparer.
     */
    for (const piece of PIECES) {
      expect(codeSeul(piece), `${piece} : un chf local`).not.toMatch(/const chf\s*=/);
    }
  });

  it("le PDF et l'écran des factures appellent la MÊME fonction", () => {
    for (const piece of ["src/lib/facturePdf.tsx", "app/(client)/mon-compte/factures/page.tsx"]) {
      expect(codeSeul(piece)).toContain('from "@/src/lib/prixClient"');
    }
  });

  it("la saisie de la boîte de paiement reste un NOMBRE", () => {
    /**
     * Les deux seuls `toFixed(2)` qui subsistent dans ce fichier sont la valeur
     * d'un `input type="number"` : « 1'250.50 CHF » n'est pas un nombre que le
     * navigateur sait relire, et le champ serait vide.
     */
    const source = codeSeul("app/(client)/mon-compte/reservations/BoutonPaiementClient.tsx");
    expect(source).toContain("useState(resteInitial.toFixed(2))");
    expect(source).not.toContain("useState(formatPrixFacture");
  });

  it("les écrans INTERNES ne sont pas touchés : autre lot", () => {
    /**
     * La caisse, le journal, le décompte TVA, les dépenses et les statistiques
     * gardent leur format actuel. Ce test n'est pas là pour les protéger d'un
     * progrès — il est là pour que le jour où on les alignera, ce soit une
     * décision et pas un effet de bord.
     */
    const internes: string[] = [];
    const parcourir = (dossier: string) => {
      for (const entree of readdirSync(dossier)) {
        if (entree === "node_modules" || entree === ".next") continue;
        const complet = join(dossier, entree);
        if (statSync(complet).isDirectory()) parcourir(complet);
        else if (/\.tsx?$/.test(entree)) {
          const chemin = relative(join(__dirname, ".."), complet).replace(/\\/g, "/");
          if (codeSeul(chemin).includes("formatPrixFacture")) internes.push(chemin);
        }
      }
    };
    parcourir(join(__dirname, "..", "app/(admin)"));
    expect(internes).toEqual([]);
  });
});
