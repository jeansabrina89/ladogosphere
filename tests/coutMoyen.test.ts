import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  coutMatieres,
  coutMoyenApresEntree,
  coutUnitairePropose,
  formatCoutUnitaire,
  lireCoutSaisi,
} from "@/src/lib/coutMoyen";

/**
 * Le coût d'achat : il entre avec la marchandise (coût moyen pondéré), il se
 * fige à la vente, un retour reprend celui de la vente.
 *
 * La formule vit en base (trigger du stock) ET ici. Les deux ont été confrontés
 * en base sur les mêmes entrées — 10 à 10.–, 5 à 13.–, 5 à 16.– : 10 → 11 →
 * 12,25 — et le test relit la migration pour qu'elles ne divergent pas.
 */

const RACINE = join(__dirname, "..");
const MIGRATION = "20260916190138_boutique_cout_achat_fige.sql";
const sql = readFileSync(join(RACINE, "supabase", "migrations", MIGRATION), "utf8");

describe("coût moyen pondéré", () => {
  it("trois entrées à des prix différents", () => {
    let stock = 0;
    let cout: number | null = null;
    for (const [quantite, prix] of [[10, 10], [5, 13], [5, 16]] as const) {
      cout = coutMoyenApresEntree(stock, cout, quantite, prix);
      stock += quantite;
    }
    expect(cout).toBe(12.25);
    // Pas à pas : (10×10)/10 = 10 ; (10×10 + 5×13)/15 = 11 ; (15×11 + 5×16)/20 = 12,25.
    expect(coutMoyenApresEntree(0, null, 10, 10)).toBe(10);
    expect(coutMoyenApresEntree(10, 10, 5, 13)).toBe(11);
    expect(coutMoyenApresEntree(15, 11, 5, 16)).toBe(12.25);
  });

  it("une sortie ne le change pas : elle n'appelle pas la formule, et le stock restant garde son coût", () => {
    // 20 unités à 12,25, on en vend 8 : le coût moyen reste 12,25 ; la prochaine
    // entrée pondère les 12 restantes à 12,25.
    expect(coutMoyenApresEntree(12, 12.25, 8, 15)).toBe(13.35);
  });

  it("une entrée sans coût ne change rien", () => {
    expect(coutMoyenApresEntree(10, 12.25, 5, null)).toBe(12.25);
    expect(coutMoyenApresEntree(10, null, 5, null)).toBeNull();
  });

  it("stock vide, négatif ou coût inconnu : le coût de l'entrée", () => {
    expect(coutMoyenApresEntree(0, 20, 4, 9.5)).toBe(9.5);
    expect(coutMoyenApresEntree(-3, 20, 4, 9.5)).toBe(9.5);
    expect(coutMoyenApresEntree(7, null, 4, 9.5)).toBe(9.5);
  });

  it("garde quatre décimales", () => {
    expect(coutMoyenApresEntree(3, 1, 3, 2.3333)).toBe(1.6667);
  });

  it("la même formule est écrite en base, dans le trigger qui tient le stock", () => {
    expect(sql).toMatch(/\(greatest\(p_stock_avant, 0\) \* p_cout_moyen_avant \+ p_quantite \* p_cout_unitaire\)\s*\/ \(greatest\(p_stock_avant, 0\) \+ p_quantite\), 4\)/);
    expect(sql).toMatch(/if new\.type = 'entree' and new\.cout_unitaire is not null and new\.quantite > 0 then[\s\S]*cout_moyen\s+= public\.cout_moyen_apres_entree[\s\S]*prix_achat\s+= round\(new\.cout_unitaire, 2\)/);
  });
});

describe("le coût proposé à l'entrée", () => {
  it("depuis la dépense quand elle ne porte qu'un article : montant HT / quantité", () => {
    expect(coutUnitairePropose({ montantDepenseHt: 120, nbArticlesDepense: 1, quantite: 8, prixAchat: 99 })).toBe(15);
  });

  it("depuis le dernier prix d'achat quand la dépense porte plusieurs articles", () => {
    expect(coutUnitairePropose({ montantDepenseHt: 120, nbArticlesDepense: 2, quantite: 8, prixAchat: 14.5 })).toBe(14.5);
  });

  it("sans quantité, la dépense ne peut rien proposer", () => {
    expect(coutUnitairePropose({ montantDepenseHt: 120, nbArticlesDepense: 1, quantite: null, prixAchat: 14.5 })).toBe(14.5);
  });

  it("rien du tout : champ à saisir", () => {
    expect(coutUnitairePropose({ quantite: 3, prixAchat: null })).toBeNull();
  });

  it("une saisie vide est acceptée (coût non renseigné), une saisie négative est refusée", () => {
    expect(lireCoutSaisi("")).toEqual({ cout: null });
    expect(lireCoutSaisi("12,5")).toEqual({ cout: 12.5 });
    expect(lireCoutSaisi("-1").refus).toBeTruthy();
    expect(formatCoutUnitaire(null)).toBe("coût non renseigné");
    expect(formatCoutUnitaire("12.2500")).toBe("12.25 CHF");
  });
});

describe("le coût des matières d'une pièce sur mesure", () => {
  const couts = new Map<string, number | null>([["cuir", 4], ["boucle", 1.5], ["inconnu", null]]);

  it("somme des fournitures × coût moyen", () => {
    expect(coutMatieres([
      { composant_article_id: "cuir", composant_quantite: 0.5 },
      { composant_article_id: "boucle", composant_quantite: 2 },
      { composant_article_id: null, composant_quantite: null },
    ], couts)).toBe(5);
  });

  it("null — jamais un coût partiel — si une fourniture n'a pas de coût", () => {
    expect(coutMatieres([
      { composant_article_id: "cuir", composant_quantite: 0.5 },
      { composant_article_id: "inconnu", composant_quantite: 1 },
    ], couts)).toBeNull();
  });

  it("null si la pièce ne consomme aucune fourniture connue", () => {
    expect(coutMatieres([{ composant_article_id: null, composant_quantite: null }], couts)).toBeNull();
  });
});

describe("le coût se fige à la vente et ne bouge plus", () => {
  // Vérifié aussi en base, dans une transaction annulée : deux entrées, vente
  // à 12,25, hausse du prix d'achat à 50.– et entrée à 40.– : la ligne reste
  // à 12,25 ; le retour reprend 12,25.

  const derniereDefinition = (nom: string) => {
    const dossier = join(RACINE, "supabase", "migrations");
    let corps = "";
    for (const f of readdirSync(dossier).filter((x) => x.endsWith(".sql")).sort()) {
      const t = readFileSync(join(dossier, f), "utf8");
      const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${nom}\\s*\\([\\s\\S]*?\\$function\\$([\\s\\S]*?)\\$function\\$`, "gi");
      for (const m of t.matchAll(re)) corps = m[1];
    }
    return corps;
  };

  it("finaliser_vente — passage de la caisse, des commandes en ligne et du sur mesure — pose le coût moyen du moment", () => {
    const f = derniereDefinition("finaliser_vente");
    expect(f).toMatch(/remise_libelle, cout_unitaire_fige\)/);
    expect(f).toMatch(/when a\.type_article = 'personnalisable' then nullif\(l->>'cout_unitaire_fige',''\)::numeric\s+else a\.cout_moyen/);
  });

  it("les appels à finaliser_vente sont bien ceux de la caisse, des commandes en ligne et du sur mesure", () => {
    for (const nom of ["remettre_commande", "creer_commande_sur_mesure"]) {
      // Ces deux fonctions n'ont pas été réécrites : elles appellent finaliser_vente.
      const dossier = join(RACINE, "supabase", "migrations");
      const tout = readdirSync(dossier).filter((x) => x.endsWith(".sql")).map((f) => readFileSync(join(dossier, f), "utf8")).join("\n");
      expect(tout, nom).toMatch(new RegExp(`function public\\.${nom}[\\s\\S]*?public\\.finaliser_vente\\(`));
    }
    const caisse = readFileSync(join(RACINE, "src/lib/caisse.ts"), "utf8");
    expect(caisse).toMatch(/rpc\("finaliser_vente"/);
  });

  it("une ligne de vente reste inaltérable : aucun code ne réécrit son coût", () => {
    expect(sql).toMatch(/alter table public\.ventes_lignes enable trigger ventes_lignes_pas_de_maj;/);
    const fichiers = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (e.name === "node_modules" ? [] : fichiers(join(d, e.name))) : /\.tsx?$/.test(e.name) ? [join(d, e.name)] : []);
    const fautes = [...fichiers(join(RACINE, "app")), ...fichiers(join(RACINE, "src"))]
      .filter((f) => /from\(\s*["']ventes_lignes["']\s*\)\s*\.\s*(update|upsert|delete)/.test(readFileSync(f, "utf8")));
    expect(fautes).toEqual([]);
  });

  it("un retour reprend le coût de la ligne d'origine, jamais celui du jour", () => {
    const r = derniereDefinition("retourner_vente");
    expect(r).toMatch(/\(select vl\.cout_unitaire_fige from public\.ventes_lignes vl\s+where vl\.vente_id = p_vente_id\s+and vl\.article_id is not distinct from nullif\(l->>'article_id',''\)::uuid\s+and vl\.libelle = l->>'libelle'/);
    expect(r).not.toMatch(/cout_moyen/);
  });

  it("le sur mesure transmet le coût des matières, calculé depuis ses fournitures", () => {
    const surMesure = readFileSync(join(RACINE, "app/(admin)/boutique/caisse/sur-mesure/actions.ts"), "utf8");
    expect(surMesure).toMatch(/cout_unitaire_fige: await coutMatieresDeChoix\(choixFiges\)/);
    const enLigne = readFileSync(join(RACINE, "app/(admin)/boutique/commandes-en-ligne/actions.ts"), "utf8");
    expect(enLigne).toMatch(/cout_unitaire_fige: await coutMatieresDeChoix\(await choixDeCommande\(l\.commande_personnalisee_id\)\)/);
  });

  it("aucune écriture comptable ne dépend du coût", () => {
    const f = derniereDefinition("finaliser_vente");
    const ecriture = f.slice(f.indexOf("passer_ecriture("), f.indexOf("insert into public.ventes ("));
    expect(ecriture).not.toMatch(/cout/);
  });
});
