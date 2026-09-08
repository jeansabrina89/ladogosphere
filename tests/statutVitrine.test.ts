import { describe, it, expect } from "vitest";
import {
  ARTICULATION_ACTIF_VITRINE,
  STATUTS_VITRINE,
  STATUT_VITRINE_PAR_DEFAUT,
  compterParStatut,
  doitPublierParDate,
  doitPublierParStock,
  evenementPublication,
  infoStatutVitrine,
  libelleCompteBrouillons,
  mentionPublicationProgrammee,
  publicationAtteinte,
  statutVitrine,
  vendableAuComptoir,
  visibleEnVitrine,
} from "@/src/lib/statutVitrineLogique";
import { COLONNES_INTERDITES_AU_PUBLIC, COLONNES_VITRINE } from "@/src/lib/vitrineColonnes";

/**
 * `actif` et `statut_vitrine` répondent à DEUX questions différentes.
 * Les confondre, c'est soit vendre ce qu'on ne devait pas montrer, soit
 * retirer de la vente ce qu'on voulait seulement cacher.
 */

const MAINTENANT = "2026-10-05T12:00:00.000Z";

describe("les trois statuts", () => {
  it("un article existant est publié par défaut", () => {
    expect(STATUT_VITRINE_PAR_DEFAUT).toBe("publie");
    expect(statutVitrine(null)).toBe("publie");
    expect(statutVitrine(undefined)).toBe("publie");
    expect(statutVitrine("n'importe quoi")).toBe("publie");
  });

  it("il n’y en a que trois, et chacun dit ce qu’il fait", () => {
    expect(STATUTS_VITRINE.map((s) => s.valeur)).toEqual(["brouillon", "publie", "masque"]);
    expect(infoStatutVitrine("brouillon").aide).toContain("y compris à la caisse");
    expect(infoStatutVitrine("masque").aide).toContain("vendable au comptoir");
  });

  it("la phrase qui articule les deux drapeaux nomme les deux", () => {
    expect(ARTICULATION_ACTIF_VITRINE).toContain("il existe encore");
    expect(ARTICULATION_ACTIF_VITRINE).toContain("s'il se montre");
    expect(ARTICULATION_ACTIF_VITRINE).toContain("se vend encore au comptoir");
  });
});

describe("le brouillon", () => {
  const brouillon = { actif: true, statut_vitrine: "brouillon" };

  it("ne se voit nulle part", () => {
    expect(visibleEnVitrine(brouillon, MAINTENANT)).toBe(false);
  });

  it("ne se vend pas non plus au comptoir", () => {
    expect(vendableAuComptoir(brouillon)).toBe(false);
  });

  it("n’a rien à faire dans les colonnes servies au public", () => {
    // La vue filtre le statut en SQL ; la liste des colonnes, elle, ne porte
    // ni prix d'achat ni stock chiffré, et c'est une autre garantie.
    for (const interdite of COLONNES_INTERDITES_AU_PUBLIC) {
      expect(COLONNES_VITRINE).not.toContain(interdite);
    }
  });
});

describe("l’article masqué", () => {
  const masque = { actif: true, statut_vitrine: "masque" };

  it("disparaît des yeux des clients", () => {
    expect(visibleEnVitrine(masque, MAINTENANT)).toBe(false);
  });

  it("mais se vend toujours au comptoir : c’est exactement ce qu’on lui demande", () => {
    expect(vendableAuComptoir(masque)).toBe(true);
  });
});

describe("l’article retiré", () => {
  it("`actif = false` a le dernier mot, quel que soit le statut de vitrine", () => {
    for (const statut of ["brouillon", "publie", "masque"]) {
      expect(visibleEnVitrine({ actif: false, statut_vitrine: statut }, MAINTENANT)).toBe(false);
      expect(vendableAuComptoir({ actif: false, statut_vitrine: statut })).toBe(false);
    }
  });

  it("l’inverse n’est pas vrai : un article actif peut ne rien montrer", () => {
    expect(vendableAuComptoir({ actif: true, statut_vitrine: "masque" })).toBe(true);
    expect(visibleEnVitrine({ actif: true, statut_vitrine: "masque" }, MAINTENANT)).toBe(false);
  });
});

describe("la date de publication", () => {
  it("retient un article publié dont la date n’est pas passée", () => {
    const article = { actif: true, statut_vitrine: "publie", date_publication: "2026-12-01T00:00:00Z" };
    expect(visibleEnVitrine(article, MAINTENANT)).toBe(false);
  });

  it("le laisse paraître une fois la date atteinte", () => {
    const article = { actif: true, statut_vitrine: "publie", date_publication: "2026-10-01T00:00:00Z" };
    expect(visibleEnVitrine(article, MAINTENANT)).toBe(true);
  });

  it("une date absente ne retient rien", () => {
    expect(publicationAtteinte(null, MAINTENANT)).toBe(true);
    expect(publicationAtteinte("", MAINTENANT)).toBe(true);
  });
});

// ── Les deux chemins d'auto-publication ───────────────────────────────────

describe("publication par la date", () => {
  const brouillon = (date: string | null) => ({
    actif: true, statut_vitrine: "brouillon", date_publication: date,
  });

  it("publie le brouillon dont la date est arrivée", () => {
    expect(doitPublierParDate(brouillon("2026-10-01T00:00:00Z"), MAINTENANT)).toBe(true);
  });

  it("ne publie pas avant l’heure", () => {
    expect(doitPublierParDate(brouillon("2026-12-01T00:00:00Z"), MAINTENANT)).toBe(false);
  });

  it("ne publie rien sans date", () => {
    expect(doitPublierParDate(brouillon(null), MAINTENANT)).toBe(false);
  });

  it("est idempotente : un article déjà publié ne se republie pas", () => {
    const publie = { actif: true, statut_vitrine: "publie", date_publication: "2026-10-01T00:00:00Z" };
    expect(doitPublierParDate(publie, MAINTENANT)).toBe(false);
  });

  it("ne réveille pas un article retiré", () => {
    expect(doitPublierParDate({ ...brouillon("2026-10-01T00:00:00Z"), actif: false }, MAINTENANT))
      .toBe(false);
  });
});

describe("publication par l’entrée de stock", () => {
  const attend = {
    actif: true, statut_vitrine: "brouillon", publier_a_l_entree_stock: true,
  };

  it("publie quand la première entrée le rend disponible", () => {
    expect(doitPublierParStock(attend, 0, 12)).toBe(true);
  });

  it("ne publie pas sur un réassort d’un article déjà disponible", () => {
    // La condition n'est pas « une entrée a eu lieu » mais « il n'y en avait
    // pas, il y en a » — celle du retour en stock d'APP 13h.
    expect(doitPublierParStock(attend, 3, 15)).toBe(false);
  });

  it("ne publie pas si la case n’est pas cochée", () => {
    expect(doitPublierParStock({ ...attend, publier_a_l_entree_stock: false }, 0, 12)).toBe(false);
  });

  it("est idempotente : la deuxième livraison ne trouve plus de brouillon", () => {
    expect(doitPublierParStock({ ...attend, statut_vitrine: "publie" }, 0, 12)).toBe(false);
  });

  it("les deux chemins se CUMULENT sur un même article", () => {
    const deux = { ...attend, date_publication: "2026-10-01T00:00:00Z" };
    expect(doitPublierParDate(deux, MAINTENANT)).toBe(true);
    expect(doitPublierParStock(deux, 0, 5)).toBe(true);
    expect(mentionPublicationProgrammee(deux))
      .toBe("Se publiera tout seul à la date prévue ou à la première entrée de stock.");
  });

  it("le journal distingue les deux déclencheurs", () => {
    expect(evenementPublication("date")).toBe("publication_auto_date");
    expect(evenementPublication("entree_stock")).toBe("publication_auto_stock");
  });

  it("un article publié n’annonce aucune publication à venir", () => {
    expect(mentionPublicationProgrammee({ actif: true, statut_vitrine: "publie" })).toBeNull();
  });
});

// ── Le compteur de brouillons ─────────────────────────────────────────────

describe("le compteur de la liste", () => {
  const articles = [
    { actif: true, statut_vitrine: "brouillon" },
    { actif: true, statut_vitrine: "brouillon" },
    { actif: true, statut_vitrine: "publie" },
    { actif: true, statut_vitrine: "masque" },
    // Un article retiré n'est plus en préparation : il est sorti.
    { actif: false, statut_vitrine: "brouillon" },
  ];

  it("compte par statut, sans les articles retirés", () => {
    expect(compterParStatut(articles)).toEqual({ brouillon: 2, publie: 1, masque: 1 });
  });

  it("s’écrit au singulier comme au pluriel, et se tait à zéro", () => {
    expect(libelleCompteBrouillons(4)).toBe("4 brouillons");
    expect(libelleCompteBrouillons(1)).toBe("1 brouillon");
    expect(libelleCompteBrouillons(0)).toBeNull();
  });
});
