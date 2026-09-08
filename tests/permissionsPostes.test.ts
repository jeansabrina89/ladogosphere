import { describe, it, expect } from "vitest";
import { PERMISSIONS_PERSONNEL } from "@/src/lib/accesAdmin";
import {
  DOMAINES,
  TOUTES_PERMISSIONS,
  NOMBRE_PERMISSIONS,
  compterPermissions,
  POSTES,
  SOIGNEUSE,
  VENDEUSE,
  RESPONSABLE,
  JAMAIS_PAR_RACCOURCI,
} from "@/src/lib/permissionsCatalogue";
import { espacesVisibles, droitsNav, type DroitsNav } from "@/src/lib/espaces";

/**
 * Le catalogue des permissions et les trois postes.
 *
 * Le défaut d'origine : la fiche d'un employé n'affichait que neuf permissions
 * sur dix-neuf. Cocher « Boutique » marchait, mais ne se voyait pas, et on
 * croyait la coche perdue. Ces tests interdisent qu'une permission existe sans
 * apparaître à l'écran.
 */

describe("le catalogue montre TOUTES les permissions", () => {
  it("aucune permission de la garde n'est absente du catalogue", () => {
    const manquantes = PERMISSIONS_PERSONNEL.filter((p) => !TOUTES_PERMISSIONS.includes(p));
    expect(manquantes).toEqual([]);
  });

  it("et le catalogue n'invente aucune permission qui n'existe pas", () => {
    const inventees = TOUTES_PERMISSIONS.filter(
      (p) => !(PERMISSIONS_PERSONNEL as readonly string[]).includes(p)
    );
    expect(inventees).toEqual([]);
  });

  it("aucune permission n'est rangée dans deux domaines à la fois", () => {
    expect(new Set(TOUTES_PERMISSIONS).size).toBe(TOUTES_PERMISSIONS.length);
  });

  it("les six domaines sont nommés, et aucun n'est vide", () => {
    expect(DOMAINES.map((d) => d.nom)).toEqual([
      "Pension", "Clients", "Comptoir", "Boutique", "Atelier", "Équipe",
    ]);
    for (const d of DOMAINES) expect(d.entrees.length, d.nom).toBeGreaterThan(0);
  });

  it("chaque pastille porte un nom court, jamais la clé technique", () => {
    for (const d of DOMAINES) {
      for (const e of d.entrees) {
        expect(e.court, e.cle).toBeTruthy();
        expect(e.court, e.cle).not.toMatch(/^perm_/);
      }
    }
  });
});

describe("le compteur", () => {
  it("compte ce qui est coché, sur le total réel", () => {
    const profil = { perm_checkin: true, perm_planning: true, perm_boutique_vente: true };
    expect(compterPermissions(profil)).toEqual({ accordees: 3, total: NOMBRE_PERMISSIONS });
  });

  it("l'administratrice les a toutes, sans qu'aucune colonne soit vraie", () => {
    expect(compterPermissions({}, true)).toEqual({
      accordees: NOMBRE_PERMISSIONS, total: NOMBRE_PERMISSIONS,
    });
  });

  it("ne se laisse pas berner par une valeur qui n'est pas exactement true", () => {
    expect(compterPermissions({ perm_checkin: "oui" }).accordees).toBe(0);
    expect(compterPermissions(null).accordees).toBe(0);
  });

  it("le total suit la garde : il n'est écrit en dur nulle part", () => {
    expect(NOMBRE_PERMISSIONS).toBe(PERMISSIONS_PERSONNEL.length);
  });
});

describe("les trois postes", () => {
  it("chacun contient le précédent", () => {
    for (const p of SOIGNEUSE) expect(VENDEUSE, p).toContain(p);
    for (const p of VENDEUSE) expect(RESPONSABLE, p).toContain(p);
  });

  it("la soigneuse : la pension et les fiches, rien de l'argent", () => {
    expect([...SOIGNEUSE].sort()).toEqual([
      "perm_box", "perm_checkin", "perm_chiens_creer", "perm_chiens_modifier",
      "perm_clients_creer", "perm_clients_modifier", "perm_journee_essai",
      "perm_planning", "perm_reservations_creer", "perm_reservations_modifier",
    ]);
    expect(SOIGNEUSE).not.toContain("perm_encaissements");
    expect(SOIGNEUSE).not.toContain("perm_boutique_vente");
  });

  it("la vendeuse ajoute l'encaissement et la vente en boutique", () => {
    expect(VENDEUSE).toContain("perm_encaissements");
    expect(VENDEUSE).toContain("perm_boutique_vente");
    expect(VENDEUSE).not.toContain("perm_boutique_gestion");
    expect(VENDEUSE).not.toContain("perm_depenses");
  });

  it("la responsable ajoute la gestion, les dépenses et l'équipe", () => {
    for (const p of [
      "perm_boutique_gestion", "perm_depenses", "perm_tarifs_urgence",
      "perm_timbrage_equipe", "perm_vacances_equipe",
    ]) {
      expect(RESPONSABLE, p).toContain(p);
    }
  });

  it("AUCUN poste ne coche « Factures » ni « Atelier »", () => {
    for (const poste of POSTES) {
      for (const interdite of JAMAIS_PAR_RACCOURCI) {
        expect(poste.cases, `${poste.cle} / ${interdite}`).not.toContain(interdite);
      }
    }
  });

  it("aucun poste ne coche une permission qui n'existe pas", () => {
    for (const poste of POSTES) {
      for (const p of poste.cases) {
        expect(PERMISSIONS_PERSONNEL, `${poste.cle} / ${p}`).toContain(p);
      }
      expect(new Set(poste.cases).size, poste.cle).toBe(poste.cases.length);
    }
  });

  it("aucun poste n'ouvre la Comptabilité — c'est tout l'objet du découpage", () => {
    for (const poste of POSTES) {
      const perms = Object.fromEntries(poste.cases.map((c) => [c, true]));
      const cles = espacesVisibles(droitsNav(perms)).map((e) => e.cle);
      expect(cles, poste.cle).not.toContain("comptabilite");
    }
  });

  it("le poste « responsable » donne bien la boutique, mais pas l'atelier", () => {
    const perms = Object.fromEntries(RESPONSABLE.map((c) => [c, true]));
    const cles = espacesVisibles(droitsNav(perms)).map((e) => e.cle);
    expect(cles).toContain("boutique");
    expect(cles).not.toContain("atelier");
  });
});

describe("la reprise de perm_factures", () => {
  /** Ce que la migration a écrit : encaissements gardé, factures à false. */
  const apresReprise = (avait: boolean) => ({
    perm_encaissements: avait,
    perm_factures: false,
  });

  it("personne ne gagne d'accès : qui encaissait n'obtient pas les factures", () => {
    const d: DroitsNav = droitsNav(apresReprise(true));
    expect(d.perm_encaissements).toBe(true);
    expect(d.perm_factures).toBe(false);
  });

  it("et qui n'encaissait pas ne gagne rien non plus", () => {
    const d = droitsNav(apresReprise(false));
    expect(d.perm_encaissements).toBe(false);
    expect(d.perm_factures).toBe(false);
  });

  it("l'employée qui encaissait perd la liste des factures : c'est voulu", () => {
    const avant = droitsNav({ perm_encaissements: true });
    // La liste des factures ne s'ouvre plus avec l'encaissement seul…
    expect(avant.perm_factures).toBe(false);
    // …et l'espace qui la porte a disparu de sa barre.
    expect(espacesVisibles(avant).map((e) => e.cle)).not.toContain("comptabilite");
  });

  it("les deux permissions sont bien deux colonnes distinctes de la garde", () => {
    expect(PERMISSIONS_PERSONNEL).toContain("perm_encaissements");
    expect(PERMISSIONS_PERSONNEL).toContain("perm_factures");
  });
});
