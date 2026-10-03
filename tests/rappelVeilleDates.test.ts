import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { datesDuRappel } from "@/src/lib/rappelVeilleLogique";

/**
 * APP 71 — le cron de la veille compte les jours à l'heure de ZURICH.
 *
 * Il les comptait en UTC (`toISOString`). À 10:00 UTC, l'heure du cron, les
 * deux donnent le même jour : rien ne change pour les rappels envoyés. Mais
 * lancé entre minuit et 1 h ou 2 h du matin heure suisse, l'UTC est encore la
 * veille, et le cron aurait rappelé les mauvaises réservations.
 */

const LA = (iso: string) => datesDuRappel(new Date(iso));

describe("à l'heure du cron (10:00 UTC), le même jour qu'avant", () => {
  it.each([
    "2026-10-03T10:00:00Z", // heure d'été
    "2026-12-15T10:00:00Z", // heure d'hiver
    "2026-12-31T10:00:00Z", // veille de nouvel an
  ])("%s", (instant) => {
    // L'ancien calcul, recopié : la date UTC, puis +1 et +14 jours.
    const ancien = (n: number) => {
      const d = new Date(instant);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().split("T")[0];
    };
    expect(LA(instant)).toEqual({
      aujourdhui: ancien(0),
      demain: ancien(1),
      dansQuatorzeJours: ancien(14),
    });
  });
});

describe("autour de minuit, heure suisse", () => {
  it("heure d'été : 23:59:59 à Zurich est encore le 3 octobre", () => {
    expect(LA("2026-10-03T21:59:59Z")).toMatchObject({ aujourdhui: "2026-10-03", demain: "2026-10-04" });
  });

  it("heure d'été : 00:00 à Zurich est déjà le 4, alors que l'UTC dit encore le 3", () => {
    expect(LA("2026-10-03T22:00:00Z")).toMatchObject({ aujourdhui: "2026-10-04", demain: "2026-10-05" });
  });

  it("heure d'hiver : minuit est à 23:00 UTC", () => {
    expect(LA("2026-12-15T22:59:59Z")).toMatchObject({ aujourdhui: "2026-12-15", demain: "2026-12-16" });
    expect(LA("2026-12-15T23:00:00Z")).toMatchObject({ aujourdhui: "2026-12-16", demain: "2026-12-17" });
  });

  it("le passage d'année", () => {
    expect(LA("2026-12-31T23:30:00Z")).toEqual({
      aujourdhui: "2027-01-01", demain: "2027-01-02", dansQuatorzeJours: "2027-01-15",
    });
  });
});

describe("aux changements d'heure", () => {
  it("printemps (29 mars 2026, 02:00 → 03:00) : le jour ne saute ni ne double", () => {
    expect(LA("2026-03-28T23:30:00Z").aujourdhui).toBe("2026-03-29"); // 00:30 CET
    expect(LA("2026-03-29T00:59:59Z").aujourdhui).toBe("2026-03-29"); // 01:59 CET
    expect(LA("2026-03-29T01:00:00Z").aujourdhui).toBe("2026-03-29"); // 03:00 CEST
    expect(LA("2026-03-29T21:59:59Z").aujourdhui).toBe("2026-03-29"); // 23:59 CEST
    expect(LA("2026-03-29T22:00:00Z")).toMatchObject({ aujourdhui: "2026-03-30", demain: "2026-03-31" });
  });

  it("automne (25 octobre 2026, 03:00 → 02:00) : la journée de 25 h reste un seul jour", () => {
    expect(LA("2026-10-24T22:30:00Z").aujourdhui).toBe("2026-10-25"); // 00:30 CEST
    expect(LA("2026-10-25T00:30:00Z").aujourdhui).toBe("2026-10-25"); // 02:30 CEST
    expect(LA("2026-10-25T01:30:00Z").aujourdhui).toBe("2026-10-25"); // 02:30 CET, la seconde fois
    expect(LA("2026-10-25T22:59:59Z")).toMatchObject({ aujourdhui: "2026-10-25", demain: "2026-10-26" });
    expect(LA("2026-10-25T23:00:00Z").aujourdhui).toBe("2026-10-26");
  });

  it("« demain » enjambe le changement d'heure sans perdre de jour", () => {
    expect(LA("2026-03-28T10:00:00Z").demain).toBe("2026-03-29");
    expect(LA("2026-10-24T10:00:00Z").demain).toBe("2026-10-25");
  });
});

describe("le cron passe par cette fonction, et l'heure du cron ne bouge pas", () => {
  const route = readFileSync(join(__dirname, "..", "app/api/cron/rappel-veille/route.ts"), "utf8");
  const vercel = JSON.parse(readFileSync(join(__dirname, "..", "vercel.json"), "utf8"));

  it("plus aucune date tirée d'UTC dans la route", () => {
    expect(route).toContain("datesDuRappel()");
    expect(route).not.toMatch(/toISOString\(\)\.split\("T"\)/);
    expect(route).not.toMatch(/setDate\(/);
  });

  it("toujours à 10:00 UTC", () => {
    expect(vercel.crons).toContainEqual({ path: "/api/cron/rappel-veille", schedule: "0 10 * * *" });
  });
});
