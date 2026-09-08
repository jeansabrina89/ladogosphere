import { describe, it, expect } from "vitest";
import {
  ESPACES,
  espacesVisibles,
  entreesEspace,
  droitsNav,
  estActif,
  espaceDuChemin,
  ouvert,
  type DroitsNav,
} from "@/src/lib/espaces";

/**
 * La composition de la navigation, profil par profil.
 *
 * Deux règles se vérifient ici, et elles ne se négocient pas :
 *  1. un espace dont AUCUN écran n'est ouvert n'apparaît pas — ni grisé, ni vide ;
 *  2. une entrée de menu ne mène jamais à une porte qui se referme.
 */

const droits = (p: Partial<DroitsNav> = {}): DroitsNav => ({
  isAdmin: false,
  perm_encaissements: false,
  perm_factures: false,
  perm_depenses: false,
  perm_boutique_vente: false,
  perm_boutique_gestion: false,
  perm_atelier: false,
  ...p,
});

const ADMIN = droits({ isAdmin: true });
const COMPLETE = droits({
  perm_encaissements: true, perm_depenses: true,
  perm_boutique_vente: true, perm_boutique_gestion: true, perm_atelier: true,
});
const COMPTOIR = droits({ perm_boutique_vente: true });
const SANS_GESTION = droits({ perm_encaissements: true, perm_boutique_vente: true });
const BOUTIQUE_SANS_ATELIER = droits({ perm_boutique_gestion: true, perm_boutique_vente: true });

const cles = (d: DroitsNav) => espacesVisibles(d).map((e) => e.cle);
const labels = (cle: Parameters<typeof entreesEspace>[0], d: DroitsNav) =>
  entreesEspace(cle, d).map((e) => e.label);

describe("les huit espaces", () => {
  it("l'administratrice les voit tous, dans l'ordre", () => {
    expect(cles(ADMIN)).toEqual([
      "aujourdhui", "pension", "clients", "boutique",
      "atelier", "comptabilite", "equipe", "reglages",
    ]);
  });

  it("huit entrées, pas vingt-deux : c'est ce qui tient dans 667 px", () => {
    expect(ESPACES).toHaveLength(8);
    expect(espacesVisibles(ADMIN)).toHaveLength(8);
  });
});

describe("ce que voit chaque profil", () => {
  it("une employée complète voit tout sauf ce qui est réservé à l'admin", () => {
    // Comptabilité, Équipe et Réglages sont réservés à l'admin par la porte de
    // l'ESPACE : aucune permission d'employée ne les ouvre.
    expect(cles(COMPLETE)).toEqual([
      "aujourdhui", "pension", "clients", "boutique", "atelier",
    ]);
    for (const ferme of ["comptabilite", "equipe", "reglages"]) {
      expect(cles(COMPLETE), ferme).not.toContain(ferme);
    }
  });

  it("une employée au comptoir : quatre entrées, jamais vingt-deux", () => {
    expect(cles(COMPTOIR)).toEqual(["aujourdhui", "pension", "clients", "boutique"]);
    expect(cles(COMPTOIR).length).toBeLessThanOrEqual(6);
  });

  it("sans permission de gestion, la boutique perd l'inventaire et les modèles", () => {
    const vus = labels("boutique", SANS_GESTION);
    expect(vus).toContain("💳 Caisse");
    expect(vus).toContain("🛒 Articles");
    expect(vus).not.toContain("📦 Inventaire");
    expect(vus).not.toContain("🧩 Modèles");
    // Les fournisseurs relèvent des dépenses, pas de la gestion boutique.
    expect(vus).not.toContain("🏢 Fournisseurs");
  });

  it("la gestion boutique n'ouvre PAS l'atelier : les deux sont indépendantes", () => {
    expect(cles(BOUTIQUE_SANS_ATELIER)).toContain("boutique");
    expect(cles(BOUTIQUE_SANS_ATELIER)).not.toContain("atelier");
    expect(entreesEspace("atelier", BOUTIQUE_SANS_ATELIER)).toEqual([]);
  });

  it("et l'atelier n'ouvre pas la boutique", () => {
    const atelierSeul = droits({ perm_atelier: true });
    expect(cles(atelierSeul)).toContain("atelier");
    expect(cles(atelierSeul)).not.toContain("boutique");
    expect(labels("atelier", atelierSeul)).toEqual([
      "🏠 Atelier", "🧵 Fournitures", "📦 Inventaire", "📥 Entrées de stock",
    ]);
  });
});

describe("un espace vide n'apparaît pas", () => {
  it("aucun espace visible ne contient zéro entrée", () => {
    for (const d of [ADMIN, COMPLETE, COMPTOIR, SANS_GESTION, BOUTIQUE_SANS_ATELIER]) {
      for (const espace of espacesVisibles(d)) {
        expect(espace.entrees.length).toBeGreaterThan(0);
      }
    }
  });

  it("un profil sans aucune permission garde tout de même le quotidien", () => {
    // Aujourd'hui, Pension et Clients sont ouverts à tout le personnel : une
    // employée nouvellement créée n'arrive pas sur un écran vide.
    expect(cles(droits())).toEqual(["aujourdhui", "pension", "clients"]);
  });
});

describe("une entrée de menu ne mène jamais à une redirection", () => {
  it("le lien de l'espace pointe sur un écran réellement autorisé", () => {
    for (const d of [ADMIN, COMPLETE, COMPTOIR, SANS_GESTION, BOUTIQUE_SANS_ATELIER, droits()]) {
      for (const espace of espacesVisibles(d)) {
        const premiere = espace.entrees[0];
        expect(espace.href).toBe(premiere.href);
        expect(ouvert(premiere.exigence, d)).toBe(true);
      }
    }
  });

  it("aucune permission d'employée n'ouvre l'espace Comptabilité", () => {
    // C'était le défaut : perm_encaissements suffisait à le faire apparaître,
    // pour la seule liste des factures. La porte est maintenant sur l'espace.
    for (const d of [
      droits({ perm_encaissements: true }),
      droits({ perm_factures: true }),
      droits({ perm_depenses: true }),
      COMPLETE,
    ]) {
      expect(cles(d)).not.toContain("comptabilite");
      expect(entreesEspace("comptabilite", d)).toEqual([]);
    }
  });

  it("mais les fournisseurs restent atteignables par la Boutique", () => {
    const depenses = droits({ perm_depenses: true, perm_boutique_vente: true });
    expect(labels("boutique", depenses)).toContain("🏢 Fournisseurs");
  });

  it("l'admin, elle, entre par l'accueil de l'espace", () => {
    const compta = espacesVisibles(ADMIN).find((e) => e.cle === "comptabilite");
    expect(compta?.href).toBe("/comptabilite");
  });
});

describe("les trois déplacements décidés", () => {
  it("Tarifs, Modèles d'e-mails et TVA sont dans Réglages", () => {
    expect(labels("reglages", ADMIN)).toEqual([
      "🏠 Réglages", "💰 Tarifs", "✉️ Modèles d'e-mails", "🧾 TVA",
    ]);
  });

  it("Factures, À encaisser, Relances et Dépenses sont regroupés en Comptabilité", () => {
    const vus = labels("comptabilite", ADMIN);
    expect(vus).toContain("🧾 Factures");
    expect(vus).toContain("💰 À encaisser");
    expect(vus).toContain("🔔 Relances");
    expect(vus).toContain("💸 Dépenses");
  });

  it("« Personnel » n'est plus une entrée de menu : c'est un filtre", () => {
    const tous = ESPACES.flatMap((e) => [e.accueil, ...e.ecrans]);
    expect(tous.some((e) => e.label.includes("Personnel"))).toBe(false);
    expect(tous.some((e) => e.href.includes("personnel=1"))).toBe(false);
  });

  it("« Mes chiens » ne fait pas partie des espaces : il vit au bas de la barre", () => {
    const tous = ESPACES.flatMap((e) => [e.accueil, ...e.ecrans]);
    expect(tous.some((e) => e.href === "/mon-compte")).toBe(false);
  });
});

describe("un fournisseur, un écran, deux chemins", () => {
  it("la même adresse apparaît dans Boutique et dans Comptabilité", () => {
    expect(labels("boutique", ADMIN)).toContain("🏢 Fournisseurs");
    expect(labels("comptabilite", ADMIN)).toContain("🏢 Fournisseurs");
    const hrefs = ESPACES
      .flatMap((e) => e.ecrans)
      .filter((e) => e.label === "🏢 Fournisseurs")
      .map((e) => e.href);
    expect(hrefs).toEqual(["/comptabilite/fournisseurs", "/comptabilite/fournisseurs"]);
  });
});

describe("aucune adresse d'écran n'a changé", () => {
  it("les écrans historiques gardent leur chemin de premier niveau", () => {
    const tous = ESPACES.flatMap((e) => [e.accueil, ...e.ecrans]).map((e) => e.href);
    for (const attendu of [
      "/", "/chiens-du-jour", "/checkin", "/planning", "/boxes", "/calendrier-essais",
      "/clients", "/chiens", "/reservations", "/adhesions", "/abonnements",
      "/factures", "/tarifs", "/emails",
      "/employes", "/employes/planning", "/employes/timbrage", "/employes/vacances",
      "/comptabilite", "/comptabilite/a-regulariser", "/comptabilite/relances",
      "/comptabilite/depenses", "/comptabilite/fournisseurs",
      "/comptabilite/journal", "/comptabilite/rapports",
      "/boutique", "/boutique/caisse", "/boutique/articles", "/boutique/inventaire",
    ]) {
      expect(tous).toContain(attendu);
    }
  });

  it("aucun /factures n'est devenu /comptabilite/factures", () => {
    const tous = ESPACES.flatMap((e) => [e.accueil, ...e.ecrans]).map((e) => e.href);
    expect(tous).not.toContain("/comptabilite/factures");
  });
});

describe("l'entrée allumée", () => {
  it("« /chiens » ne s'allume pas sur « /chiens-du-jour »", () => {
    expect(estActif("/chiens-du-jour", "/chiens")).toBe(false);
    expect(estActif("/chiens", "/chiens")).toBe(true);
    expect(estActif("/chiens/abc-123", "/chiens")).toBe(true);
  });

  it("l'accueil « / » ne s'allume que sur lui-même", () => {
    expect(estActif("/", "/", true)).toBe(true);
    expect(estActif("/boutique", "/")).toBe(false);
  });

  it("les paramètres et la barre finale ne changent rien", () => {
    expect(estActif("/reservations?personnel=1", "/reservations")).toBe(true);
    expect(estActif("/boutique/", "/boutique", true)).toBe(true);
  });

  it("chaque adresse tombe dans le bon espace, au segment le plus précis", () => {
    expect(espaceDuChemin("/chiens-du-jour")).toBe("pension");
    expect(espaceDuChemin("/chiens/abc")).toBe("clients");
    expect(espaceDuChemin("/boutique/caisse")).toBe("boutique");
    expect(espaceDuChemin("/atelier/inventaire")).toBe("atelier");
    // Un écran partagé : la fiche fournisseur est nommée dans deux espaces ;
    // c'est le premier déclaré qui allume, et il en faut UN seul.
    expect(["boutique", "comptabilite"]).toContain(espaceDuChemin("/comptabilite/fournisseurs"));
    expect(espaceDuChemin("/comptabilite/depenses/abc")).toBe("comptabilite");
    expect(espaceDuChemin("/employes/mon-espace")).toBe(null);
    expect(espaceDuChemin("/")).toBe("aujourdhui");
  });
});

describe("droitsNav", () => {
  it("l'admin a tout, sans qu'aucune case soit cochée", () => {
    expect(droitsNav({}, true)).toEqual({
      isAdmin: true,
      perm_encaissements: true,
      perm_factures: true,
      perm_depenses: true,
      perm_boutique_vente: true,
      perm_boutique_gestion: true,
      perm_atelier: true,
    });
  });

  it("ne se laisse pas berner par une valeur qui n'est pas exactement true", () => {
    expect(droitsNav({ perm_atelier: "oui" }).perm_atelier).toBe(false);
    expect(droitsNav(null).perm_depenses).toBe(false);
    expect(droitsNav(undefined).isAdmin).toBe(false);
  });
});

// ── APP 14c : ce que chaque profil voit, après les corrections ──────────────

describe("la composition corrigée", () => {
  it("la Pension a repris les réservations", () => {
    expect(labels("pension", ADMIN)).toEqual([
      "🏠 Pension", "🐾 Chiens du jour", "✅ Check-in", "📅 Réservations",
      "🗂️ Planning", "🏠 Box", "🚫 Essais fermés",
    ]);
  });

  it("et les Clients ne gardent que la clientèle", () => {
    expect(labels("clients", ADMIN)).toEqual([
      "🏠 Clients", "👤 Clients", "🐶 Chiens", "🎫 Adhésions", "🎟️ Abonnements",
    ]);
    expect(labels("clients", ADMIN)).not.toContain("📅 Réservations");
  });

  it("l'Atelier a repris les modèles et le sur-mesure", () => {
    expect(labels("atelier", ADMIN)).toEqual([
      "🏠 Atelier", "🧵 Fournitures", "📦 Inventaire", "📥 Entrées de stock",
      "🧩 Modèles", "🎁 Commandes sur mesure",
    ]);
  });

  it("et la Boutique ne garde que la vente", () => {
    expect(labels("boutique", ADMIN)).toEqual([
      "🏠 Boutique", "💳 Caisse", "🧾 Ventes", "🌐 En ligne",
      "🛒 Articles", "📦 Inventaire", "🔔 Attentes", "🏢 Fournisseurs",
    ]);
  });

  it("aucune adresse n'a changé en déménageant de menu", () => {
    const tous = ESPACES.flatMap((e) => [e.accueil, ...e.ecrans]).map((e) => e.href);
    for (const inchangee of [
      "/reservations", "/boutique/modeles", "/boutique/commandes",
      "/factures", "/comptabilite/relances",
    ]) {
      expect(tous, inchangee).toContain(inchangee);
    }
  });
});

describe("les quatre profils du parcours", () => {
  const VENDEUSE_SANS_ATELIER = droits({
    perm_checkin: true, perm_encaissements: true, perm_boutique_vente: true,
  } as Partial<DroitsNav>);

  it("l'admin voit les huit espaces", () => {
    expect(cles(ADMIN)).toHaveLength(8);
  });

  it("une employée qui encaisse ne voit AUCUNE entrée Comptabilité", () => {
    const encaisse = droits({ perm_encaissements: true });
    expect(cles(encaisse)).toEqual(["aujourdhui", "pension", "clients"]);
    // Ni l'espace, ni un seul de ses écrans, où que ce soit.
    const vus = espacesVisibles(encaisse).flatMap((e) => e.entrees.map((x) => x.href));
    for (const compta of [
      "/comptabilite", "/factures", "/comptabilite/relances",
      "/comptabilite/depenses", "/comptabilite/journal", "/comptabilite/rapports",
      "/comptabilite/a-regulariser", "/comptabilite/fournisseurs",
    ]) {
      expect(vus, compta).not.toContain(compta);
    }
  });

  it("mais elle garde adhésions et abonnements : c'est le geste de comptoir", () => {
    const encaisse = droits({ perm_encaissements: true });
    expect(labels("clients", encaisse)).toContain("🎫 Adhésions");
    expect(labels("clients", encaisse)).toContain("🎟️ Abonnements");
  });

  it("une vendeuse sans atelier vend, mais ne voit ni Atelier ni sur-mesure", () => {
    expect(cles(VENDEUSE_SANS_ATELIER)).toEqual([
      "aujourdhui", "pension", "clients", "boutique",
    ]);
    expect(cles(VENDEUSE_SANS_ATELIER)).not.toContain("atelier");

    const vus = espacesVisibles(VENDEUSE_SANS_ATELIER)
      .flatMap((e) => e.entrees.map((x) => x.href));
    expect(vus).not.toContain("/boutique/modeles");
    expect(vus).not.toContain("/boutique/commandes");
    // La caisse, elle, est bien là : c'est de là qu'elle vend un sur-mesure.
    expect(vus).toContain("/boutique/caisse");
  });

  it("une employée sans aucune permission garde le quotidien, et rien d'autre", () => {
    expect(cles(droits())).toEqual(["aujourdhui", "pension", "clients"]);
    expect(labels("clients", droits())).toEqual(["🏠 Clients", "👤 Clients", "🐶 Chiens"]);
  });
});

describe("l'espace d'une adresse prêtée", () => {
  it("« Modèles » et « Sur mesure » comptent pour l'atelier, pas pour la boutique", () => {
    expect(espaceDuChemin("/boutique/modeles")).toBe("atelier");
    expect(espaceDuChemin("/boutique/commandes")).toBe("atelier");
    // Et la caisse reste bien à la boutique.
    expect(espaceDuChemin("/boutique/caisse")).toBe("boutique");
    expect(espaceDuChemin("/boutique/commandes-en-ligne")).toBe("boutique");
  });

  it("les réservations comptent désormais pour la pension", () => {
    expect(espaceDuChemin("/reservations")).toBe("pension");
    expect(espaceDuChemin("/reservations/abc-123")).toBe("pension");
  });
});
