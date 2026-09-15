import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  COMPTE_PRIVE,
  ENTITE_VIDE,
  FORMAT_IDE,
  MESSAGE_DEBUT_EXERCICE,
  MESSAGE_TITULAIRE_REQUIS,
  avertissementIdentite,
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
  AVERTISSEMENT_RAISON_SOCIALE,
  NOM_COMMERCIAL,
  comptesSaisissables,
  raisonSocialeACompleter,
  motifNomTitulaire,
  raisonSocialeAffichee,
  titulaireACompleter,
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
  it("doit contenir le nom du titulaire, lu sur l’entité", () => {
    expect(refusRaisonSociale({
      forme: "raison_individuelle",
      raisonSociale: "Pension La Dogosphère, Jean",
      titulaireNom: "Jean",
    })).toBeNull();
  });

  it("est refusée sinon, et le message CITE le nom attendu", () => {
    expect(refusRaisonSociale({
      forme: "raison_individuelle",
      raisonSociale: "La Dogosphère",
      titulaireNom: "Jean",
    })).toBe("La raison sociale doit contenir le nom du titulaire (Jean).");
    expect(motifNomTitulaire("Jean"))
      .toBe("La raison sociale doit contenir le nom du titulaire (Jean).");
  });

  it("accepte les accents et la casse, refuse un nom seulement contenu dans un mot", () => {
    expect(refusRaisonSociale({
      forme: "raison_individuelle", raisonSociale: "Pension MÜLLER", titulaireNom: "müller",
    })).toBeNull();
    // « Jeanneret » n'est pas « Jean » : un morceau de mot ne suffit pas.
    expect(refusRaisonSociale({
      forme: "raison_individuelle", raisonSociale: "Pension Jeanneret", titulaireNom: "Jean",
    })).toBe(motifNomTitulaire("Jean"));
  });

  it("sans titulaire sur l’entité, elle réclame le nom — sans parler d’un profil", () => {
    const refus = refusRaisonSociale({
      forme: "raison_individuelle", raisonSociale: "Pension Jean", titulaireNom: null,
    });
    expect(refus).toBe(MESSAGE_TITULAIRE_REQUIS);
    expect(refus).not.toContain("profil");
  });

  it("une Sàrl n’a pas cette contrainte", () => {
    expect(refusRaisonSociale({
      forme: "sarl", raisonSociale: "La Dogosphère", titulaireNom: "Jean",
    })).toBeNull();
  });

  it("mais une raison sociale vide est refusée dans les deux formes", () => {
    for (const forme of ["sarl", "raison_individuelle"]) {
      expect(refusRaisonSociale({ forme, raisonSociale: "  ", titulaireNom: "Jean" }))
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

// ── La correction d'APP 17 : raison individuelle d'abord, Sàrl ensuite ────

describe("l’entité de départ, corrigée en raison individuelle", () => {
  // L'état réel après la migration : une raison individuelle sans raison
  // sociale encore choisie, puis la Sàrl préparée au 1er janvier 2027.
  const premiere = sarl({
    dateDebut: "2024-01-01",
    dateFin: "2027-01-01",
    forme: "raison_individuelle",
    raisonSociale: "",
  });
  const suivante = sarl({ dateDebut: "2027-01-01", raisonSociale: "La Dogosphère Sàrl" });
  const toutes = [suivante, premiere];

  it("la première année est une raison individuelle", () => {
    for (const jour of ["2026-06-11", "2026-09-12", "2026-12-31"]) {
      expect(entiteEnVigueur(toutes, jour)?.forme, jour).toBe("raison_individuelle");
    }
  });

  it("et la Sàrl ne prend effet qu’au 1er janvier 2027", () => {
    expect(entiteEnVigueur(toutes, "2026-12-31")?.forme).toBe("raison_individuelle");
    expect(entiteEnVigueur(toutes, "2027-01-01")?.forme).toBe("sarl");
    expect(entiteEnVigueur(toutes, "2027-06-30")?.raisonSociale).toBe("La Dogosphère Sàrl");
  });

  it("aucun document de la première année ne porte « Sàrl »", () => {
    for (const jour of ["2026-06-11", "2026-09-12", "2026-12-31"]) {
      const e = entiteEnVigueur(toutes, jour)!;
      expect(raisonSocialeAffichee(e), jour).toBe(NOM_COMMERCIAL);
      expect(raisonSocialeAffichee(e), jour).not.toMatch(/S[àa]rl/);
    }
  });

  it("tant que la raison sociale manque, le document porte le nom commercial seul", () => {
    expect(raisonSocialeACompleter(premiere)).toBe(true);
    expect(raisonSocialeAffichee(premiere)).toBe("La Dogosphère");
    expect(AVERTISSEMENT_RAISON_SOCIALE)
      .toBe("Raison sociale à compléter avant la première facture réelle.");
  });

  it("une fois saisie, elle remplace le repli et l’avertissement s’éteint", () => {
    const saisie = { ...premiere, raisonSociale: "La Dogosphère, Sabrina Jean" };
    expect(raisonSocialeACompleter(saisie)).toBe(false);
    expect(raisonSocialeAffichee(saisie)).toBe("La Dogosphère, Sabrina Jean");
  });

  it("et elle doit contenir le nom de famille : « La Dogosphère » seul est refusé", () => {
    expect(refusRaisonSociale({
      forme: "raison_individuelle", raisonSociale: "La Dogosphère", titulaireNom: "Jean",
    })).toBe(motifNomTitulaire("Jean"));
    expect(refusRaisonSociale({
      forme: "raison_individuelle", raisonSociale: "La Dogosphère, Sabrina Jean", titulaireNom: "Jean",
    })).toBeNull();
  });

  it("les deux plages se touchent sans se chevaucher", () => {
    expect(chevauchements(toutes)).toEqual([]);
  });
});

describe("les trois effets de la raison individuelle", () => {
  const plan = [
    { numero: "1000", libelle: "Caisse" },
    { numero: "2800", libelle: "Capital social" },
    { numero: "2850", libelle: "Compte privé" },
  ];

  it("le capital se lit « Capital propre »", () => {
    expect(renommerComptes(plan, "raison_individuelle")[1].libelle).toBe("Capital propre");
  });

  it("le compte privé 2850 est proposé à la saisie", () => {
    expect(comptesSaisissables(plan, "raison_individuelle").map((c) => c.numero))
      .toEqual(["1000", "2800", "2850"]);
  });

  it("en Sàrl, il disparaît de la saisie — une société ne prélève pas en privé", () => {
    expect(comptesSaisissables(plan, "sarl").map((c) => c.numero)).toEqual(["1000", "2800"]);
    expect(comptesSaisissables(plan, "sarl")[1].libelle).toBe("Capital social");
  });

  it("mais il reste visible dans les rapports : cacher un solde cacherait de l’argent", () => {
    expect(renommerComptes(plan, "sarl").map((c) => c.numero)).toEqual(["1000", "2800", "2850"]);
  });
});

// ── Le nom du titulaire vit sur l'entité, et nulle part ailleurs ──────────

describe("le nom du titulaire", () => {
  const individuelle = (titulaireNom: string | null) =>
    sarl({ forme: "raison_individuelle", raisonSociale: "", titulaireNom });

  it("manque tant qu’il n’est pas saisi, et se dit", () => {
    expect(titulaireACompleter(individuelle(null))).toBe(true);
    expect(titulaireACompleter(individuelle("  "))).toBe(true);
    expect(titulaireACompleter(individuelle("Jean"))).toBe(false);
  });

  it("ne concerne pas une Sàrl, qui n’en porte pas", () => {
    expect(titulaireACompleter(sarl({ titulaireNom: null }))).toBe(false);
    expect(refusRaisonSociale({
      forme: "sarl", raisonSociale: "La Dogosphère Sàrl", titulaireNom: null,
    })).toBeNull();
  });

  it("se compare sans tenir compte de la casse ni des accents", () => {
    for (const [raison, titulaire] of [
      ["La Dogosphère - JEAN Sabrina", "jean"],
      ["Pension müller", "MÜLLER"],
      ["Pension Muller", "Müller"],
      ["la dogosphère, jean", "Jean"],
    ]) {
      expect(refusRaisonSociale({
        forme: "raison_individuelle", raisonSociale: raison, titulaireNom: titulaire,
      }), `${raison} / ${titulaire}`).toBeNull();
    }
  });

  it("exige un mot entier : « Jeanneret » ne contient pas « Jean »", () => {
    expect(refusRaisonSociale({
      forme: "raison_individuelle", raisonSociale: "Pension Jeanneret", titulaireNom: "Jean",
    })).toBe(motifNomTitulaire("Jean"));
  });

  it("figure dans ce qui manque, avant la raison sociale", () => {
    expect(manquantsEntite(individuelle(null)).slice(0, 2))
      .toEqual(["le nom du titulaire", "la raison sociale"]);
  });
});

describe("l’avertissement de l’écran Entreprise", () => {
  const individuelle = (titulaireNom: string | null, raisonSociale = "") =>
    sarl({ forme: "raison_individuelle", raisonSociale, titulaireNom });

  it("réclame les deux quand les deux manquent", () => {
    expect(avertissementIdentite(individuelle(null)))
      .toBe("Raison sociale et nom du titulaire à compléter avant la première facture réelle.");
  });

  it("ne réclame que la raison sociale quand le titulaire est là", () => {
    expect(avertissementIdentite(individuelle("Jean")))
      .toBe("Raison sociale à compléter avant la première facture réelle.");
  });

  it("se tait quand tout est saisi", () => {
    expect(avertissementIdentite(individuelle("Jean", "La Dogosphère - Jean Sabrina"))).toBeNull();
  });

  it("et ne réclame jamais de titulaire à une Sàrl", () => {
    expect(avertissementIdentite(sarl({ raisonSociale: "La Dogosphère Sàrl" }))).toBeNull();
  });
});

describe("plus aucune lecture du profil ni de la fiche d’employée", () => {
  /** Les fichiers qui portent la règle du nom du titulaire. */
  const CONCERNES = [
    "src/lib/entiteJuridique.ts",
    "src/lib/entiteJuridiqueLogique.ts",
    "app/(admin)/(espace-reglages)/reglages/entreprise/actions.ts",
  ];

  it("aucun d’eux n’interroge profiles ni employes_rh pour cette règle", () => {
    // Le nom venait de deux endroits qui ne parlaient de la titulaire que par
    // coïncidence. S'ils revenaient, la règle redeviendrait indevinable le jour
    // où l'une des deux coïncidences cesserait.
    const coupables: string[] = [];
    for (const chemin of CONCERNES) {
      const f = SOURCES.find((s) => s.chemin === chemin);
      expect(f, chemin).toBeDefined();
      if (/from\(\s*["']profiles["']\s*\)/.test(f!.contenu)) coupables.push(`${chemin} → profiles`);
      if (/employes_rh/.test(f!.contenu)) coupables.push(`${chemin} → employes_rh`);
    }
    expect(coupables).toEqual([]);
  });

  it("et la fonction qui les lisait n’existe plus", () => {
    const coupables = SOURCES
      .filter((f) => /nomFamilleTitulaire/.test(f.contenu))
      .map((f) => f.chemin);
    expect(coupables).toEqual([]);
  });

  it("le message « complétez son profil » a disparu du dépôt", () => {
    const coupables = SOURCES
      .filter((f) => /complétez son profil/.test(f.contenu))
      .map((f) => f.chemin);
    expect(coupables).toEqual([]);
  });
});
