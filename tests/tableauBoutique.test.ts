import { describe, it, expect } from "vitest";
import {
  chiffresBoutique,
  debutDuMois,
  type ArticleDuTableau,
  type CommandeDuTableau,
  type VenteDuTableau,
} from "@/src/lib/tableauBoutique";

const JOUR = "2026-09-15";

const ventes: VenteDuTableau[] = [
  // Aujourd'hui
  { date_vente: "2026-09-15T09:12:00+02:00", montant_total: 25.0, mode_reglement: "especes", vente_origine_id: null },
  { date_vente: "2026-09-15T11:40:00+02:00", montant_total: 40.5, mode_reglement: "carte", vente_origine_id: null },
  { date_vente: "2026-09-15T15:02:00+02:00", montant_total: 12.0, mode_reglement: "especes", vente_origine_id: null },
  // Un retour du jour : il pèse sur les montants, pas sur le nombre de ventes.
  { date_vente: "2026-09-15T16:20:00+02:00", montant_total: -12.0, mode_reglement: "especes", vente_origine_id: "v3" },
  // Plus tôt dans le mois
  { date_vente: "2026-09-02T10:00:00+02:00", montant_total: 100.0, mode_reglement: "twint", vente_origine_id: null },
  // Le mois d'avant : hors de tout
  { date_vente: "2026-08-30T10:00:00+02:00", montant_total: 999.0, mode_reglement: "especes", vente_origine_id: null },
];

const commandes: CommandeDuTableau[] = [
  { statut: "a_faire", date_promise: "2026-09-20" },
  { statut: "a_faire", date_promise: "2026-09-10" },   // en retard
  { statut: "en_cours", date_promise: "2026-09-01" },  // en retard aussi
  { statut: "prete", date_promise: "2026-09-30" },
];

const articles: ArticleDuTableau[] = [
  { actif: true, stock_actuel: 2, stock_alerte: 3, prix_achat: 10 },   // sous le seuil
  { actif: true, stock_actuel: 8, stock_alerte: 3, prix_achat: 5 },
  { actif: true, stock_actuel: 4, stock_alerte: 0, prix_achat: 2.5 },  // sans seuil
  { actif: false, stock_actuel: 100, stock_alerte: 1, prix_achat: 50 }, // retiré
  { actif: true, composant: true, stock_actuel: 20, stock_alerte: 25, prix_achat: 3 }, // fourniture
  { actif: true, type_article: "personnalisable", stock_actuel: 0, stock_alerte: 0, prix_achat: 20 },
];

describe("chiffres du tableau de bord de la boutique", () => {
  const c = chiffresBoutique({ ventes, commandes, articles, jourISO: JOUR });

  it("compte les ventes du jour, retours déduits des montants", () => {
    // 25 + 40.50 + 12 − 12
    expect(c.ventesJourTotal).toBe(65.5);
    // Trois ventes : le retour n'en est pas une.
    expect(c.ventesJourNombre).toBe(3);
  });

  it("totalise le mois en cours, et lui seul", () => {
    // 65.50 du jour + 100 du 2 septembre. Le 30 août reste dehors.
    expect(c.ventesMoisTotal).toBe(165.5);
  });

  it("isole les espèces du jour", () => {
    // 25 + 12 − 12 : la carte et le TWINT ne sont pas dans le tiroir.
    expect(c.especesJour).toBe(25);
  });

  it("ne compte en rayon ni les fournitures ni le sur-mesure ni les retirés", () => {
    expect(c.articlesActifs).toBe(3);
  });

  it("signale les articles sous le seuil, sans seuil pas d'alerte", () => {
    expect(c.sousLeSeuil).toBe(1);
  });

  it("valorise le stock au prix d'achat, en rayon seulement", () => {
    // 2 × 10 + 8 × 5 + 4 × 2.50 = 70
    expect(c.valeurStock).toBe(70);
  });

  it("compte les commandes à faire et celles en retard", () => {
    expect(c.commandesAFaire).toBe(2);
    // Une « à faire » et une « en cours » sont dépassées.
    expect(c.commandesEnRetard).toBe(2);
  });

  it("une journée sans rien ne casse rien", () => {
    const vide = chiffresBoutique({ ventes: [], commandes: [], articles: [], jourISO: JOUR });
    expect(vide).toEqual({
      ventesJourNombre: 0,
      ventesJourTotal: 0,
      ventesMoisTotal: 0,
      especesJour: 0,
      articlesActifs: 0,
      sousLeSeuil: 0,
      commandesAFaire: 0,
      commandesEnRetard: 0,
      valeurStock: 0,
    });
  });

  it("une commande promise pour aujourd'hui n'est pas en retard", () => {
    const c2 = chiffresBoutique({
      ventes: [],
      commandes: [{ statut: "a_faire", date_promise: JOUR }],
      articles: [],
      jourISO: JOUR,
    });
    expect(c2.commandesEnRetard).toBe(0);
  });

  it("borne le mois au premier jour", () => {
    expect(debutDuMois("2026-09-15")).toBe("2026-09-01");
    expect(debutDuMois("2026-01-31")).toBe("2026-01-01");
  });
});
