import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * APP 74 — « mon chien seul dans un box » à la réservation.
 *
 * UNE règle (`estPrivatifReservation`) : la case de la réservation OU le profil
 * des chiens. Le prix, la carte, la place dans un box et la facture la lisent
 * tous. On prouve ici chacun de ces lecteurs, avec les vraies fonctions ; seule
 * la base est doublée.
 */

const H = vi.hoisted(() => ({
  chiens: [] as Record<string, unknown>[],
  occupations: [] as Record<string, unknown>[],
  boxes: [] as Record<string, unknown>[],
  ententes: [] as { chien_id: string; chien_cible_id: string; type: string }[],
  cohabitation: [] as Record<string, unknown>[],
  resa: null as Record<string, unknown> | null,
  liens: [] as Record<string, unknown>[],
}));

vi.mock("server-only", () => ({}));
// email.ts crée son client à l'import : aucun envoi n'a lieu ici.
vi.mock("resend", () => ({
  Resend: class { emails = { send: async () => ({ data: { id: "re_test" }, error: null }) }; },
}));
vi.mock("@/src/lib/supabase-admin", () => {
  function from(table: string) {
    const eq: Record<string, unknown> = {};
    const dans: Record<string, unknown[]> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      lte: () => chain,
      gte: () => chain,
      order: () => chain,
      eq: (c: string, v: unknown) => { eq[c] = v; return chain; },
      in: (c: string, v: unknown[]) => { dans[c] = v; return chain; },
      maybeSingle: () => Promise.resolve({ data: table === "reservations" ? H.resa : null, error: null }),
      then: (ok: (v: unknown) => unknown) => {
        let data: unknown[] = [];
        if (table === "chiens") data = H.chiens.filter((c) => !dans.id || dans.id.includes(c.id));
        if (table === "occupation_boxes") data = H.occupations;
        if (table === "boxes") data = H.boxes;
        if (table === "ententes_chiens") {
          data = H.ententes.filter((e) =>
            (!eq.type || e.type === eq.type)
            && (!dans.chien_id || dans.chien_id.includes(e.chien_id))
            && (!dans.chien_cible_id || dans.chien_cible_id.includes(e.chien_cible_id)));
        }
        if (table === "reservation_chiens") data = H.liens;
        return Promise.resolve({ data, error: null }).then(ok);
      },
    };
    return chain;
  }
  return { supabaseAdmin: { from } };
});
vi.mock("@/src/lib/horairesServeur", async () => {
  const { HORAIRES_DEFAUT } = await import("@/src/lib/horaires");
  return { lireHoraires: async () => HORAIRES_DEFAUT };
});
vi.mock("@/src/lib/cohabitationDb", () => ({ lireCohabitationChiens: async () => H.cohabitation }));

import {
  estPrivatifReservation,
  boxSeulProposable,
  boxSeulRetenu,
} from "@/src/lib/cohabitation";
import { calculerMontant } from "@/src/lib/calculTarif";
import { categorieCarteJournee } from "@/src/lib/abonnementsTypes";
import { aideBoxSeul, prixBoxSeul } from "@/src/lib/boxSeul";
import { ligneBoxSeulEmail, MENTION_BOX_SEUL_EMAIL } from "@/src/lib/email";

const { suggererBox, datesCompletesPourChiens } = await import("@/src/lib/suggestionBox");
const { categorieCartePourChiens } = await import("@/src/lib/carteReservation");
const { lignesDepuisReservation } = await import("@/src/lib/factureResa");

const SOCIABLE = { id: "a", client_id: "c1", doit_etre_isole: false };
const ISOLE = { id: "i", client_id: "c1", doit_etre_isole: true };

// Les tarifs de 2026, tels qu'en base.
const TARIFS = [
  { categorie: "journee_partage_1", membre: true, prix: "35" },
  { categorie: "journee_partage_2", membre: true, prix: "68" },
  { categorie: "journee_privatif", membre: true, prix: "70" },
  { categorie: "sejour_partage_1", membre: true, prix: "45" },
  { categorie: "sejour_partage_2", membre: true, prix: "88" },
  { categorie: "sejour_privatif", membre: true, prix: "90" },
];

describe("la règle unique", () => {
  it("sociable, sans la case → partage", () => {
    expect(estPrivatifReservation({ box_seul: false, selection: [SOCIABLE] })).toBe(false);
  });
  it("sociable, avec la case → box entier", () => {
    expect(estPrivatifReservation({ box_seul: true, selection: [SOCIABLE] })).toBe(true);
  });
  it("isolé, sans la case → box entier (le profil suffit)", () => {
    expect(estPrivatifReservation({ box_seul: false, selection: [ISOLE] })).toBe(true);
  });
  it("isolé, avec la case → box entier", () => {
    expect(estPrivatifReservation({ box_seul: true, selection: [ISOLE] })).toBe(true);
  });
});

describe("où la case se propose", () => {
  it("un chien sociable : oui ; isolé, deux chiens, journée d'essai : non", () => {
    expect(boxSeulProposable({ type_reservation: "journee", selection: [SOCIABLE] })).toBe(true);
    expect(boxSeulProposable({ type_reservation: "sejour", selection: [SOCIABLE] })).toBe(true);
    expect(boxSeulProposable({ type_reservation: "journee", selection: [ISOLE] })).toBe(false);
    expect(boxSeulProposable({ type_reservation: "journee", selection: [SOCIABLE, { ...SOCIABLE, id: "b" }] })).toBe(false);
    expect(boxSeulProposable({ type_reservation: "essai", selection: [SOCIABLE] })).toBe(false);
  });

  it("le serveur ne croit pas le navigateur : une case envoyée pour deux chiens ne s'écrit pas", () => {
    expect(boxSeulRetenu({ demande: true, type_reservation: "journee", selection: [SOCIABLE] })).toBe(true);
    expect(boxSeulRetenu({ demande: "on", type_reservation: "journee", selection: [SOCIABLE] })).toBe(true);
    expect(boxSeulRetenu({ demande: true, type_reservation: "journee", selection: [SOCIABLE, { ...SOCIABLE, id: "b" }] })).toBe(false);
    expect(boxSeulRetenu({ demande: true, type_reservation: "essai", selection: [SOCIABLE] })).toBe(false);
    expect(boxSeulRetenu({ demande: undefined, type_reservation: "journee", selection: [SOCIABLE] })).toBe(false);
  });
});

describe("le prix suit la case", () => {
  const prix = (box_seul: boolean, p: { type: string; debut: string; fin: string; arr?: string; dep?: string }) =>
    calculerMontant({
      tarifs: TARIFS, type_reservation: p.type, nb_chiens: 1, est_membre: true, est_urgence: false,
      est_privatif: estPrivatifReservation({ box_seul, selection: [SOCIABLE] }),
      date_debut: p.debut, date_fin: p.fin, heure_arrivee: p.arr ?? null, heure_depart: p.dep ?? null,
    });

  it("garderie : 70.– avec la case, 35.– sans", () => {
    const j = { type: "journee", debut: "2026-11-10", fin: "2026-11-10" };
    expect(prix(true, j)).toBe(70);
    expect(prix(false, j)).toBe(35);
  });

  it("une nuit : 90.– avec la case, 45.– sans", () => {
    const n = { type: "sejour", debut: "2026-11-10", fin: "2026-11-11", arr: "17:00", dep: "10:00" };
    expect(prix(true, n)).toBe(90);
    expect(prix(false, n)).toBe(45);
  });

  it("la journée supplémentaire d'un séjour se paie AUSSI au tarif seul", () => {
    // Arrivée le matin, départ le soir : deux nuits + une garde à la journée.
    const s = { type: "sejour", debut: "2026-11-10", fin: "2026-11-12", arr: "09:00", dep: "18:00" };
    expect(prix(true, s)).toBe(2 * 90 + 70);
    expect(prix(false, s)).toBe(2 * 45 + 35);
  });

  it("l'aide du tunnel annonce les prix lus dans les tarifs", () => {
    expect(prixBoxSeul(TARIFS)).toEqual({ journee: 70, nuit: 90 });
    expect(aideBoxSeul(prixBoxSeul(TARIFS))).toBe(
      "Votre chien ne partage pas son box. Tarif chien seul : 70.– la journée, 90.– la nuit.");
    // Sans tarif, pas de « 0.– ».
    expect(aideBoxSeul(prixBoxSeul([]))).toBe("Votre chien ne partage pas son box.");
  });
});

describe("la carte suit la case", () => {
  beforeEach(() => { H.cohabitation = [SOCIABLE]; });

  it("avec la case : « 1 chien seul » ; sans : « 1 chien sociable », comme avant", async () => {
    expect(await categorieCartePourChiens(["a"], true)).toBe("journee_privatif");
    expect(await categorieCartePourChiens(["a"], false)).toBe("journee_partage_1");
    expect(await categorieCartePourChiens(["a"])).toBe("journee_partage_1");
  });

  it("la catégorie de carte d'une journée box seul n'est jamais celle d'un chien sociable", () => {
    const est_privatif = estPrivatifReservation({ box_seul: true, selection: [SOCIABLE] });
    expect(categorieCarteJournee({ nb_chiens: 1, est_privatif })).not.toBe("journee_partage_1");
  });
});

describe("les e-mails disent « box seul »", () => {
  it("une ligne dans le récapitulatif, seulement si la case est cochée", () => {
    expect(ligneBoxSeulEmail(true)).toContain(MENTION_BOX_SEUL_EMAIL);
    expect(MENTION_BOX_SEUL_EMAIL).toContain("Box seul");
    expect(ligneBoxSeulEmail(false)).toBe("");
    expect(ligneBoxSeulEmail(null)).toBe("");
  });
});

describe("la place : un box_seul prend un box ENTIER", () => {
  const JOUR = "2026-11-11";
  // Un seul box, avec de la place pour deux chiens.
  const UN_BOX = [{ id: "B1", numero: 1, nom: null, capacite_standard: 2, capacite_petits_chiens: null, interne: false }];
  const occupe = (box_seul: boolean) => ({
    box_id: "B1", chien_id: "x", date_debut: "2026-11-10", date_fin: "2026-11-12",
    reservations: { heure_arrivee: "09:00", heure_depart: "18:00", type_reservation: "sejour", box_seul },
    chiens: { doit_etre_isole: false, client_id: "autre", categorie_poids: "15_30kg" },
  });

  beforeEach(() => {
    H.boxes = UN_BOX;
    // Le chien à placer : sociable, d'un autre client, AMI du chien déjà là —
    // sans la règle box_seul, c'est exactement le box qu'on lui proposerait.
    H.chiens = [{ id: "y", doit_etre_isole: false, client_id: "moi", categorie_poids: "15_30kg" }];
    H.ententes = [{ chien_id: "y", chien_cible_id: "x", type: "ok" }];
  });

  const suggerer = (box_seul: boolean) => suggererBox({
    chien_ids: ["y"], date_debut: JOUR, date_fin: JOUR,
    heure_arrivee: "09:00", heure_depart: "18:00", type_reservation: "journee", box_seul,
  });

  it("témoin : deux chiens sociables amis partagent le box", async () => {
    H.occupations = [occupe(false)];
    expect((await suggerer(false)).box_id).toBe("B1");
    expect(await datesCompletesPourChiens({ chien_ids: ["y"], debut: JOUR, fin: JOUR })).toEqual([]);
  });

  it("le chien à placer a la case : le box occupé ne lui est PAS proposé", async () => {
    H.occupations = [occupe(false)];
    expect((await suggerer(true)).box_id).toBeNull();
    expect(await datesCompletesPourChiens({ chien_ids: ["y"], debut: JOUR, fin: JOUR, box_seul: true }))
      .toEqual([JOUR]);
  });

  it("le chien déjà là a la case : personne ne le rejoint", async () => {
    H.occupations = [occupe(true)];
    expect((await suggerer(false)).box_id).toBeNull();
    expect(await datesCompletesPourChiens({ chien_ids: ["y"], debut: JOUR, fin: JOUR })).toEqual([JOUR]);
  });

  it("avec la case, un box VIDE lui est proposé", async () => {
    H.occupations = [occupe(false)];
    H.boxes = [...UN_BOX, { id: "B2", numero: 2, nom: null, capacite_standard: 2, capacite_petits_chiens: null, interne: false }];
    expect((await suggerer(true)).box_id).toBe("B2");
  });
});

describe("la facture dit « chien seul en box »", () => {
  beforeEach(() => {
    H.liens = [{ id: "l1", chien_id: "a" }];
    H.cohabitation = [SOCIABLE];
  });
  const resa = (box_seul: boolean, type_reservation = "journee") => ({
    id: "R1", client_id: "c1", type_reservation, date_debut: "2026-11-10",
    date_fin: type_reservation === "sejour" ? "2026-11-12" : "2026-11-10",
    montant_calcule: 70, montant_final: null, ajustement_manuel: 0, montant_paye: 0, box_seul,
  });

  it("garderie avec la case", async () => {
    H.resa = resa(true);
    const [ligne] = await lignesDepuisReservation("R1");
    expect(ligne.libelle).toBe("Garderie du 10.11.2026 — chien seul en box");
  });

  it("séjour avec la case", async () => {
    H.resa = resa(true, "sejour");
    const [ligne] = await lignesDepuisReservation("R1");
    expect(ligne.libelle).toBe("Séjour du 10.11.2026 au 12.11.2026 — chien seul en box");
  });

  it("sans la case, le libellé d'avant", async () => {
    H.resa = resa(false);
    const [ligne] = await lignesDepuisReservation("R1");
    expect(ligne.libelle).toBe("Garderie du 10.11.2026 — 1 chien");
  });
});

describe("le filet en base, relu dans la migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "20261003190423_app74_reservation_box_seul.sql"), "utf8");
  const corps = sql.slice(sql.indexOf("create or replace function public.bloquer_surbooking_box"));

  it("la colonne existe, fausse par défaut", () => {
    expect(sql).toMatch(/add column if not exists box_seul boolean not null default false/i);
  });

  it("box_seul ET « doit être isolé » comptent, des DEUX côtés", () => {
    expect(corps).toMatch(/coalesce\(r\.box_seul, false\)/);
    expect(corps).toMatch(/coalesce\(r2\.box_seul, false\)/);
    expect(corps).toMatch(/c\.doit_etre_isole = true/);
    expect(corps).toMatch(/c2\.doit_etre_isole = true/);
  });

  it("le passage de relais le même jour reste permis (chevauchement strict)", () => {
    expect(corps).toMatch(/greatest\(o\.date_debut, new\.date_debut\) < least\(o\.date_fin, new\.date_fin\)/);
  });

  it("la fonction naît fermée", () => {
    expect(sql).toMatch(/revoke execute on function public\.bloquer_surbooking_box\(\) from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.bloquer_surbooking_box\(\) to service_role/i);
  });
});
