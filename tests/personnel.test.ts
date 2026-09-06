import { describe, it, expect } from "vitest";
import {
  boxPourPersonnel,
  champsReservationPersonnel,
  reservationPersonnelSansFacturation,
  typeAutorisePourPersonnel,
  MESSAGE_AUCUN_BOX,
  type BoxInterne,
} from "../src/lib/personnel";

// Fiches internes
const SABRINA = "cli-sabrina";
const EMPLOYEE = "cli-employee";
const AUTRE = "cli-autre";

// Box (triés par numéro, comme les fournit l'appelant)
const BOX_PENSION: BoxInterne = { id: "box-belle", proprietaire_client_id: null };
const BOX_SABRINA: BoxInterne = { id: "box-sabrina", proprietaire_client_id: SABRINA };
const BOX_AUTRE: BoxInterne = { id: "box-autre", proprietaire_client_id: AUTRE };

describe("boxPourPersonnel — fiche avec box attitré", () => {
  it("ses chiens vont dans SON box, même si elle travaille", () => {
    const d = boxPourPersonnel({
      ficheClientId: SABRINA,
      boxesInternes: [BOX_PENSION, BOX_SABRINA, BOX_AUTRE],
      proprietairesPresents: [SABRINA, AUTRE],
      boxClientDisponible: "box-client-1",
    });
    expect(d).toEqual({ box_id: "box-sabrina", origine: "box_attitre", interne: true });
  });

  it("son box prime sur un box client libre", () => {
    const d = boxPourPersonnel({
      ficheClientId: SABRINA,
      boxesInternes: [BOX_SABRINA],
      proprietairesPresents: [],
      boxClientDisponible: "box-client-1",
    });
    expect(d).toMatchObject({ box_id: "box-sabrina", interne: true });
  });
});

describe("boxPourPersonnel — employée sans box attitré", () => {
  it("l'admin est ABSENT ce jour-là : ses chiens prennent le box de l'admin", () => {
    const d = boxPourPersonnel({
      ficheClientId: EMPLOYEE,
      boxesInternes: [BOX_PENSION, BOX_SABRINA],
      proprietairesPresents: [], // personne ne travaille
      boxClientDisponible: "box-client-1",
    });
    expect(d).toEqual({ box_id: "box-sabrina", origine: "box_interne_absent", interne: true });
  });

  it("l'admin est PRÉSENT ce jour-là : repli sur un box client", () => {
    const d = boxPourPersonnel({
      ficheClientId: EMPLOYEE,
      boxesInternes: [BOX_PENSION, BOX_SABRINA],
      proprietairesPresents: [SABRINA],
      boxClientDisponible: "box-client-1",
    });
    expect(d).toEqual({ box_id: "box-client-1", origine: "box_client", interne: false });
  });

  it("plusieurs collègues absents : le premier box de la liste (ordre des numéros)", () => {
    const d = boxPourPersonnel({
      ficheClientId: EMPLOYEE,
      boxesInternes: [BOX_SABRINA, BOX_AUTRE],
      proprietairesPresents: [],
      boxClientDisponible: null,
    });
    expect(d).toMatchObject({ box_id: "box-sabrina" });
  });

  it("tous les collègues présents et aucun box client : refus, jamais de surbooking", () => {
    const d = boxPourPersonnel({
      ficheClientId: EMPLOYEE,
      boxesInternes: [BOX_PENSION, BOX_SABRINA, BOX_AUTRE],
      proprietairesPresents: [SABRINA, AUTRE],
      boxClientDisponible: null,
    });
    expect(d).toEqual({ box_id: null, origine: null, message: MESSAGE_AUCUN_BOX });
    expect(MESSAGE_AUCUN_BOX).toContain("Aucun box disponible");
  });
});

describe("boxPourPersonnel — box de la pension", () => {
  it("le box sans propriétaire n'est JAMAIS attribué automatiquement", () => {
    const d = boxPourPersonnel({
      ficheClientId: EMPLOYEE,
      boxesInternes: [BOX_PENSION],
      proprietairesPresents: [],
      boxClientDisponible: null,
    });
    expect(d.box_id).toBeNull();
  });

  it("même quand un box client existe, la pension reste intouchée", () => {
    const d = boxPourPersonnel({
      ficheClientId: EMPLOYEE,
      boxesInternes: [BOX_PENSION],
      proprietairesPresents: [],
      boxClientDisponible: "box-client-1",
    });
    expect(d).toMatchObject({ box_id: "box-client-1", origine: "box_client" });
  });
});

describe("boxPourPersonnel — aucun box interne configuré", () => {
  it("comportement identique à aujourd'hui : on prend le box client suggéré", () => {
    const d = boxPourPersonnel({
      ficheClientId: EMPLOYEE,
      boxesInternes: [],
      proprietairesPresents: [],
      boxClientDisponible: "box-client-1",
    });
    expect(d).toEqual({ box_id: "box-client-1", origine: "box_client", interne: false });
  });

  it("et un refus clair si la pension est pleine", () => {
    const d = boxPourPersonnel({
      ficheClientId: EMPLOYEE,
      boxesInternes: [],
      proprietairesPresents: [],
      boxClientDisponible: null,
    });
    expect(d.box_id).toBeNull();
  });
});

describe("boxPourPersonnel — accepte un Set comme une liste", () => {
  it("Set et tableau donnent le même résultat", () => {
    const args = {
      ficheClientId: EMPLOYEE,
      boxesInternes: [BOX_SABRINA],
      boxClientDisponible: "box-client-1",
    };
    const avecSet = boxPourPersonnel({ ...args, proprietairesPresents: new Set([SABRINA]) });
    const avecTableau = boxPourPersonnel({ ...args, proprietairesPresents: [SABRINA] });
    expect(avecSet).toEqual(avecTableau);
  });
});

describe("règle « fiche interne ⇒ validee, montant 0, pas de facture »", () => {
  it("les champs posés sur la réservation", () => {
    expect(champsReservationPersonnel()).toEqual({
      statut: "validee",
      montant_calcule: 0,
      montant_final: 0,
      statut_paiement: "paye",
      montant_paye: 0,
    });
  });

  it("une fiche interne : ni facture, ni adhésion, ni e-mail", () => {
    expect(reservationPersonnelSansFacturation(true)).toEqual({
      creerFacture: false,
      bundlerAdhesion: false,
      envoyerEmail: false,
    });
  });

  it("une fiche cliente : rien ne change", () => {
    expect(reservationPersonnelSansFacturation(false)).toEqual({
      creerFacture: true,
      bundlerAdhesion: true,
      envoyerEmail: true,
    });
  });

  it("journée et séjour seulement — jamais de journée d'essai", () => {
    expect(typeAutorisePourPersonnel("journee")).toBe(true);
    expect(typeAutorisePourPersonnel("sejour")).toBe(true);
    expect(typeAutorisePourPersonnel("essai")).toBe(false);
  });
});
