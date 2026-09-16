import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  MESSAGE_INITIALES_INVALIDES,
  MESSAGE_INITIALES_PRISES,
  auteurAffiche,
  calculerInitiales,
  candidatsInitiales,
  initialesDe,
  lettresMajuscules,
  nomCompletDe,
  normaliserInitiales,
  refusInitiales,
} from "@/src/lib/auteur";

/**
 * Les initiales du personnel : une règle, un seul endroit, et la même en SQL.
 */

describe("les initiales proposées", () => {
  it("prénom et nom : la première lettre de chacun", () => {
    expect(calculerInitiales({ prenom: "Sabrina", nom: "Jean" }, [])).toBe("SJ");
    expect(calculerInitiales({ prenom: "Kévin", nom: "Coppex" }, [])).toBe("KC");
  });

  it("collision : la deuxième lettre du nom s'ajoute, puis la suivante", () => {
    expect(calculerInitiales({ prenom: "Sophie", nom: "Jeanneret" }, ["SJ"])).toBe("SJE");
    expect(calculerInitiales({ prenom: "Sophie", nom: "Jeanneret" }, ["SJ", "SJE"])).toBe("SJA");
  });

  it("toutes les lettres du nom épuisées : la deuxième lettre du prénom", () => {
    expect(calculerInitiales({ prenom: "Sabrina", nom: "Jo" }, ["SJ", "SJO"])).toBe("SAJ");
  });

  it("la casse des initiales déjà prises ne compte pas", () => {
    expect(calculerInitiales({ prenom: "Sabrina", nom: "Jean" }, ["sj"])).toBe("SJE");
  });

  it("accents et signes tombent", () => {
    expect(lettresMajuscules("Élodie-Anne d'Ürbé")).toBe("ELODIEANNEDURBE");
    expect(calculerInitiales({ prenom: "Éloïse", nom: "Ölz" }, [])).toBe("EO");
  });

  it("sans prénom ni nom : les deux premières lettres de l'e-mail", () => {
    expect(calculerInitiales({ email: "employe2@ladogosphere.ch" }, [])).toBe("EM");
    expect(calculerInitiales({ prenom: "", nom: "  ", email: "vero.test@x.ch" }, [])).toBe("VE");
    expect(calculerInitiales({ email: "vero.test@x.ch" }, ["VE"])).toBe("VER");
  });

  it("prénom seul ou nom seul : ses deux premières lettres", () => {
    expect(calculerInitiales({ prenom: "Adeline" }, [])).toBe("AD");
    expect(calculerInitiales({ nom: "Helg" }, [])).toBe("HE");
  });

  it("rien d'exploitable : jamais un vide, toujours la bonne forme", () => {
    const i = calculerInitiales({ prenom: "1", nom: "-", email: "" }, []);
    expect(i).toMatch(/^[A-Z]{2,3}$/);
  });

  it("chaque candidat a la bonne forme, sans doublon", () => {
    for (const identite of [
      { prenom: "Sabrina", nom: "Jean" }, { email: "a@b.c" }, { prenom: "X" }, {},
    ]) {
      const c = candidatsInitiales(identite);
      expect(c.every((x) => /^[A-Z]{2,3}$/.test(x))).toBe(true);
      expect(new Set(c).size).toBe(c.length);
    }
  });

  it("une équipe entière reçoit des initiales toutes différentes", () => {
    const equipe = [
      { prenom: "Sabrina", nom: "Jean" }, { prenom: "Sophie", nom: "Jean" },
      { prenom: "Samuel", nom: "Jaquet" }, { prenom: "Sarah", nom: "J" },
      { email: "sj@x.ch" }, { prenom: "Sébastien", nom: "Joris" },
    ];
    const prises: string[] = [];
    for (const p of equipe) prises.push(calculerInitiales(p, prises));
    expect(new Set(prises).size).toBe(equipe.length);
  });
});

describe("la saisie à la main", () => {
  it("accepte 2 ou 3 lettres, en minuscules aussi", () => {
    expect(refusInitiales("sj", [])).toBeNull();
    expect(normaliserInitiales(" sje ")).toBe("SJE");
  });

  it("refuse une autre forme", () => {
    for (const s of ["S", "SJEA", "S1", "É J", ""]) expect(refusInitiales(s, [])).toBe(MESSAGE_INITIALES_INVALIDES);
  });

  it("refuse des initiales déjà portées par une autre personne", () => {
    expect(refusInitiales("kc", ["KC", "AH"])).toBe(MESSAGE_INITIALES_PRISES);
  });
});

describe("l'auteur à l'écran", () => {
  it("le personnel : ses initiales, le nom complet au survol", () => {
    const a = auteurAffiche({ initiales: "SJ", prenom: "Sabrina", nom: "Jean", role: "admin" });
    expect(a).toEqual({ texte: "SJ", titre: "Sabrina Jean", genre: "personnel" });
  });

  it("pas d'initiales enregistrées : la règle, jamais un vide", () => {
    expect(initialesDe({ prenom: "Kévin", nom: "Coppex", role: "employe" })).toBe("KC");
    expect(initialesDe({ email: "employe1@x.ch" })).toBe("EM");
  });

  it("sans nom : l'adresse au survol", () => {
    expect(nomCompletDe({ email: "x@y.ch" })).toBe("x@y.ch");
    expect(nomCompletDe(null)).toBe("Personne inconnue");
  });

  it("aucun compte : « automatique » ; un client : « client », jamais son nom", () => {
    expect(auteurAffiche(null).texte).toBe("automatique");
    expect(auteurAffiche(null, { parClientSansCompte: true }).texte).toBe("client");
    const client = auteurAffiche({ prenom: "Jean", nom: "Dupont", role: "client" });
    expect(client).toEqual({ texte: "client", titre: null, genre: "client" });
  });
});

describe("la même règle en SQL", () => {
  // Vérifié aussi en base, sur les mêmes cas, à l'application de la migration :
  // public.candidats_initiales rend les mêmes listes que candidatsInitiales.
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20260916115705_profiles_initiales.sql"), "utf8",
  );

  it("retire les mêmes accents", () => {
    const m = sql.match(/'([^']+)',\s*'([A-Z]+)'\),\s*'\[\^A-Z\]'/);
    expect(m).not.toBeNull();
    const [avec, sans] = [[...m![1]], [...m![2]]];
    expect(avec.length).toBe(sans.length);
    avec.forEach((c, i) => expect(lettresMajuscules(c), c).toBe(sans[i]));
  });

  it("pose la contrainte de forme et l'unicité parmi le personnel actif", () => {
    expect(sql).toMatch(/initiales ~ '\^\[A-Z\]\{2,3\}\$'/);
    expect(sql).toMatch(/create unique index[\s\S]*on public\.profiles\s*\(initiales\)[\s\S]*where actif and role in \('admin', 'employe'\)/i);
  });

  it("attribue des initiales à tout nouveau compte du personnel", () => {
    expect(sql).toMatch(/before insert or update[\s\S]*when \(new\.initiales is null and new\.role in \('admin', 'employe'\)\)/i);
  });
});
