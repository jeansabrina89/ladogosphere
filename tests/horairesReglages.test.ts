import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  HORAIRES_DEFAUT,
  formatCreneauxCourts,
  lireCreneaux,
  type Horaires,
} from "@/src/lib/horaires";
import {
  creneauxTransition,
  horairesCompatibles,
  occupationEnConflit,
  type Periode,
} from "@/src/lib/disponibilite-box";
import { occupationEnConflitAvant } from "./fixtures/disponibiliteBoxAvantApp64";
import {
  HEURE_ARRIVEE_DEFAUT,
  HEURE_DEPART_DEFAUT,
  bornesCheckin,
  heuresCheckinParDefaut,
} from "@/src/lib/lignesCheckinLogique";
import {
  CRENEAUX_ESSAI_FORCE,
  HEURE_ESSAI_STANDARD,
  creneauxEssaiDisponibles,
  creneauxEssaiForce,
  heureEssaiStandard,
  phrasesEssaiForce,
} from "@/src/lib/journeeEssai";
import { heureLisible, phrasesRappelVeilleEssai } from "@/src/lib/rappelVeilleLogique";
import { donneesExemple } from "@/src/lib/emailsDeTest";

/**
 * APP 64 — tout calé sur les horaires des Réglages.
 *
 * Décision de Sabrina (30.09.2026). Chaque bloc prouve deux choses :
 *
 *   1. AVEC LES RÉGLAGES ACTUELS (`HORAIRES_DEFAUT`, qui sont aussi ceux de la
 *      base au 3 octobre 2026), RIEN NE CHANGE — avant / après, au caractère
 *      près ;
 *   2. avec un autre réglage, la règle SUIT.
 */

const RACINE = join(__dirname, "..");
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), "utf8");

/** Un réglage différent, pour prouver que la règle suit. */
const AUTRE_SEJOUR = "08:00-09:00 ; 16:00-17:00";

// ── 1. Les box ────────────────────────────────────────────────────────────

/** Toutes les heures de 6:00 à 20:00, de cinq en cinq minutes, plus l'absence. */
const HEURES: (string | null)[] = [null];
for (let m = 6 * 60; m <= 20 * 60; m += 5) {
  HEURES.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
}
const TYPES = [null, "sejour", "journee", "essai"];

describe("box — mêmes réponses qu'avant avec les horaires actuels", () => {
  it("les créneaux de transition du réglage sont ceux d'avant : 9h–10h et 17h–18h", () => {
    expect(creneauxTransition()).toEqual([
      { debut: "09:00", fin: "10:00" },
      { debut: "17:00", fin: "18:00" },
    ]);
    expect(creneauxTransition(HORAIRES_DEFAUT.sejour)).toEqual(creneauxTransition());
  });

  it("transition le même jour, dans les deux sens : toutes les heures, tous les types", () => {
    let compares = 0;
    let differences: string[] = [];
    for (const depart of HEURES) {
      for (const arrivee of HEURES) {
        for (const type of TYPES) {
          // L'occupation part le 10, la nouvelle arrive le 10.
          const occ: Periode = { date_debut: "2026-10-08", date_fin: "2026-10-10", heure_depart: depart };
          const nouv: Periode = { date_debut: "2026-10-10", date_fin: "2026-10-12", heure_arrivee: arrivee, type_reservation: type };
          // Et l'inverse : la nouvelle part le 10, l'occupation arrive le 10.
          const nouv2: Periode = { date_debut: "2026-10-08", date_fin: "2026-10-10", heure_depart: depart };
          const occ2: Periode = { date_debut: "2026-10-10", date_fin: "2026-10-12", heure_arrivee: arrivee, type_reservation: type };
          for (const [a, b] of [[occ, nouv], [occ2, nouv2]] as const) {
            compares++;
            const avant = occupationEnConflitAvant(a, b);
            const apres = occupationEnConflit(a, b, creneauxTransition(HORAIRES_DEFAUT.sejour));
            if (avant !== apres) differences.push(`${depart}→${arrivee} (${type}) : ${avant} / ${apres}`);
            // Et sans le paramètre : la valeur par défaut est la même.
            if (occupationEnConflit(a, b) !== avant) differences.push(`défaut ${depart}→${arrivee}`);
          }
        }
      }
    }
    differences = differences.slice(0, 10);
    expect(differences).toEqual([]);
    expect(compares).toBeGreaterThan(100_000);
  });

  it("les chevauchements de plusieurs jours, et l'absence de chevauchement, ne bougent pas", () => {
    const cas: [Periode, Periode][] = [
      [{ date_debut: "2026-10-01", date_fin: "2026-10-05" }, { date_debut: "2026-10-03", date_fin: "2026-10-08" }],
      [{ date_debut: "2026-10-01", date_fin: "2026-10-02" }, { date_debut: "2026-10-04", date_fin: "2026-10-08" }],
      [{ date_debut: "2026-10-04", date_fin: "2026-10-04", heure_arrivee: "09:30", heure_depart: "17:30", type_reservation: "journee" },
       { date_debut: "2026-10-04", date_fin: "2026-10-04", heure_arrivee: "09:15", heure_depart: "17:15", type_reservation: "sejour" }],
    ];
    for (const [a, b] of cas) expect(occupationEnConflit(a, b)).toBe(occupationEnConflitAvant(a, b));
  });
});

describe("box — avec « 08:00-09:00 ; 16:00-17:00 », la règle suit le réglage", () => {
  const creneaux = creneauxTransition(AUTRE_SEJOUR);

  it("départ 08:45, arrivée 08:30 : même créneau, compatibles", () => {
    expect(horairesCompatibles("08:45", "08:30", creneaux)).toBe(true);
    // Avec le réglage d'avant, 08:30 était hors créneau : incompatibles.
    expect(horairesCompatibles("08:45", "08:30")).toBe(false);
  });

  it("départ 09:45, arrivée 09:30 : plus dans un créneau, plus compatibles", () => {
    expect(horairesCompatibles("09:45", "09:30", creneaux)).toBe(false);
    // Avec le réglage d'avant, c'était le créneau du matin : compatibles.
    expect(horairesCompatibles("09:45", "09:30")).toBe(true);
  });

  it("départ 08:30, arrivée 08:45 (et 09:30 / 09:45) : compatibles quel que soit le réglage", () => {
    // Un départ qui PRÉCÈDE l'arrivée libère le box à temps : la règle des
    // créneaux ne s'applique qu'au cas inverse. Ces deux paires sont donc
    // compatibles avec n'importe quel réglage — c'est voulu, et c'est l'ancien
    // comportement.
    for (const c of [creneaux, creneauxTransition()]) {
      expect(horairesCompatibles("08:30", "08:45", c)).toBe(true);
      expect(horairesCompatibles("09:30", "09:45", c)).toBe(true);
    }
  });

  it("de bout en bout : le box se libère ou non selon le réglage passé", () => {
    const occ: Periode = { date_debut: "2026-10-08", date_fin: "2026-10-10", heure_depart: "09:45" };
    const nouv: Periode = { date_debut: "2026-10-10", date_fin: "2026-10-12", heure_arrivee: "09:30", type_reservation: "sejour" };
    expect(occupationEnConflit(occ, nouv)).toBe(false);
    expect(occupationEnConflit(occ, nouv, creneaux)).toBe(true);
  });

  it("le nombre de créneaux est libre : trois créneaux, trois fenêtres", () => {
    const trois = creneauxTransition("08:00-09:00 ; 12:00-13:00 ; 17:00-18:00");
    expect(horairesCompatibles("12:45", "12:15", trois)).toBe(true);
    expect(horairesCompatibles("12:45", "08:15", trois)).toBe(false);
  });

  it("un réglage illisible retombe sur les créneaux de départ", () => {
    expect(creneauxTransition("n'importe quoi")).toEqual(creneauxTransition());
  });
});

describe("box — les appelants lisent le réglage une fois et le passent", () => {
  it.each([
    "app/api/reservations/suggerer-box/route.ts",
    "src/lib/suggestionBox.ts",
  ])("%s", (fichier) => {
    const code = lire(fichier);
    expect(code).toContain("creneauxTransition((await lireHoraires()).sejour)");
    const appels = code.match(/occupationEnConflit\(/g) ?? [];
    const passes = code.match(/type_reservation \},\s*creneaux,/g) ?? [];
    expect(appels.length).toBeGreaterThan(0);
    expect(passes.length, "chaque appel reçoit les créneaux du réglage").toBe(appels.length);
  });
});

// ── 2 et 3. Le check-in, et les deux écrans de modification ──────────────

describe("check-in — 09:00 / 17:00 avant comme après, puis le réglage", () => {
  it("avec le réglage actuel : début du premier créneau, début du dernier", () => {
    expect(heuresCheckinParDefaut()).toEqual({ arrivee: "09:00", depart: "17:00" });
    expect(HEURE_ARRIVEE_DEFAUT).toBe("09:00");
    expect(HEURE_DEPART_DEFAUT).toBe("17:00");
  });

  it("bornesCheckin rend les mêmes horodatages qu'avant", () => {
    const resa = { date_debut: "2026-10-10", date_fin: "2026-10-12" };
    expect(bornesCheckin(resa)).toEqual({
      date_arrivee_prevue: "2026-10-10T09:00:00",
      date_depart_prevu: "2026-10-12T17:00:00",
    });
    expect(bornesCheckin({ ...resa, heure_arrivee: "09:40:00", heure_depart: "17:20" }))
      .toEqual({ date_arrivee_prevue: "2026-10-10T09:40:00", date_depart_prevu: "2026-10-12T17:20:00" });
  });

  it("avec un autre réglage, les heures par défaut suivent", () => {
    expect(heuresCheckinParDefaut(AUTRE_SEJOUR)).toEqual({ arrivee: "08:00", depart: "16:00" });
    expect(heuresCheckinParDefaut("08:00-09:00 ; 12:00-13:00 ; 17:30-18:30"))
      .toEqual({ arrivee: "08:00", depart: "17:30" });
    expect(bornesCheckin({ date_debut: "2026-10-10", date_fin: "2026-10-12" }, heuresCheckinParDefaut(AUTRE_SEJOUR)))
      .toEqual({ date_arrivee_prevue: "2026-10-10T08:00:00", date_depart_prevu: "2026-10-12T16:00:00" });
  });

  it("l'écriture des lignes lit le réglage", () => {
    expect(lire("src/lib/lignesCheckin.ts"))
      .toContain("bornesCheckin(resa, heuresCheckinParDefaut((await lireHoraires()).sejour))");
  });

  it.each([
    "app/api/reservations/[id]/modifier/route.ts",
    "app/(admin)/(espace-clients)/reservations/[id]/modifier/actions.ts",
  ])("%s passe par LA fonction du check-in, plus par un repli à la main", (fichier) => {
    const code = lire(fichier);
    expect(code).not.toMatch(/T09:00:00|T17:00:00/);
    expect(code).toContain("...bornesCheckin(");
    expect(code).toContain("heuresCheckinParDefaut((await lireHoraires()).sejour)");
  });
});

// ── 4 et 5. La journée d'essai ────────────────────────────────────────────

describe("essai — 10:00 avant comme après, puis le réglage", () => {
  it("l'heure standard est la première heure du réglage « essaiArrivee »", () => {
    expect(heureEssaiStandard()).toBe("10:00");
    expect(HEURE_ESSAI_STANDARD).toBe("10:00");
    expect(heureEssaiStandard("09:45")).toBe("09:45");
    expect(heureEssaiStandard("09:30-10:00")).toBe("09:30");
    expect(heureEssaiStandard("illisible")).toBe("10:00");
  });

  it("les créneaux de seconde journée sont ceux d'avant : 09:30, 10:30, 11:00", () => {
    expect([...CRENEAUX_ESSAI_FORCE]).toEqual(["09:30", "10:30", "11:00"]);
    expect(creneauxEssaiForce("10:00")).toEqual(["09:30", "10:30", "11:00"]);
    expect(creneauxEssaiDisponibles(["10:30"])).toEqual(["09:30", "11:00"]);
  });

  it("« hors 10h00 » suit l'heure standard ; les bornes 9h30 et 11h00, non", () => {
    expect(creneauxEssaiForce("10:30")).toEqual(["09:30", "10:00", "11:00"]);
    expect(creneauxEssaiForce("09:45")).toEqual(["09:30", "10:00", "10:30", "11:00"]);
    expect(creneauxEssaiDisponibles([], "10:30")).toEqual(["09:30", "10:00", "11:00"]);
  });

  it("les deux phrases de la fiche du personnel sont celles d'avant, mot pour mot", () => {
    const p = phrasesEssaiForce();
    expect(p.tousPris).toBe("Plus aucun créneau disponible ce jour-là (9h30, 10h30 et 11h00 sont pris).");
    expect(p.aide).toBe("Créneaux de 30 minutes entre 9h30 et 11h00, hors 10h00 et hors créneaux déjà pris.");
    expect(phrasesEssaiForce("10:30").aide).toContain("hors 10h30");
    expect(phrasesEssaiForce("10:30").tousPris).toContain("(9h30, 10h00 et 11h00 sont pris)");
  });

  it("le rappel de la veille : 10 h sans heure, l'heure du réglage sinon", () => {
    expect(heureLisible(null)).toBe("10 h");
    expect(heureLisible(null, "09:45")).toBe("9 h 45");
    expect(heureLisible("10:30", "09:45")).toBe("10 h 30");
    expect(phrasesRappelVeilleEssai("Pixel", null)[0]).toBe("La journée d'essai de Pixel est demain, à 10 h.");
  });

  it("le tunnel envoie, affiche et chiffre la MÊME heure, celle du réglage", () => {
    const tunnel = lire("app/(client)/mon-compte/reservations/nouvelle/TunnelReservation.tsx");
    expect(tunnel).toContain("const heureEssai = heureEssaiStandard(horaires.essaiArrivee);");
    expect(tunnel.match(/heure_arrivee: heureEssai,/g) ?? []).toHaveLength(2);
    expect(tunnel).toContain("{heureEssai} (fixe)");
    expect(tunnel).toContain("• Arrivée ${heureEssai} •");
  });

  it("l'état du jour et l'e-mail lisent le réglage", () => {
    expect(lire("src/lib/essaiReservation.ts")).toContain("heureEssaiStandard(horaires.essaiArrivee)");
    expect(lire("src/lib/email.ts")).toContain("heureEssaiStandard(horaires.essaiArrivee)");
    expect(lire("app/(admin)/(espace-clients)/reservations/nouvelle/FormReservation.tsx"))
      .toContain("phrasesEssaiForce(heureEssaiStandard(horaires.essaiArrivee))");
  });
});

// ── Le libellé du départ dans le tunnel ──────────────────────────────────

describe("tunnel — le libellé « Heure de départ » suit le réglage", () => {
  it("avec les réglages actuels, les deux textes d'avant", () => {
    expect(formatCreneauxCourts(HORAIRES_DEFAUT.sejour)).toBe("9h–10h ou 17h–18h");
    expect(formatCreneauxCourts(HORAIRES_DEFAUT.journeeDepart)).toBe("17h–18h");
  });

  it("avec un autre réglage, le nouveau", () => {
    expect(formatCreneauxCourts(AUTRE_SEJOUR)).toBe("8h–9h ou 16h–17h");
  });
});

// ── 6. Les e-mails de test ───────────────────────────────────────────────

describe("e-mails de test — les heures d'exemple viennent du réglage", () => {
  const maintenant = new Date("2026-09-16T10:00:00Z");

  it("avec les réglages actuels : 09:00, 17:00 et 10:00, comme avant", () => {
    const d = donneesExemple(maintenant);
    expect([d.heureArrivee, d.heureDepart, d.heureArriveeEssai]).toEqual(["09:00", "17:00", "10:00"]);
  });

  it("avec un autre réglage : la première heure du créneau concerné", () => {
    const autres: Horaires = { ...HORAIRES_DEFAUT, sejour: AUTRE_SEJOUR, essaiArrivee: "09:45" };
    const d = donneesExemple(maintenant, autres);
    expect([d.heureArrivee, d.heureDepart, d.heureArriveeEssai]).toEqual(["08:00", "16:00", "09:45"]);
  });

  it("l'envoi de test et sa route s'en servent", () => {
    expect(lire("src/lib/emailsDeTestEnvoi.ts")).toContain("heure_arrivee: d.heureArriveeEssai, type: \"essai\"");
    expect(lire("app/api/emails/test/route.ts")).toContain("donneesExemple(maintenant, await lireHoraires())");
  });
});

// ── 9. Réglages → Entreprise ─────────────────────────────────────────────

describe("la carte Horaires dit que le site les affiche", () => {
  it("sous le titre", () => {
    const carte = lire("app/(admin)/(espace-reglages)/reglages/entreprise/FormHoraires.tsx");
    const titre = carte.indexOf("⏰ Horaires d&apos;accueil");
    const phrase = carte.indexOf(
      "Ces horaires s&apos;affichent aussi sur le site ladogosphere.ch (mise à jour en quelques minutes).",
    );
    expect(titre).toBeGreaterThan(0);
    expect(phrase).toBeGreaterThan(titre);
  });
});

// ── Garde-fou du garde-fou ───────────────────────────────────────────────

describe("les réglages de départ sont bien ceux qu'on croit", () => {
  it("le séjour a deux créneaux, et l'essai une heure fixe", () => {
    expect(lireCreneaux(HORAIRES_DEFAUT.sejour)).toHaveLength(2);
    expect(lireCreneaux(HORAIRES_DEFAUT.essaiArrivee)).toEqual([{ debut: "10:00", fin: "10:00" }]);
  });
});
