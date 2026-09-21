import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";
import {
  fraisPort,
  francoAtteint,
  infoLivraisonOfferte,
  libelleSeuil,
  lireFrancoPort,
  lireSaisieFrancoPort,
  mentionPortCommande,
  optionRemise,
  totalCommande,
  type ContexteRemise,
  type LignePanier,
  type PalierPort,
} from "@/src/lib/venteEnLigneLogique";

/**
 * Livraison offerte à partir d'un montant d'articles.
 *
 * Le seuil se compare à ce que le client paie pour la marchandise — après les
 * remises de ligne, avant le port — et il vit dans la seule fonction qui
 * chiffre le port. Il annule un prix ; il ne rend pas expédiable ce qui ne
 * l'est pas.
 */

/** La grille réelle, telle qu'enregistrée le 22 septembre 2026. */
const GRILLE: PalierPort[] = [
  { jusqu_a_grammes: 1000, prix: 9 },
  { jusqu_a_grammes: 2000, prix: 11 },
  { jusqu_a_grammes: 5000, prix: 14 },
  { jusqu_a_grammes: 10000, prix: 20 },
];

/** Une ligne d'article expédiable, 500 g pièce. */
const ligne = (prix: number, quantite = 1, extra: Partial<LignePanier> = {}): LignePanier => ({
  article_id: `a-${prix}-${quantite}`,
  libelle: `Article à ${prix}`,
  quantite,
  prix_unitaire: prix,
  taux_tva: 8.1,
  poids_grammes: 500,
  expediable: true,
  type_article: "standard",
  ...extra,
});

const contexte = (lignes: LignePanier[], franco: number | null = 100): ContexteRemise => ({
  lignes,
  reservationAVenir: false,
  grillePort: GRILLE,
  poidsMaxGrammes: 10000,
  francoPortDes: franco,
});

const postal = (lignes: LignePanier[], franco: number | null = 100) => optionRemise(contexte(lignes, franco), "postal");

describe("le seuil, dans la seule fonction qui chiffre le port", () => {
  it("sous le seuil : le port de la grille (60.– pour 1.5 kg → 11.–)", () => {
    const o = postal([ligne(20, 3)]);
    expect(o).toMatchObject({ disponible: true, frais: 11 });
    expect(infoLivraisonOfferte(contexte([ligne(20, 3)]))).toEqual({ seuil: 100, atteint: false });
  });

  it("au seuil exact : offerts (100.– pour 2.5 kg)", () => {
    const o = postal([ligne(20, 5)]);
    expect(o).toMatchObject({ disponible: true, frais: 0 });
    expect(infoLivraisonOfferte(contexte([ligne(20, 5)]))).toEqual({ seuil: 100, atteint: true });
  });

  it("au-dessus : offerts (120.–)", () => {
    expect(postal([ligne(60, 2)])).toMatchObject({ disponible: true, frais: 0 });
    // Le total n'ajoute aucun port.
    const total = totalCommande({ lignes: [ligne(60, 2)], fraisPort: postal([ligne(60, 2)]).frais });
    expect(total).toEqual({ sousTotal: 120, remise: 0, port: 0, aPayer: 120 });
  });

  it("un centime sous le seuil ne suffit pas", () => {
    expect(postal([ligne(99.99)])).toMatchObject({ frais: 9 });
    expect(francoAtteint(99.99, 100)).toBe(false);
    expect(francoAtteint(100, 100)).toBe(true);
  });

  it("membre : 105.– bruts, 94.50 nets → pas offert, le seuil se compare au montant remisé", () => {
    const membre = ligne(94.5, 1, {
      prix_base: 105, remise_pourcentage: 10, remise_origine: "membre", remise_libelle: "Remise membre −10 %",
    });
    const o = postal([membre]);
    expect(o).toMatchObject({ disponible: true, frais: 9 });
    const total = totalCommande({ lignes: [membre], fraisPort: o.frais });
    expect(total).toEqual({ sousTotal: 105, remise: 10.5, port: 9, aPayer: 103.5 });
    expect(infoLivraisonOfferte(contexte([membre]))).toEqual({ seuil: 100, atteint: false });
  });

  it("franco null : jamais offert, même à 120.–, et rien n'est annoncé", () => {
    // 2 × 500 g = 1 kg : premier palier, 9.–.
    expect(postal([ligne(60, 2)], null)).toMatchObject({ disponible: true, frais: 9 });
    expect(infoLivraisonOfferte(contexte([ligne(60, 2)], null))).toBeNull();
  });
});

describe("le seuil ne rend pas expédiable ce qui ne l'est pas", () => {
  it("un article non expédiable au-dessus du seuil : toujours pas d'envoi postal, rien d'annoncé", () => {
    const lignes = [ligne(60, 2), ligne(30, 1, { expediable: false, libelle: "Croquettes 12 kg" })];
    const o = postal(lignes);
    expect(o.disponible).toBe(false);
    expect(o.frais).toBeNull();
    expect(o.raison).toContain("ne peut pas être expédié");
    expect(infoLivraisonOfferte(contexte(lignes))).toBeNull();
  });

  it("un colis trop lourd au-dessus du seuil : toujours refusé", () => {
    const lignes = [ligne(60, 2, { poids_grammes: 6000 })]; // 12 kg
    const o = postal(lignes);
    expect(o).toMatchObject({ disponible: false, frais: null });
    expect(o.raison).toContain("dépasse 10 kg");
  });

  it("au-delà du dernier palier, le seuil ne crée pas de tarif", () => {
    expect(fraisPort(12000, GRILLE, { montantArticles: 500, seuil: 100 })).toBeNull();
    expect(fraisPort(1500, [], { montantArticles: 500, seuil: 100 })).toBeNull();
  });

  it("un poids inconnu reste un refus, seuil atteint ou non", () => {
    const o = postal([ligne(120, 1, { poids_grammes: null })]);
    expect(o.disponible).toBe(false);
    expect(o.raison).toContain("poids");
  });
});

describe("les frais d'une commande confirmée sont figés", () => {
  it("la mention se lit sur commandes.frais_port, jamais sur le seuil du jour", () => {
    // Confirmée à 120.– quand le seuil valait 100 : port 0, figé.
    const alaConfirmation = totalCommande({ lignes: [ligne(60, 2)], fraisPort: postal([ligne(60, 2)], 100).frais });
    const commande = { mode_remise: "postal", frais_port: alaConfirmation.port };
    expect(commande.frais_port).toBe(0);

    // Le seuil passe ensuite à 200 : le même panier coûterait du port...
    expect(postal([ligne(60, 2)], 200).frais).toBe(9);
    // ...mais la commande confirmée, elle, reste une livraison offerte.
    expect(mentionPortCommande(commande)).toBe("offerte");
  });

  it("offerte, payante, ou pas de ligne de port du tout", () => {
    expect(mentionPortCommande({ mode_remise: "postal", frais_port: 0 })).toBe("offerte");
    expect(mentionPortCommande({ mode_remise: "postal", frais_port: "0.00" })).toBe("offerte");
    expect(mentionPortCommande({ mode_remise: "postal", frais_port: 11 })).toBe(11);
    // Un retrait n'a pas de ligne de port : ce n'est pas une livraison offerte.
    expect(mentionPortCommande({ mode_remise: "retrait", frais_port: 0 })).toBeNull();
    expect(mentionPortCommande({ mode_remise: "depart_chien", frais_port: 0 })).toBeNull();
  });
});

describe("le paramètre et sa saisie", () => {
  it("lecture : vide, zéro ou illisible = jamais", () => {
    expect(lireFrancoPort("100")).toBe(100);
    expect(lireFrancoPort("99.5")).toBe(99.5);
    expect(lireFrancoPort("")).toBeNull();
    expect(lireFrancoPort(null)).toBeNull();
    expect(lireFrancoPort("0")).toBeNull();
    expect(lireFrancoPort("abc")).toBeNull();
  });

  it("saisie : nombre positif ou vide", () => {
    expect(lireSaisieFrancoPort("")).toEqual({ ok: true, valeur: "", seuil: null });
    expect(lireSaisieFrancoPort("  ")).toEqual({ ok: true, valeur: "", seuil: null });
    expect(lireSaisieFrancoPort("100")).toEqual({ ok: true, valeur: "100", seuil: 100 });
    expect(lireSaisieFrancoPort("99,50")).toEqual({ ok: true, valeur: "99.5", seuil: 99.5 });
    expect(lireSaisieFrancoPort("1'000")).toEqual({ ok: true, valeur: "1000", seuil: 1000 });
    for (const refuse of ["0", "-5", "abc", "10.555", "1e3"]) {
      expect(lireSaisieFrancoPort(refuse).ok, refuse).toBe(false);
    }
  });

  it("le seuil comme on l'affiche", () => {
    expect(libelleSeuil(100)).toBe("100.–");
    expect(libelleSeuil(99.5)).toBe("99.50");
  });
});

// ── Le dépôt ───────────────────────────────────────────────────────────────

const RACINE = join(__dirname, "..");
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
const SOURCES = ["app", "src"].flatMap((d) => fichiers(join(RACINE, d))).map((chemin) => ({
  rel: relative(RACINE, chemin).split("\\").join("/"),
  code: readFileSync(chemin, "utf8"),
}));
const code = (rel: string) => SOURCES.find((s) => s.rel === rel)!.code;

describe("un seul calcul, et les écrans qui le lisent", () => {
  it("fraisPort n'est appelé que dans le module de règles", () => {
    const appels = SOURCES.filter((s) => /\bfraisPort\(/.test(s.code) && s.rel !== "src/lib/venteEnLigneLogique.ts")
      .map((s) => s.rel);
    expect(appels).toEqual([]);
    // Et aucun autre fichier ne relit la grille pour chiffrer un port : elle se
    // LIT à un seul endroit, s'ÉCRIT depuis Réglages → Boutique, et son code
    // d'événement a son libellé au journal. Rien d'autre.
    const grille = SOURCES.filter((s) => s.code.includes("frais_port_grille")).map((s) => s.rel).sort();
    expect(grille).toEqual([
      "app/(admin)/(espace-reglages)/reglages/boutique/actions.ts",
      "src/lib/journalEvenements.ts",
      "src/lib/venteEnLigne.ts",
    ]);
    expect(code("app/(admin)/(espace-reglages)/reglages/boutique/actions.ts")).not.toMatch(/\bfraisPort\(/);
  });

  it("le panier et la confirmation passent le même seuil au même calcul", () => {
    expect(code("app/(public)/catalogue/actions.ts")).toMatch(/francoPortDes: params\.francoPortDes,/);
    expect(code("app/(public)/catalogue/panier/page.tsx")).toContain("francoPortDes={params.francoPortDes}");
    const panier = code("app/(public)/catalogue/panier/Panier.tsx");
    expect(panier).toContain("const franco = infoLivraisonOfferte(contexte);");
    expect(panier).toContain("Livraison offerte dès {libelleSeuil(franco.seuil)} d&apos;articles");
    expect(panier).toContain(`{portOffert ? "Offerts" : chf(total.port)}`);
    // Pas de compte à rebours : aucun écart entre le seuil et le panier n'est calculé.
    expect(panier).not.toMatch(/franco\.seuil\s*-|-\s*franco\.seuil|seuil\s*-\s*total|plus que \{/);
  });

  it("l'e-mail et le bon lisent les frais figés, jamais le seuil", () => {
    const email = code("src/lib/email.ts");
    expect(email).toContain("const port = mentionPortCommande(cmd);");
    expect(email).toContain("Livraison offerte");
    const bon = code("app/(admin)/boutique/commandes-en-ligne/[id]/bon/page.tsx");
    expect(bon).toContain(`mentionPortCommande(commande) === "offerte" ? " · Livraison offerte" : ""`);
    for (const rel of ["src/lib/email.ts", "app/(admin)/boutique/commandes-en-ligne/[id]/bon/page.tsx"]) {
      expect(code(rel), rel).not.toMatch(/franco_port_des|francoPortDes|lireParametresEnLigne/);
    }
  });

  it("une commande en franco ne porte pas de ligne « Frais de port 0.00 » sur sa facture", () => {
    const actions = code("app/(public)/catalogue/actions.ts");
    const bloc = actions.slice(actions.indexOf("const port = Number(commande?.frais_port ?? 0);"));
    expect(bloc).toMatch(/^const port = Number\(commande\?\.frais_port \?\? 0\);[\s\S]*?if \(port > 0\) \{/);
    expect(bloc).toMatch(/if \(part\.port > 0\) \{\s*aInserer\.push\(\{[\s\S]*?libelle: `Frais de port/);
  });

  it("la migration pose 100.– et dit ce que vide veut dire", () => {
    const sql = readFileSync(join(RACINE, "supabase/migrations/20260921221940_boutique_franco_port.sql"), "utf8");
    expect(sql).toMatch(/'franco_port_des',\s*'100',/);
    expect(sql).toContain("on conflict (cle) do nothing");
    expect(sql).toMatch(/valeur VIDE/);
  });
});
