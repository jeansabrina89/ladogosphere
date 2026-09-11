import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  COMPTE_PRIVE,
  ENTITE_VIDE,
  FORMAT_IDE,
  MESSAGE_DEBUT_EXERCICE,
  MOTIF_NOM_FAMILLE,
  chevauchements,
  entiteEnVigueur,
  formeJuridique,
  ibanDeVersement,
  ideValide,
  libelleCompte,
  lignesAdresse,
  manquantsEntite,
  normaliserIde,
  refusDateChangement,
  refusRaisonSociale,
  renommerComptes,
  veille,
  type EntiteJuridique,
} from "@/src/lib/entiteJuridiqueLogique";

/**
 * L'identité juridique est un fait DATÉ.
 *
 * Une pièce garde l'identité de sa date d'émission, pour toujours. Ce fichier
 * tient cette promesse par les deux bouts : la fonction qui choisit l'entité, et
 * une relecture du dépôt qui échoue si une raison sociale réapparaît en dur.
 */

const sarl = (p: Partial<EntiteJuridique> = {}): EntiteJuridique => ({
  ...ENTITE_VIDE,
  dateDebut: "2024-01-01",
  dateFin: null,
  forme: "sarl",
  raisonSociale: "La Dogosphère Sàrl",
  ...p,
});

describe("l’entité en vigueur à une date", () => {
  const avant = sarl({ dateDebut: "2024-01-01", dateFin: "2027-01-01" });
  const apres = sarl({
    dateDebut: "2027-01-01",
    forme: "raison_individuelle",
    raisonSociale: "Pension La Dogosphère, Jean",
  });
  const toutes = [apres, avant];

  it("avant le changement, c’est l’ancienne", () => {
    expect(entiteEnVigueur(toutes, "2024-01-01")?.raisonSociale).toBe("La Dogosphère Sàrl");
    expect(entiteEnVigueur(toutes, "2026-11-30")?.raisonSociale).toBe("La Dogosphère Sàrl");
    expect(entiteEnVigueur(toutes, "2026-12-31")?.raisonSociale).toBe("La Dogosphère Sàrl");
  });

  it("le jour même du changement, c’est déjà la nouvelle", () => {
    expect(entiteEnVigueur(toutes, "2027-01-01")?.forme).toBe("raison_individuelle");
  });

  it("après, c’est la nouvelle", () => {
    expect(entiteEnVigueur(toutes, "2030-06-15")?.forme).toBe("raison_individuelle");
  });

  it("avant toute entité, il n’y en a aucune : on n’invente pas une raison sociale", () => {
    expect(entiteEnVigueur(toutes, "2023-12-31")).toBeNull();
  });

  it("une entité fermée sans successeur ne s’applique plus", () => {
    expect(entiteEnVigueur([avant], "2027-01-01")).toBeNull();
    expect(entiteEnVigueur([avant], "2026-12-31")).not.toBeNull();
  });

  it("un avoir de février porte l’entité de février, pas celle de la facture", () => {
    // Le cas normal d'un avoir après changement d'entité : il ne se refuse pas.
    const facture = entiteEnVigueur(toutes, "2026-11-12");
    const avoir = entiteEnVigueur(toutes, "2027-02-03");
    expect(facture?.raisonSociale).toBe("La Dogosphère Sàrl");
    expect(avoir?.raisonSociale).toBe("Pension La Dogosphère, Jean");
    expect(avoir?.raisonSociale).not.toBe(facture?.raisonSociale);
  });
});

describe("deux entités ne se chevauchent jamais", () => {
  it("des plages qui se touchent sans se recouvrir sont acceptées", () => {
    expect(chevauchements([
      sarl({ dateDebut: "2024-01-01", dateFin: "2027-01-01" }),
      sarl({ dateDebut: "2027-01-01" }),
    ])).toEqual([]);
  });

  it("une ancienne restée ouverte est un chevauchement", () => {
    expect(chevauchements([
      sarl({ dateDebut: "2024-01-01", dateFin: null }),
      sarl({ dateDebut: "2027-01-01" }),
    ])).toEqual([{ a: "2024-01-01", b: "2027-01-01" }]);
  });

  it("une fin qui déborde sur la suivante aussi", () => {
    expect(chevauchements([
      sarl({ dateDebut: "2024-01-01", dateFin: "2027-06-01" }),
      sarl({ dateDebut: "2027-01-01" }),
    ])).toHaveLength(1);
  });

  it("et une seule entité ne peut chevaucher personne", () => {
    expect(chevauchements([sarl()])).toEqual([]);
  });

  it("la veille d’un changement ferme bien la précédente", () => {
    expect(veille("2027-01-01")).toBe("2026-12-31");
    expect(veille("2027-03-01")).toBe("2027-02-28");
  });
});

describe("la date d’un changement d’entité", () => {
  const aujourdhui = "2026-09-12";

  it("un 1er janvier à venir est accepté", () => {
    expect(refusDateChangement({ date: "2027-01-01", aujourdhui })).toBeNull();
    expect(refusDateChangement({ date: "2030-01-01", aujourdhui })).toBeNull();
  });

  it("toute autre date est refusée, avec le motif écrit", () => {
    for (const date of ["2027-02-01", "2027-01-15", "2027-07-01", "2026-12-31"]) {
      expect(refusDateChangement({ date, aujourdhui })).toBe(MESSAGE_DEBUT_EXERCICE);
    }
  });

  it("une date illisible est refusée de la même façon", () => {
    expect(refusDateChangement({ date: "", aujourdhui })).toBe(MESSAGE_DEBUT_EXERCICE);
    expect(refusDateChangement({ date: "1er janvier", aujourdhui })).toBe(MESSAGE_DEBUT_EXERCICE);
  });

  it("un 1er janvier passé est refusé : une identité rétroactive réécrirait des pièces", () => {
    const refus = refusDateChangement({ date: "2026-01-01", aujourdhui });
    expect(refus).not.toBeNull();
    expect(refus).toContain("à venir");
  });

  it("et il doit venir après l’entité en vigueur", () => {
    expect(refusDateChangement({
      date: "2027-01-01", aujourdhui, dateDebutActuelle: "2028-01-01",
    })).toContain("après celle qui est en vigueur");
  });
});

describe("la raison sociale d’une raison individuelle", () => {
  it("doit contenir le nom de famille du titulaire", () => {
    expect(refusRaisonSociale({
      forme: "raison_individuelle",
      raisonSociale: "Pension La Dogosphère, Jean",
      nomFamille: "Jean",
    })).toBeNull();
  });

  it("est refusée sinon, avec le motif de droit", () => {
    expect(refusRaisonSociale({
      forme: "raison_individuelle",
      raisonSociale: "La Dogosphère",
      nomFamille: "Jean",
    })).toBe(MOTIF_NOM_FAMILLE);
  });

  it("accepte les accents et la casse, refuse un nom seulement contenu dans un mot", () => {
    expect(refusRaisonSociale({
      forme: "raison_individuelle", raisonSociale: "Pension MÜLLER", nomFamille: "müller",
    })).toBeNull();
    // « Jeanneret » n'est pas « Jean » : un morceau de mot ne suffit pas.
    expect(refusRaisonSociale({
      forme: "raison_individuelle", raisonSociale: "Pension Jeanneret", nomFamille: "Jean",
    })).toBe(MOTIF_NOM_FAMILLE);
  });

  it("sans nom de famille connu, elle dit quoi compléter plutôt que de deviner", () => {
    const refus = refusRaisonSociale({
      forme: "raison_individuelle", raisonSociale: "Pension Jean", nomFamille: null,
    });
    expect(refus).toContain("complétez son profil");
  });

  it("une Sàrl n’a pas cette contrainte", () => {
    expect(refusRaisonSociale({
      forme: "sarl", raisonSociale: "La Dogosphère", nomFamille: "Jean",
    })).toBeNull();
  });

  it("mais une raison sociale vide est refusée dans les deux formes", () => {
    for (const forme of ["sarl", "raison_individuelle"]) {
      expect(refusRaisonSociale({ forme, raisonSociale: "  ", nomFamille: "Jean" }))
        .toBe("La raison sociale est obligatoire.");
    }
  });
});

describe("l’IDE", () => {
  it("n’est accepté que dans sa forme légale", () => {
    expect(FORMAT_IDE).toBe("CHE-###.###.###");
    expect(ideValide("CHE-123.456.789")).toBe(true);
    expect(ideValide("CHE123456789")).toBe(false);
    expect(ideValide("")).toBe(false);
  });

  it("se met en forme quand il a ses neuf chiffres", () => {
    expect(normaliserIde("CHE 123 456 789")).toBe("CHE-123.456.789");
    expect(normaliserIde("123456789")).toBe("CHE-123.456.789");
  });

  it("rend null plutôt qu’un numéro approché", () => {
    expect(normaliserIde("")).toBeNull();
    expect(normaliserIde("CHE-123.456")).toBeNull();
    expect(normaliserIde("à demander")).toBeNull();
  });
});

describe("ce que la forme change", () => {
  it("le capital social devient capital propre en raison individuelle", () => {
    expect(libelleCompte("2800", "Capital social", "raison_individuelle")).toBe("Capital propre");
    expect(libelleCompte("2800", "Capital social", "sarl")).toBe("Capital social");
  });

  it("et aucun autre compte ne change de nom", () => {
    const plan = [
      { numero: "1000", libelle: "Caisse" },
      { numero: "2800", libelle: "Capital social" },
      { numero: "2970", libelle: "Report a nouveau" },
    ];
    expect(renommerComptes(plan, "raison_individuelle").map((c) => c.libelle))
      .toEqual(["Caisse", "Capital propre", "Report a nouveau"]);
    expect(renommerComptes(plan, "sarl")).toEqual(plan);
  });

  it("le compte privé est bien le 2850", () => {
    expect(COMPTE_PRIVE).toBe("2850");
  });

  it("une forme inconnue retombe sur la Sàrl : rien ne change par accident", () => {
    expect(formeJuridique("association")).toBe("sarl");
    expect(formeJuridique(null)).toBe("sarl");
    expect(libelleCompte("2800", "Capital social", "association")).toBe("Capital social");
  });
});

describe("ce qu’une pièce imprime", () => {
  it("l’adresse se lit comme sur une enveloppe", () => {
    expect(lignesAdresse(sarl({
      adresse: { rue: "Rue du Test", numero: "3", npa: "1950", ville: "Sion", pays: "CH" },
    }))).toEqual(["Rue du Test 3", "1950 Sion"]);
  });

  it("une adresse absente ne laisse aucune ligne vide", () => {
    expect(lignesAdresse(sarl())).toEqual([]);
  });

  it("le bulletin QR prend le QR-IBAN quand il existe", () => {
    expect(ibanDeVersement(sarl({ iban: "CH11", qrIban: "CH99" }))).toBe("CH99");
    expect(ibanDeVersement(sarl({ iban: "CH11", qrIban: null }))).toBe("CH11");
    expect(ibanDeVersement(sarl())).toBe("");
  });

  it("ce qui manque se dit, plutôt que de se combler", () => {
    const manque = manquantsEntite(sarl());
    expect(manque).toContain("l'adresse");
    expect(manque).toContain(`l'IDE (${FORMAT_IDE})`);
    expect(manque).toContain("l'IBAN");
    expect(manquantsEntite(sarl({
      adresse: { rue: "R", numero: "1", npa: "1950", ville: "Sion", pays: "CH" },
      ide: "CHE-123.456.789", iban: "CH11", email: "a@b.ch",
    }))).toEqual([]);
  });
});

// ── Le dépôt : plus aucune raison sociale en dur ──────────────────────────

const RACINE = join(__dirname, "..");
/**
 * Le seul fichier autorisé à écrire « Sàrl » : celui qui DÉFINIT les formes
 * juridiques et explique en quoi elles diffèrent. Partout ailleurs, la raison
 * sociale vient de `entiteA(date)`.
 */
const SEUL_AUTORISE = "src/lib/entiteJuridiqueLogique.ts";

function fichiers(dossier: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier)) {
    if (entree === "node_modules" || entree === ".next") continue;
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiers(chemin));
    else if (/[.]tsx?$/.test(entree)) trouves.push(chemin);
  }
  return trouves;
}

const SOURCES = ["app", "src"]
  .flatMap((d) => fichiers(join(RACINE, d)))
  .map((chemin) => ({
    chemin: chemin.slice(RACINE.length + 1).split("\\").join("/"),
    contenu: readFileSync(chemin, "utf8"),
  }));

/** La forme juridique, sous ses trois graphies. */
const FORME_EN_DUR = /\bS[àa]rl\b|\bSARL\b/;

describe("aucune raison sociale n’est écrite en dur", () => {
  it("le dépôt est bien relu (garde-fou du garde-fou)", () => {
    expect(SOURCES.length).toBeGreaterThan(200);
    expect(SOURCES.some((f) => f.chemin === SEUL_AUTORISE)).toBe(true);
  });

  it("« Sàrl » n’apparaît que là où l’on explique ce qu’est une Sàrl", () => {
    const coupables = SOURCES
      .filter((f) => f.chemin !== SEUL_AUTORISE && FORME_EN_DUR.test(f.contenu))
      .map((f) => f.chemin);
    expect(coupables).toEqual([]);
  });

  it("et « La Dogosphère Sàrl » nulle part, pas même dans un commentaire", () => {
    const coupables = SOURCES
      .filter((f) => /La Dogosph[eè]re S[àa]rl/.test(f.contenu))
      .map((f) => f.chemin);
    expect(coupables).toEqual([]);
  });

  it("les documents lisent l’identité au lieu de la nommer", () => {
    // Si ces fichiers cessaient d'appeler entiteA, l'identité redeviendrait un
    // réglage figé sans que rien ne le signale.
    for (const chemin of ["src/lib/coordonneesPaiement.ts", "src/lib/email.ts"]) {
      const f = SOURCES.find((s) => s.chemin === chemin);
      expect(f, chemin).toBeDefined();
      expect(f!.contenu, chemin).toMatch(/entiteJuridique/);
    }
  });
});
