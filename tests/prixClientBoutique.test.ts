import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";
import {
  phraseDelaiCommande,
  TEXTE_NON_EXPEDIABLE,
} from "@/src/lib/venteEnLigneLogique";

/**
 * Trois alignements de texte sur les écrans clients de la boutique.
 *
 *   1. le prix s'écrit à la suisse — « 35.– », « 1'250.50 », « −9.50 » ;
 *   2. la phrase des articles qui ne partent pas par la poste n'existe QU'UNE
 *      fois dans le dépôt ;
 *   3. le délai d'un article sur commande dit « Disponible sous … ».
 *
 * ── CE QUE CE FICHIER GARDE SURTOUT : LA FRONTIÈRE ────────────────────────
 *
 * Le format suisse ne vaut que côté CLIENT. Une facture, un avoir, un ticket,
 * le bulletin QR, le journal comptable et la caisse gardent leurs deux
 * décimales — « 35.– » est une écriture de vitrine, et une pièce comptable se
 * relit, s'additionne et se contrôle. Le dernier describe surveille cette
 * frontière, parce que c'est elle qu'une relecture pressée effacerait en
 * croyant finir le travail.
 */

const RACINE = join(__dirname, "..");

function code(chemin: string): string {
  return readFileSync(join(RACINE, chemin), "utf8");
}

/**
 * Le fichier SANS ses commentaires.
 *
 * Un test qui cherche une phrase « quelque part dans le fichier » se laisse
 * contenter par l'explication qu'on vient d'écrire au-dessus du code — c'est
 * arrivé trois fois dans ce dépôt. Ici on ne regarde que ce qui s'exécute.
 */
function codeSeul(chemin: string): string {
  return code(chemin)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");
}

/** Tous les fichiers de code de l'application, sans les tests. */
function fichiersDuCode(): string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string) => {
    for (const entree of readdirSync(dossier)) {
      if (entree === "node_modules" || entree === ".next") continue;
      const complet = join(dossier, entree);
      if (statSync(complet).isDirectory()) parcourir(complet);
      else if (/\.tsx?$/.test(entree)) trouves.push(relative(RACINE, complet).replace(/\\/g, "/"));
    }
  };
  parcourir(join(RACINE, "app"));
  parcourir(join(RACINE, "src"));
  return trouves;
}

describe("la phrase des articles qui ne partent pas par la poste", () => {
  it("est celle que Sabrina a écrite, mot pour mot", () => {
    expect(TEXTE_NON_EXPEDIABLE).toBe(
      "Cet article ne part pas par la poste : à retirer à la pension, ou au départ de votre chien.",
    );
  });

  it("n'existe QU'À UN SEUL ENDROIT du code", () => {
    /**
     * La même phrase avait été recopiée d'un écran à l'autre, et les copies
     * avaient divergé. Ce test ne vérifie pas qu'elle est juste — il vérifie
     * qu'il n'y a qu'un endroit où la corriger.
     *
     * Les commentaires sont retirés d'abord : sans cela, l'explication écrite
     * au-dessus de la constante compterait comme une seconde copie.
     */
    const porteurs = fichiersDuCode().filter((f) =>
      codeSeul(f).includes(TEXTE_NON_EXPEDIABLE),
    );
    expect(porteurs).toEqual(["src/lib/venteEnLigneLogique.ts"]);
  });

  it("est ce que la fiche article affiche, par la constante et non par une copie", () => {
    const fiche = codeSeul("app/(public)/catalogue/[id]/page.tsx");
    expect(fiche).toContain("{TEXTE_NON_EXPEDIABLE}");
    // L'ancienne phrase parlait du POIDS, alors qu'un article peut aussi être
    // trop volumineux ou trop fragile. Elle ne doit pas revenir.
    expect(fiche).not.toContain("Trop lourd pour un colis");
  });

  it("le refus du panier garde sa forme, mais NOMME les articles", () => {
    /**
     * Ce message-là s'affiche juste au-dessus des deux autres modes de remise :
     * répéter « à retirer à la pension » n'y dirait rien de plus. Ce qu'il doit
     * faire, et que la phrase générale ne peut pas faire, c'est dire LESQUELS.
     */
    const logique = codeSeul("src/lib/venteEnLigneLogique.ts");
    expect(logique).toContain("ne part pas par la poste.");
    expect(logique).toContain("Ces articles ne partent pas par la poste :");
    // Compter obligeait la cliente à relire son panier pour deviner lesquels.
    expect(logique).not.toContain("articles de votre panier ne peuvent pas");
  });
});

describe("le délai d'un article sur commande", () => {
  /**
   * L'arithmétique du délai (bornes, accord du pluriel, absence de délai) est
   * couverte par `tests/venteEnLigneLogique.test.ts`. Ici on garde les quatre
   * cas du lot, parce que c'est la FORMULATION qui a changé : « Livré sous »
   * promettait une livraison même à qui vient retirer au comptoir.
   */
  it("dit « Disponible sous », jamais « Livré sous »", () => {
    expect(phraseDelaiCommande({ delai_commande_min_jours: 5, delai_commande_max_jours: 7 }))
      .toBe("Disponible sous 5 à 7 jours ouvrables");
    expect(phraseDelaiCommande({ delai_commande_min_jours: 5, delai_commande_max_jours: 5 }))
      .toBe("Disponible sous 5 jours ouvrables");
    expect(phraseDelaiCommande({ delai_commande_min_jours: 1, delai_commande_max_jours: 1 }))
      .toBe("Disponible sous 1 jour ouvrable");
  });

  it("sans délai connu : RIEN, et c'est inchangé", () => {
    // Null, et l'article n'est alors pas commandable du tout : `disponibilite`
    // le laisse « Épuisé ». On ne promet jamais un délai qu'on ignore.
    expect(phraseDelaiCommande({ sur_commande: true })).toBeNull();
    expect(phraseDelaiCommande(null)).toBeNull();
  });

  it("« Livré sous » ne subsiste nulle part dans le code", () => {
    const restes = fichiersDuCode().filter((f) => codeSeul(f).includes("Livré sous"));
    expect(restes).toEqual([]);
  });
});

describe("les écrans clients de la boutique lisent la même fonction", () => {
  const ECRANS_CLIENTS = [
    "app/(public)/catalogue/CatalogueBoutique.tsx",
    "app/(public)/catalogue/[id]/page.tsx",
    "app/(public)/catalogue/panier/Panier.tsx",
    "app/(public)/catalogue/PanierVisiteur.tsx",
    "app/(client)/mon-compte/commandes/page.tsx",
  ];

  it("chacun appelle formatPrixClient", () => {
    for (const ecran of ECRANS_CLIENTS) {
      expect(codeSeul(ecran), ecran).toContain("formatPrixClient(");
    }
  });

  it("aucun ne garde son propre formateur de prix", () => {
    // Chacun avait le sien, nommé `chf`, avec sa propre idée du format. C'est
    // ainsi que la boutique s'est retrouvée avec plusieurs écritures du franc.
    for (const ecran of ECRANS_CLIENTS) {
      expect(codeSeul(ecran), ecran).not.toMatch(/const chf = /);
      expect(codeSeul(ecran), ecran).not.toMatch(/toFixed\(2\)/);
    }
  });

  it("« TTC » n'est plus collé aux lignes, aux cartes ni aux fiches", () => {
    const SANS_MENTION = [
      "app/(public)/catalogue/CatalogueBoutique.tsx",
      "app/(public)/catalogue/[id]/page.tsx",
      "app/(public)/catalogue/PanierVisiteur.tsx",
    ];
    for (const ecran of SANS_MENTION) {
      expect(codeSeul(ecran), ecran).not.toContain("TTC");
    }
  });

  it("« Prix TTC » est dit UNE fois dans le panier, une fois sur la commande", () => {
    /**
     * Une mention par écran, sous le total. Répétée à chaque ligne, elle devient
     * du bruit qu'on ne lit plus — et c'est exactement ce qu'il ne faut pas pour
     * la seule phrase qui dit que le prix affiché est celui qu'on paiera.
     */
    const PORTEURS = [
      "app/(public)/catalogue/panier/Panier.tsx",
      "app/(client)/mon-compte/commandes/page.tsx",
      "src/lib/email.ts",
    ];
    for (const ecran of PORTEURS) {
      const partage = codeSeul(ecran);
      expect(partage.split("Prix TTC").length - 1, `${ecran} : une seule mention`).toBe(1);
    }
  });

  it("la livraison offerte reste « Offerts », pas « 0.– »", () => {
    // APP 17n : zéro franc de port n'est pas un prix, c'est un geste, et il se
    // dit avec un mot. Le remplacer par un montant ferait disparaître le geste.
    const panier = codeSeul("app/(public)/catalogue/panier/Panier.tsx");
    expect(panier).toContain('portOffert ? "Offerts"');
  });

  it("l'e-mail de commande écrit les mêmes prix que l'écran", () => {
    const partage = codeSeul("src/lib/email.ts");
    expect(partage).toContain("formatPrixClient(Number(cmd.montant_total))");
    // Le total ne porte plus « CHF » collé : la mention « Prix TTC » suit.
    expect(partage).not.toContain("${chfEmail(Number(cmd.montant_total))} CHF");
  });
});

describe("LA FRONTIÈRE : les écrans internes gardent leurs deux décimales", () => {
  /**
   * C'est la moitié du lot qu'une relecture pressée effacerait, en « finissant
   * le travail ». Une facture écrite « 35.– » n'est pas une facture plus jolie :
   * c'est une pièce comptable dont le montant ne s'additionne plus à l'œil, et
   * qui ne ressemble plus à ce que l'AFC attend.
   */
  const PIECES_ET_POSTES = [
    "src/lib/facturePdf.tsx",
    "src/lib/ticketPdf.tsx",
    "src/lib/caisseLogique.ts",
    "app/(admin)/(espace-comptabilite)/comptabilite/depenses/page.tsx",
  ];

  it("aucune pièce comptable ni poste de travail n'appelle formatPrixClient", () => {
    for (const interne of PIECES_ET_POSTES) {
      expect(codeSeul(interne), interne).not.toContain("formatPrixClient");
    }
  });

  it("la facture et le ticket gardent le format de la PIÈCE", () => {
    /**
     * Ils y restent à deux décimales, mais plus par `Intl` : ils appellent
     * `formatPrixFacture` depuis le lot des pièces. Le détail du format est gardé
     * par `tests/piecesFormatMontant.test.ts` ; ici on garde seulement qu'ils ne
     * sont PAS passés au format de vitrine.
     */
    for (const piece of ["src/lib/facturePdf.tsx", "src/lib/ticketPdf.tsx"]) {
      expect(codeSeul(piece), piece).toContain("formatPrixFacture(");
      expect(codeSeul(piece), piece).not.toContain("formatPrixClient");
    }
  });

  it("aucun montant du configurateur n'échappe au contexte", () => {
    /**
     * LE TROU QUE CE TEST FERME, trouvé par mutation : un sous-composant qui
     * formate son montant lui-même ne casse AUCUNE signature. TypeScript est
     * content, le comptoir garde son format, et la cliente lit « 5.00 CHF » au
     * milieu d'une page en « 35.– ». Un test de rendu ne l'attrape que si son
     * décor contient justement ce groupe-là : le mien ne l'avait pas.
     *
     * La règle est donc posée sur le fichier entier, et elle vaudra encore pour
     * le septième sous-composant : `toFixed` n'apparaît QU'UNE fois, dans la
     * définition de `chf`. Partout ailleurs, on passe par le contexte.
     */
    const partage = codeSeul("app/components/Configurateur.tsx");
    const emplois = [...partage.matchAll(/toFixed\(/g)];
    expect(emplois.length, "toFixed ne vit que dans la définition de chf").toBe(1);
    expect(partage).toContain("const chf = (n: number) => `${n.toFixed(2)} CHF`;");
  });

  it("le configurateur du COMPTOIR garde « Prix TTC » et son format", () => {
    /**
     * Le configurateur est le même composant des deux côtés. La bascule est une
     * propriété explicite — pas `affichage`, qui est une préférence de POSTE que
     * le navigateur retient : le comptoir mis en « grille » aurait alors affiché
     * des prix de vitrine.
     */
    const partage = codeSeul("app/components/Configurateur.tsx");
    expect(partage).toContain("pourClient = false");
    expect(partage).toContain('pourClient ? "Prix" : "Prix TTC"');
    expect(partage).toContain("const format = pourClient ? formatPrixClient : chf;");
    // Le défaut du contexte est le format du comptoir : un appelant qui ne dit
    // rien garde exactement ce qu'il affichait avant ce lot.
    expect(partage).toContain("createContext<(n: number) => string>(chf)");

    // La caisse ne passe pas la propriété ; la fiche article, si.
    const caisse = codeSeul(
      "app/(admin)/boutique/caisse/sur-mesure/[articleId]/CommandeSurMesure.tsx",
    );
    expect(caisse).not.toContain("pourClient");
    expect(
      codeSeul("app/(public)/catalogue/[id]/ConfigurateurClient.tsx"),
    ).toContain("pourClient");
  });
});
