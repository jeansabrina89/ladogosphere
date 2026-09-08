import { describe, it, expect } from "vitest";
import {
  calculerJournee,
  rappelsDeLaSemaine,
  resteDu,
  resultatEssaiASaisir,
  decalerJours,
  jourDe,
  type EntreeJournee,
  type LigneCheckin,
  type DroitsJournee,
} from "@/src/lib/journee";

/**
 * L'écran du matin.
 *
 * Ce qui se vérifie ici n'est pas un affichage : c'est qu'on ne rende PAS un
 * chien en oubliant son colis, son solde ou le résultat de sa journée d'essai.
 */

const JOUR = "2026-09-08";

const TOUT: DroitsJournee = { isAdmin: true, perm_encaissements: true, perm_boutique_vente: true };
const COMPTOIR: DroitsJournee = { isAdmin: false, perm_encaissements: false, perm_boutique_vente: true };

function ligne(p: Partial<LigneCheckin> & { id: string }): LigneCheckin {
  return {
    statut: "attendu",
    date_arrivee_prevue: `${JOUR}T08:00:00Z`,
    date_depart_prevu: `${JOUR}T18:00:00Z`,
    reservation: {
      id: "r1", type_reservation: "sejour",
      heure_arrivee: "08:30", heure_depart: "17:00",
      statut: "validee", offerte: false,
      montant_final: 120, montant_calcule: 120, montant_paye: 120,
      box: "Box 3", client: { id: "c1", prenom: "Marie", nom: "Dupont" },
    },
    chien: { id: "d1", nom: "Rex", statut_essai: "non_programme" },
    ...p,
  };
}

function entree(p: Partial<EntreeJournee> = {}): EntreeJournee {
  return {
    jourISO: JOUR,
    arrivees: [],
    departs: [],
    chiensDejaVenus: [],
    colisParClient: {},
    adhesions: [],
    commandes: [],
    depensesSansJustificatif: [],
    facturesEnRetard: [],
    droits: TOUT,
    ...p,
  };
}

describe("les arrivées", () => {
  it("une ligne par chien, avec l'heure, le propriétaire et le box", () => {
    const j = calculerJournee(entree({ arrivees: [ligne({ id: "a1" })] }));
    expect(j.arrivees).toHaveLength(1);
    const a = j.arrivees[0];
    expect(a.heure).toBe("08:30");
    expect(a.chien.nom).toBe("Rex");
    expect(a.client.nom).toBe("Marie Dupont");
    expect(a.box).toBe("Box 3");
  });

  it("sont rangées par heure, puis par nom de chien", () => {
    const j = calculerJournee(entree({
      arrivees: [
        ligne({ id: "a2", chien: { id: "d2", nom: "Zeus", statut_essai: null },
          reservation: { ...ligne({ id: "x" }).reservation!, heure_arrivee: "10:00" } }),
        ligne({ id: "a1", reservation: { ...ligne({ id: "x" }).reservation!, heure_arrivee: "08:00" } }),
      ],
    }));
    expect(j.arrivees.map((a) => a.heure)).toEqual(["08:00", "10:00"]);
  });

  it("une heure absente ne casse rien : la ligne passe en dernier", () => {
    const sansHeure = ligne({
      id: "a3",
      reservation: { ...ligne({ id: "x" }).reservation!, heure_arrivee: null },
    });
    const j = calculerJournee(entree({ arrivees: [sansHeure, ligne({ id: "a1" })] }));
    expect(j.arrivees.map((a) => a.heure)).toEqual(["08:30", "—"]);
  });

  it("« 1re fois » quand le chien n'est jamais venu", () => {
    const jamais = calculerJournee(entree({ arrivees: [ligne({ id: "a1" })] }));
    expect(jamais.arrivees[0].premiereFois).toBe(true);

    const deja = calculerJournee(entree({
      arrivees: [ligne({ id: "a1" })], chiensDejaVenus: ["d1"],
    }));
    expect(deja.arrivees[0].premiereFois).toBe(false);
  });

  it("« journée d'essai » quand c'en est une", () => {
    const essai = ligne({
      id: "a1",
      reservation: { ...ligne({ id: "x" }).reservation!, type_reservation: "essai" },
    });
    expect(calculerJournee(entree({ arrivees: [essai] })).arrivees[0].essai).toBe(true);
    expect(calculerJournee(entree({ arrivees: [ligne({ id: "a1" })] })).arrivees[0].essai).toBe(false);
  });

  it("une arrivée ne porte jamais de signal de départ", () => {
    const j = calculerJournee(entree({
      arrivees: [ligne({ id: "a1" })],
      colisParClient: { c1: 2 },
    }));
    expect(j.arrivees[0].signaux).toEqual({ colis: 0, resteAEncaisser: null, resultatEssai: false });
  });
});

describe("les départs et leurs signaux d'oubli", () => {
  const impaye = () => ligne({
    id: "p1", statut: "arrive",
    reservation: { ...ligne({ id: "x" }).reservation!, montant_paye: 45 },
  });

  it("le colis qui attend son maître", () => {
    const j = calculerJournee(entree({ departs: [impaye()], colisParClient: { c1: 2 } }));
    expect(j.departs[0].signaux.colis).toBe(2);
  });

  it("le reste à encaisser, avec son montant", () => {
    const j = calculerJournee(entree({ departs: [impaye()] }));
    expect(j.departs[0].signaux.resteAEncaisser).toBe(75);
  });

  it("mais pas à qui n'a pas le droit d'encaisser", () => {
    const j = calculerJournee(entree({ departs: [impaye()], droits: COMPTOIR }));
    expect(j.departs[0].signaux.resteAEncaisser).toBeNull();
  });

  it("rien à encaisser sur un séjour offert, ni sur un séjour annulé", () => {
    const base = ligne({ id: "x" }).reservation!;
    expect(resteDu({ ...base, montant_paye: 0, offerte: true })).toBe(0);
    expect(resteDu({ ...base, montant_paye: 0, statut: "annulee" })).toBe(0);
    expect(resteDu({ ...base, montant_paye: 0 })).toBe(120);
  });

  it("un solde de quelques centimes ne déclenche pas de faux signal", () => {
    const base = ligne({ id: "x" }).reservation!;
    expect(resteDu({ ...base, montant_final: 120, montant_paye: 119.999 })).toBe(0);
  });

  it("le résultat d'essai à saisir : l'essai a eu lieu, le chien est encore « programme »", () => {
    const essai = ligne({
      id: "p1", statut: "arrive",
      reservation: { ...ligne({ id: "x" }).reservation!, type_reservation: "essai" },
      chien: { id: "d1", nom: "Rex", statut_essai: "programme" },
    });
    expect(resultatEssaiASaisir(essai)).toBe(true);

    const conclu = { ...essai, chien: { id: "d1", nom: "Rex", statut_essai: "valide" } };
    expect(resultatEssaiASaisir(conclu)).toBe(false);

    // Un séjour ordinaire n'a jamais de résultat d'essai à saisir.
    expect(resultatEssaiASaisir(ligne({ id: "p2" }))).toBe(false);
  });

  it("les trois signaux peuvent tomber sur la même ligne", () => {
    const tout = ligne({
      id: "p1", statut: "arrive",
      reservation: {
        ...ligne({ id: "x" }).reservation!,
        type_reservation: "essai", montant_paye: 0,
      },
      chien: { id: "d1", nom: "Rex", statut_essai: "programme" },
    });
    const j = calculerJournee(entree({ departs: [tout], colisParClient: { c1: 1 } }));
    expect(j.departs[0].signaux).toEqual({
      colis: 1, resteAEncaisser: 120, resultatEssai: true,
    });
  });
});

describe("à ne pas oublier", () => {
  it("les adhésions qui arrivent à terme dans la semaine", () => {
    const r = rappelsDeLaSemaine(entree({
      adhesions: [
        { id: "ad1", date_fin: decalerJours(JOUR, 3), client: { id: "c1", prenom: "Marie", nom: "Dupont" } },
        // Trop loin : elle attendra.
        { id: "ad2", date_fin: decalerJours(JOUR, 20), client: null },
      ],
    }));
    expect(r.map((x) => x.cle)).toEqual(["adhesion-ad1"]);
    expect(r[0].libelle).toBe("Adhésion de Marie Dupont");
    expect(r[0].urgent).toBe(false);
  });

  it("une adhésion déjà échue passe devant, et le dit", () => {
    const r = rappelsDeLaSemaine(entree({
      adhesions: [
        { id: "ad1", date_fin: decalerJours(JOUR, 3), client: null },
        { id: "ad2", date_fin: decalerJours(JOUR, -5), client: null },
      ],
    }));
    expect(r[0].cle).toBe("adhesion-ad2");
    expect(r[0].urgent).toBe(true);
    expect(r[0].detail).toContain("échue depuis");
  });

  it("les commandes promises et pas encore commencées — « à faire » seulement", () => {
    const r = rappelsDeLaSemaine(entree({
      commandes: [
        { id: "k1", numero: "CMD-1", date_promise: decalerJours(JOUR, 2), statut: "a_faire", client: null },
        // Commencée : elle n'est plus un oubli.
        { id: "k2", numero: "CMD-2", date_promise: decalerJours(JOUR, 2), statut: "en_cours", client: null },
      ],
    }));
    expect(r.map((x) => x.cle)).toEqual(["commande-k1"]);
    expect(r[0].href).toBe("/boutique/commandes");
  });

  it("sans la boutique, aucune commande n'est rappelée", () => {
    const r = rappelsDeLaSemaine(entree({
      droits: { isAdmin: false, perm_encaissements: true, perm_boutique_vente: false },
      commandes: [{ id: "k1", numero: "CMD-1", date_promise: JOUR, statut: "a_faire", client: null }],
    }));
    expect(r).toEqual([]);
  });

  it("les échéances comptables ne concernent QUE l'administratrice", () => {
    const donnees = {
      depensesSansJustificatif: [
        { id: "d1", numero: "DEP-1", libelle: "Sangle", date_depense: JOUR, montant: 42 },
      ],
      facturesEnRetard: [
        { id: "f1", numero: "FAC-1", date_echeance: decalerJours(JOUR, -10), montant_restant: 200, client: null },
      ],
    };

    const admin = rappelsDeLaSemaine(entree(donnees));
    expect(admin.map((x) => x.categorie).sort()).toEqual(["depense", "facture"]);

    // Une employée, même complète, ne les voit pas — et ils ne sont pas lus.
    const employee = rappelsDeLaSemaine(entree({
      ...donnees,
      droits: { isAdmin: false, perm_encaissements: true, perm_boutique_vente: true },
    }));
    expect(employee).toEqual([]);
  });

  it("chaque rappel mène à l'écran concerné", () => {
    const r = rappelsDeLaSemaine(entree({
      adhesions: [{ id: "ad1", date_fin: JOUR, client: null }],
      commandes: [{ id: "k1", numero: "CMD-1", date_promise: JOUR, statut: "a_faire", client: null }],
      depensesSansJustificatif: [{ id: "d1", numero: "DEP-1", libelle: "x", date_depense: JOUR, montant: 1 }],
      facturesEnRetard: [{ id: "f1", numero: "FAC-1", date_echeance: JOUR, montant_restant: 1, client: null }],
    }));
    const href = Object.fromEntries(r.map((x) => [x.categorie, x.href]));
    expect(href).toEqual({
      adhesion: "/adhesions",
      commande: "/boutique/commandes",
      depense: "/comptabilite/depenses/d1",
      facture: "/factures/f1",
    });
  });

  it("les clés sont uniques : deux rappels ne se confondent jamais", () => {
    const r = rappelsDeLaSemaine(entree({
      adhesions: [
        { id: "a", date_fin: JOUR, client: null },
        { id: "b", date_fin: JOUR, client: null },
      ],
      depensesSansJustificatif: [
        { id: "a", numero: null, libelle: null, date_depense: JOUR, montant: null },
      ],
    }));
    expect(new Set(r.map((x) => x.cle)).size).toBe(r.length);
  });
});

describe("le cas vide", () => {
  it("rend trois listes vides, et la date en clair", () => {
    const j = calculerJournee(entree());
    expect(j.arrivees).toEqual([]);
    expect(j.departs).toEqual([]);
    expect(j.rappels).toEqual([]);
    expect(j.jourISO).toBe(JOUR);
    expect(j.dateEnClair).toMatch(/2026/);
  });
});

describe("les outils de date", () => {
  it("décale sans se laisser piéger par un changement de mois ou d'heure d'été", () => {
    expect(decalerJours("2026-09-08", 7)).toBe("2026-09-15");
    expect(decalerJours("2026-09-28", 7)).toBe("2026-10-05");
    expect(decalerJours("2026-10-25", 1)).toBe("2026-10-26");
    expect(decalerJours("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("lit le jour d'un horodatage sans passer par le fuseau", () => {
    expect(jourDe("2026-09-08T23:30:00+02:00")).toBe("2026-09-08");
    expect(jourDe(null)).toBe("");
  });
});
