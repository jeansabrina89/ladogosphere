import { describe, it, expect } from "vitest";
import { deciderAccesAdmin, permissionsBoutique } from "@/src/lib/accesAdmin";
import { CHAMPS_RESERVES_GESTION, colonnesArticle } from "@/src/lib/boutiqueLogique";
import { entreesEspace, droitsNav } from "@/src/lib/espaces";

/**
 * La barre secondaire de la boutique est devenue celle des huit espaces :
 * `entreesEspace("boutique", …)`. Le comportement attendu n'a pas changé.
 */
const entreesVisibles = (gestion: boolean) =>
  entreesEspace("boutique", droitsNav({
    perm_boutique_vente: true,
    perm_boutique_gestion: gestion,
    // La fiche fournisseur relève des dépenses : elle apparaît quand on y a
    // droit, ce que la gestion boutique n'implique pas.
    perm_depenses: gestion,
  }));

/**
 * Vendre et gérer sont deux métiers. Ces tests couvrent les quatre
 * combinaisons des deux cases, plus l'admin, et le filtrage des champs que le
 * comptoir n'a pas à connaître.
 */

const employe = (perms: Record<string, boolean>) => ({
  connecte: true, role: "employe", permissions: perms,
});

const AUCUNE = {};
const VENTE = { perm_boutique_vente: true };
const GESTION = { perm_boutique_gestion: true };
const LES_DEUX = { perm_boutique_vente: true, perm_boutique_gestion: true };

describe("la gestion implique la vente", () => {
  it("les quatre combinaisons, lues d'un seul endroit", () => {
    expect(permissionsBoutique(AUCUNE)).toEqual({ vente: false, gestion: false });
    expect(permissionsBoutique(VENTE)).toEqual({ vente: true, gestion: false });
    // Le cas qui compte : la gestion seule vaut les deux.
    expect(permissionsBoutique(GESTION)).toEqual({ vente: true, gestion: true });
    expect(permissionsBoutique(LES_DEUX)).toEqual({ vente: true, gestion: true });
  });

  it("ne se laisse pas berner par une valeur qui n'est pas exactement true", () => {
    expect(permissionsBoutique({ perm_boutique_vente: "oui" })).toEqual({ vente: false, gestion: false });
    expect(permissionsBoutique(null)).toEqual({ vente: false, gestion: false });
    expect(permissionsBoutique(undefined)).toEqual({ vente: false, gestion: false });
  });
});

describe("décision d'accès aux écrans de la boutique", () => {
  it("sans aucune des deux, on n'entre pas — et on est renvoyé à la boutique", () => {
    const vente = deciderAccesAdmin(employe(AUCUNE), { permission: "perm_boutique_vente" });
    expect(vente).toEqual({
      autorise: false, redirection: "/boutique", motif: "Permission manquante",
    });
    expect(deciderAccesAdmin(employe(AUCUNE), { permission: "perm_boutique_gestion" }).autorise)
      .toBe(false);
  });

  it("avec la vente seule : la caisse oui, l'inventaire non", () => {
    expect(deciderAccesAdmin(employe(VENTE), { permission: "perm_boutique_vente" }).autorise).toBe(true);
    expect(deciderAccesAdmin(employe(VENTE), { permission: "perm_boutique_gestion" }).autorise).toBe(false);
  });

  it("avec la gestion seule : les deux, puisqu'elle implique la vente", () => {
    expect(deciderAccesAdmin(employe(GESTION), { permission: "perm_boutique_vente" }).autorise).toBe(true);
    expect(deciderAccesAdmin(employe(GESTION), { permission: "perm_boutique_gestion" }).autorise).toBe(true);
  });

  it("avec les deux : tout", () => {
    expect(deciderAccesAdmin(employe(LES_DEUX), { permission: "perm_boutique_vente" }).autorise).toBe(true);
    expect(deciderAccesAdmin(employe(LES_DEUX), { permission: "perm_boutique_gestion" }).autorise).toBe(true);
  });

  it("l'admin a tout d'office, sans qu'aucune case soit cochée", () => {
    const admin = { connecte: true, role: "admin", permissions: AUCUNE };
    expect(deciderAccesAdmin(admin, { permission: "perm_boutique_vente" }).autorise).toBe(true);
    expect(deciderAccesAdmin(admin, { permission: "perm_boutique_gestion" }).autorise).toBe(true);
  });

  it("le rôle passe avant la permission, comme partout", () => {
    // Un client à qui on aurait posé la case reste dehors.
    const client = { connecte: true, role: "client", permissions: LES_DEUX };
    expect(deciderAccesAdmin(client, { permission: "perm_boutique_vente" })).toEqual({
      autorise: false, redirection: "/mon-compte", motif: "Accès réservé au personnel",
    });
    // Et non connecté, on va au login avant toute question de permission.
    expect(deciderAccesAdmin({ connecte: false }, { permission: "perm_boutique_gestion" })).toEqual({
      autorise: false, redirection: "/login", motif: "Non connecté",
    });
  });

  it("renvoie à l'accueil général pour les autres permissions, pas à la boutique", () => {
    expect(deciderAccesAdmin(employe(AUCUNE), { permission: "perm_depenses" }).autorise).toBe(false);
    const d = deciderAccesAdmin(employe(AUCUNE), { permission: "perm_depenses" });
    expect(d.autorise === false && d.redirection).toBe("/");
  });
});

describe("navigation secondaire", () => {
  it("n'affiche à une vendeuse que ce qu'elle peut ouvrir", () => {
    const labels = entreesVisibles(false).map((e) => e.label);
    expect(labels).toContain("💳 Caisse");
    expect(labels).toContain("🧾 Ventes");
    expect(labels).toContain("🛒 Articles");
    expect(labels).toContain("🌐 En ligne");
    expect(labels).not.toContain("📦 Inventaire");
    expect(labels).not.toContain("🧩 Modèles");
    expect(labels).not.toContain("🏢 Fournisseurs");
  });

  it("montre tout à la gestion", () => {
    const labels = entreesVisibles(true).map((e) => e.label);
    expect(labels).toContain("📦 Inventaire");
    expect(labels).toContain("🧩 Modèles");
    expect(labels).toContain("🏢 Fournisseurs");
  });
});

describe("champs réservés du catalogue", () => {
  it("nomme ce que le comptoir ne reçoit jamais", () => {
    expect([...CHAMPS_RESERVES_GESTION].sort()).toEqual(["fournisseur_id", "prix_achat"]);
  });

  it("ne les demande pas au SELECT de la vente — le filtrage est côté serveur", () => {
    const vente = colonnesArticle("vente");
    for (const champ of CHAMPS_RESERVES_GESTION) {
      expect(vente).not.toContain(champ);
    }
    // Le stock, lui, reste : on doit savoir ce qu'il reste en rayon.
    expect(vente).toContain("stock_actuel");
    expect(vente).toContain("prix_vente");
  });

  it("les demande pour la gestion, qui en a besoin", () => {
    const gestion = colonnesArticle("gestion");
    for (const champ of CHAMPS_RESERVES_GESTION) {
      expect(gestion).toContain(champ);
    }
  });
});
