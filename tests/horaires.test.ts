import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CLES_HORAIRES,
  HORAIRES_DEFAUT,
  bornes,
  creneauTexte,
  creneauxProposes,
  formatHoraire,
  formatHoraireCourt,
  formatHoraireTiret,
  heureCourte,
  heureDansPlage,
  heureLongue,
  horairesDepuisReglages,
  lireCreneaux,
  refusHoraire,
} from "@/src/lib/horaires";
import { messageAdhesionRequise, MESSAGE_ADHESION_REQUISE } from "@/src/lib/membre";

/**
 * APP 59 — les horaires d'accueil deviennent un réglage.
 *
 * ── LE RISQUE DU LOT ──────────────────────────────────────────────────────
 *
 * Les heures vivaient en dur à sept endroits : deux encadrés d'e-mail, trois
 * avertissements du personnel, les créneaux proposés au client, les bornes de
 * la journée du personnel. Les rassembler sous un réglage ne vaut que si, le
 * jour du déploiement, RIEN ne bouge. Les premiers tests comparent donc les
 * textes rendus à ceux d'hier, au caractère près.
 *
 * ── LA RÈGLE ET LE TEXTE ──────────────────────────────────────────────────
 *
 * Le second risque était moins visible : l'avertissement du personnel écrivait
 * ses bornes DEUX FOIS — une fois dans la comparaison, une fois dans la phrase.
 * On pouvait donc lire « arrivée 7h35–10h00 » sur un refus déclenché par
 * d'autres heures. Les deux sortent maintenant du même réglage.
 */

// ── Les valeurs de départ ─────────────────────────────────────────────────

describe("avec les valeurs de départ, RIEN ne change", () => {
  it("les cinq réglages sont ceux d’hier", () => {
    expect(HORAIRES_DEFAUT).toEqual({
      journeeArrivee: "07:35-10:00",
      journeeDepart: "17:00-18:00",
      sejour: "09:00-10:00 ; 17:00-18:00",
      essaiArrivee: "10:00",
      essaiDepart: "17:00-18:00",
    });
  });

  it("les encadrés d’e-mail, mot pour mot", () => {
    expect(formatHoraire(HORAIRES_DEFAUT.journeeArrivee)).toBe("7h35 – 10h00");
    expect(formatHoraire(HORAIRES_DEFAUT.journeeDepart)).toBe("17h00 – 18h00");
    expect(formatHoraire(HORAIRES_DEFAUT.sejour)).toBe("9h00 – 10h00 ou 17h00 – 18h00");
  });

  it("les avertissements du personnel, mot pour mot", () => {
    expect(formatHoraireTiret(HORAIRES_DEFAUT.journeeArrivee)).toBe("7h35–10h00");
    expect(formatHoraireTiret(HORAIRES_DEFAUT.journeeDepart)).toBe("17h00–18h00");
    expect(formatHoraireTiret(HORAIRES_DEFAUT.essaiArrivee)).toBe("10h00");
    expect(formatHoraireTiret(HORAIRES_DEFAUT.sejour)).toBe("9h00–10h00 ou 17h00–18h00");
  });

  it("LES CRÉNEAUX PROPOSÉS AU CLIENT, liste pour liste", () => {
    /**
     * Le piège du lot : la garderie ouvre à 7h35, et la liste d'hier était
     * 07:35 puis 07:45, 08:00, 08:15… Avancer bêtement de quinze minutes aurait
     * donné 07:50, 08:05, 08:20 — une liste que personne n'a jamais vue, et des
     * heures d'arrivée bancales sur chaque bon d'accueil.
     */
    expect(creneauxProposes(HORAIRES_DEFAUT.journeeArrivee)).toEqual([
      "07:35", "07:45", "08:00", "08:15", "08:30", "08:45",
      "09:00", "09:15", "09:30", "09:45", "10:00",
    ]);
    expect(creneauxProposes(creneauTexte(HORAIRES_DEFAUT.sejour, 0))).toEqual([
      "09:00", "09:15", "09:30", "09:45", "10:00",
    ]);
    expect(creneauxProposes(HORAIRES_DEFAUT.journeeDepart)).toEqual([
      "17:00", "17:15", "17:30", "17:45", "18:00",
    ]);
    expect(creneauxProposes(HORAIRES_DEFAUT.sejour)).toEqual([
      "09:00", "09:15", "09:30", "09:45", "10:00",
      "17:00", "17:15", "17:30", "17:45", "18:00",
    ]);
  });

  it("les mentions courtes du tunnel", () => {
    expect(formatHoraireCourt(HORAIRES_DEFAUT.journeeArrivee)).toBe("7h35–10h");
    expect(formatHoraireCourt(creneauTexte(HORAIRES_DEFAUT.sejour, 0))).toBe("9h–10h");
    expect(formatHoraireCourt(HORAIRES_DEFAUT.essaiDepart)).toBe("17h–18h");
    expect(formatHoraire(HORAIRES_DEFAUT.essaiArrivee)).toBe("10h00");
  });

  it("les bornes de la journée du personnel", () => {
    expect(bornes(HORAIRES_DEFAUT.journeeArrivee)?.debut).toBe("07:35");
    expect(bornes(HORAIRES_DEFAUT.journeeDepart)?.fin).toBe("18:00");
  });
});

// ── Changer le réglage change tout ────────────────────────────────────────

describe("un horaire modifié se voit PARTOUT", () => {
  const AUTRE = "08:00-09:30 ; 16:00-17:30";

  it("les trois formats suivent", () => {
    expect(formatHoraire(AUTRE)).toBe("8h00 – 9h30 ou 16h00 – 17h30");
    expect(formatHoraireTiret(AUTRE)).toBe("8h00–9h30 ou 16h00–17h30");
    expect(formatHoraireCourt(AUTRE)).toBe("8h–17h30");
  });

  it("les créneaux proposés suivent", () => {
    expect(creneauxProposes("08:00-09:00")).toEqual(["08:00", "08:15", "08:30", "08:45", "09:00"]);
  });

  it("et la règle de l’avertissement suit, elle aussi", () => {
    // C'est le cœur : la phrase et la comparaison sortent du même réglage.
    expect(heureDansPlage("07:35", AUTRE)).toBe(false);
    expect(heureDansPlage("08:00", AUTRE)).toBe(true);
    expect(heureDansPlage("17:30", AUTRE)).toBe(true);
  });
});

// ── La lecture et la validation ───────────────────────────────────────────

describe("lire un réglage", () => {
  it("une plage, deux plages, une heure seule", () => {
    expect(lireCreneaux("07:35-10:00")).toEqual([{ debut: "07:35", fin: "10:00" }]);
    expect(lireCreneaux("09:00-10:00 ; 17:00-18:00")).toEqual([
      { debut: "09:00", fin: "10:00" }, { debut: "17:00", fin: "18:00" },
    ]);
    expect(lireCreneaux("10:00")).toEqual([{ debut: "10:00", fin: "10:00" }]);
  });

  it("les espaces autour du « ; » et du « - » ne comptent pas", () => {
    expect(lireCreneaux("09:00 - 10:00;17:00-18:00")).toHaveLength(2);
  });

  it("ce qui n’est pas lisible rend null", () => {
    for (const mauvais of ["", "   ", "7h35-10h", "25:00-26:00", "09:00-", "abc", "10:00-09:00", "09:00-09:00"]) {
      expect(lireCreneaux(mauvais), mauvais).toBeNull();
    }
  });

  it("le refus, avec sa phrase", () => {
    expect(refusHoraire("07:35-10:00")).toBeNull();
    expect(refusHoraire("")).toBe("Indiquez au moins un créneau.");
    expect(refusHoraire("10:00-09:00")).toContain("Le début doit précéder la fin.");
    expect(refusHoraire("7h35")).toContain("format HH:MM");
  });

  it("l’heure s’écrit en français, longue et courte", () => {
    expect(heureLongue("07:35")).toBe("7h35");
    expect(heureLongue("17:00")).toBe("17h00");
    expect(heureCourte("17:00")).toBe("17h");
    expect(heureCourte("07:35")).toBe("7h35");
  });
});

describe("un réglage manquant ou abîmé reprend la valeur de départ", () => {
  it("aucune clé : les horaires d’hier", () => {
    expect(horairesDepuisReglages(new Map())).toEqual(HORAIRES_DEFAUT);
  });

  it("une clé manquante : elle seule se replie", () => {
    const h = horairesDepuisReglages(new Map([[CLES_HORAIRES.journeeArrivee, "08:00-09:00"]]));
    expect(h.journeeArrivee).toBe("08:00-09:00");
    expect(h.sejour).toBe(HORAIRES_DEFAUT.sejour);
  });

  it("UNE CLÉ ILLISIBLE NE FERME PAS LA PENSION", () => {
    /**
     * Un horaire vide n'a pas de sens : on ne peut pas « effacer » une heure
     * d'ouverture, on la change. Contrairement à la signature (APP 58), le vide
     * se replie donc lui aussi.
     */
    for (const mauvais of ["", "n'importe quoi", "25:00-26:00"]) {
      const h = horairesDepuisReglages(new Map([[CLES_HORAIRES.sejour, mauvais]]));
      expect(h.sejour, mauvais).toBe(HORAIRES_DEFAUT.sejour);
    }
  });

  it("une heure hors plage sur un réglage abîmé n’alerte pas", () => {
    // `heureDansPlage` est une règle d'AVERTISSEMENT : un réglage cassé ne doit
    // pas faire pleuvoir des alertes sur des horaires parfaitement normaux.
    expect(heureDansPlage("03:00", "n'importe quoi")).toBe(true);
    expect(heureDansPlage("pas une heure", "07:35-10:00")).toBe(true);
  });
});

// ── L’e-mail rendu ────────────────────────────────────────────────────────

type LigneParam = { cle: string; valeur: string };

const H = vi.hoisted(() => ({ html: [] as string[], reglages: [] as LigneParam[] }));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (p: { html: string }) => { H.html.push(p.html); return { data: { id: "x" }, error: null }; },
    };
  },
}));

vi.mock("@/src/lib/supabase-admin", () => {
  function from(table: string) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      insert: () => Promise.resolve({ error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      in: () => ({
        then: <T,>(f: (v: { data: LigneParam[]; error: null }) => T) =>
          Promise.resolve({ data: table === "parametres" ? H.reglages : [], error: null }).then(f),
      }),
    };
    return chain;
  }
  return { supabaseAdmin: { from } };
});

vi.mock("@/src/lib/entiteJuridique", () => ({ entiteA: async () => ({}) }));
vi.mock("@/src/lib/entiteJuridiqueLogique", () => ({ raisonSocialeAffichee: () => "La Dogosphère Sàrl" }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import { envoyerEmailReservationValidee } from "@/src/lib/email";

async function rendre(): Promise<string> {
  H.html = [];
  await envoyerEmailReservationValidee({
    email: "client@exemple.ch", prenom: "Camille",
    date_debut: "2027-03-05", date_fin: "2027-03-09", type: "sejour",
  });
  expect(H.html).toHaveLength(1);
  return H.html[0];
}

beforeEach(() => {
  H.html = [];
  H.reglages = [];
});

describe("l’encadré d’horaires de l’e-mail", () => {
  it("sans réglage : IDENTIQUE à l’e-mail d’hier", async () => {
    const html = await rendre();
    expect(html).toContain(
      "Arrivée journée : 7h35 – 10h00<br/>\n          Départ journée : 17h00 – 18h00<br/>\n          Arrivée/départ séjour : 9h00 – 10h00 ou 17h00 – 18h00",
    );
  });

  it("réglage changé : l’e-mail le dit", async () => {
    H.reglages = [
      { cle: CLES_HORAIRES.journeeArrivee, valeur: "08:00-09:30" },
      { cle: CLES_HORAIRES.sejour, valeur: "08:00-09:00 ; 16:00-17:00" },
    ];
    const html = await rendre();
    expect(html).toContain("Arrivée journée : 8h00 – 9h30");
    expect(html).toContain("Arrivée/départ séjour : 8h00 – 9h00 ou 16h00 – 17h00");
    expect(html).not.toContain("7h35");
  });

  it("réglage ILLISIBLE : l’e-mail part, avec les horaires d’hier", async () => {
    H.reglages = [{ cle: CLES_HORAIRES.sejour, valeur: "n'importe quoi" }];
    const html = await rendre();
    expect(html).toContain("Arrivée/départ séjour : 9h00 – 10h00 ou 17h00 – 18h00");
  });
});

// ── Le montant de l’adhésion ──────────────────────────────────────────────

describe("le message d’adhésion requise cite le montant réglé", () => {
  it("180 réglé → « 180.– »", () => {
    expect(messageAdhesionRequise(180)).toBe(
      "Adhésion requise : l'adhésion annuelle (180.–) doit être réglée avant de pouvoir réserver.",
    );
  });

  it("le repli garde 200, au format de la maison", () => {
    // « 200.- » d'hier n'était le format de nulle part ailleurs.
    expect(MESSAGE_ADHESION_REQUISE).toContain("200.–");
    expect(MESSAGE_ADHESION_REQUISE).not.toContain("200.-");
  });
});

// ── Le câblage ────────────────────────────────────────────────────────────

const lire = (relatif: string) => readFileSync(join(__dirname, "..", relatif), "utf8");

describe("plus une heure d’accueil en dur", () => {
  it("le formulaire du personnel tire SA RÈGLE et SA PHRASE du même réglage", () => {
    const src = lire("app/(admin)/(espace-clients)/reservations/nouvelle/FormReservation.tsx");
    expect(src).toContain("heureDansPlage(heureArrivee, horaires.journeeArrivee)");
    expect(src).toContain("formatHoraireTiret(horaires.journeeArrivee)");
    // Les bornes d'hier ont disparu des comparaisons.
    expect(src).not.toContain('heureArrivee >= "07:35"');
    expect(src).not.toContain('heureDepart <= "18:00"');
    expect(src).not.toContain("7h35–10h00");
  });

  it("le tunnel client ne fabrique plus ses créneaux lui-même", () => {
    const src = lire("app/(client)/mon-compte/reservations/nouvelle/TunnelReservation.tsx");
    expect(src).toContain("creneauxProposes(horaires.journeeArrivee)");
    expect(src).not.toContain("function genCreneaux");
    expect(src).not.toContain('["07:35", "07:45"');
    expect(src).not.toContain('(7h35–10h)');
  });

  it("les deux encadrés d’e-mail lisent le réglage", () => {
    const src = lire("src/lib/email.ts");
    expect(src).toContain("Arrivée journée : ${formatHoraire(horaires.journeeArrivee)}");
    expect(src).toContain("Journée : ${formatHoraire(horaires.journeeArrivee)}");
    expect(src).not.toContain("7h35 – 10h00");
  });

  it("chaque clé d’horaire a son libellé au journal", () => {
    const libelles = lire("src/lib/journalEvenements.ts");
    for (const cle of Object.values(CLES_HORAIRES)) expect(libelles, cle).toContain(`${cle}:`);
    // APP 44, resté muet jusqu'ici.
    expect(libelles).toContain("avis_google_url:");
  });

  it("la migration pose les cinq horaires sans écraser un réglage déjà fait", () => {
    const sql = lire("supabase/migrations/20260929215930_app59_horaires_accueil.sql");
    for (const cle of Object.values(CLES_HORAIRES)) expect(sql, cle).toContain(`'${cle}'`);
    expect(sql).toContain("'07:35-10:00'");
    expect(sql).toMatch(/on conflict \(cle\) do nothing/);
  });
});
