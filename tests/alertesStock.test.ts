import { describe, it, expect } from "vitest";
import {
  alerteProposable,
  normaliserEmail,
  refusEmail,
  refusInscription,
  estRetourEnStock,
  disponibleDe,
  filtrerAttentes,
  resumeParArticle,
  ordreDeNotification,
  libelleAttentes,
  MENTION_SANS_RESERVATION,
  MODELE_RETOUR_EN_STOCK,
  META_RETOUR_EN_STOCK,
  type LigneAlerte,
} from "@/src/lib/alertesStockLogique";
import { trierDestinataires } from "@/src/lib/destinatairesCampagne";

/**
 * L'alerte de retour en stock.
 *
 * Trois choses ne doivent jamais se tromper : à qui on propose la case, quand
 * on décide que l'article « revient », et le fait qu'une reprise après échec
 * ne prévienne pas deux fois la même personne.
 */

const EPUISE = {
  type_article: "standard", vendable_en_ligne: true, actif: true, stock_disponible: 0,
};

describe("à qui l'on propose la case", () => {
  it("à un article vendu en ligne et réellement épuisé", () => {
    expect(alerteProposable(EPUISE)).toBe(true);
    expect(alerteProposable({ ...EPUISE, stock_disponible: -2 })).toBe(true);
  });

  it("jamais sur un article encore disponible", () => {
    expect(alerteProposable({ ...EPUISE, stock_disponible: 1 })).toBe(false);
    expect(alerteProposable({ ...EPUISE, stock_disponible: 12 })).toBe(false);
  });

  it("JAMAIS sur un article personnalisable : il se fabrique, il n'est pas en rupture", () => {
    expect(alerteProposable({ ...EPUISE, type_article: "personnalisable" })).toBe(false);
    // Même à zéro de stock : la disponibilité d'un sur-mesure vaut « Sur commande ».
    expect(alerteProposable({
      type_article: "personnalisable", vendable_en_ligne: true, actif: true, stock_disponible: 0,
    })).toBe(false);
  });

  it("pas sur un article absent de la vitrine, ni sur un article retiré", () => {
    expect(alerteProposable({ ...EPUISE, vendable_en_ligne: false })).toBe(false);
    expect(alerteProposable({ ...EPUISE, actif: false })).toBe(false);
  });

  it("pas sur rien du tout", () => {
    expect(alerteProposable(null)).toBe(false);
    expect(alerteProposable(undefined)).toBe(false);
  });
});

describe("l'adresse", () => {
  it("se compare et se range toujours sous la même forme", () => {
    expect(normaliserEmail("  Marie.Dupont@Example.CH ")).toBe("marie.dupont@example.ch");
    expect(normaliserEmail(null)).toBe("");
  });

  it("refuse ce qui ne peut manifestement pas être une adresse", () => {
    expect(refusEmail("")).toMatch(/Indiquez/);
    expect(refusEmail("marie")).toMatch(/valable/);
    expect(refusEmail("marie@exemple")).toMatch(/valable/);
    expect(refusEmail("marie @exemple.ch")).toMatch(/valable/);
    expect(refusEmail("a".repeat(250) + "@exemple.ch")).toMatch(/trop longue/);
  });

  it("accepte une adresse ordinaire", () => {
    expect(refusEmail("marie.dupont@example.ch")).toBeNull();
    expect(refusEmail("  MARIE@EXAMPLE.CH  ")).toBeNull();
  });
});

describe("le refus d'inscription dit ce qui cloche", () => {
  it("un article disponible n'a pas besoin d'alerte", () => {
    expect(refusInscription({ ...EPUISE, stock_disponible: 5 }, "marie@example.ch"))
      .toMatch(/disponible/);
  });

  it("un article sur mesure le dit avec ses mots", () => {
    expect(refusInscription({ ...EPUISE, type_article: "personnalisable" }, "marie@example.ch"))
      .toMatch(/fabrique à la commande/);
  });

  it("l'article passe avant l'adresse : on ne reproche pas l'e-mail d'abord", () => {
    expect(refusInscription({ ...EPUISE, stock_disponible: 5 }, "n'importe quoi"))
      .toMatch(/disponible/);
  });

  it("et sur un article épuisé, c'est l'adresse qui décide", () => {
    expect(refusInscription(EPUISE, "marie@example.ch")).toBeNull();
    expect(refusInscription(EPUISE, "pas une adresse")).toMatch(/valable/);
  });
});

describe("le déclenchement : le passage de ≤ 0 à > 0, et lui seul", () => {
  it("prévient quand l'article revient", () => {
    expect(estRetourEnStock(0, 5)).toBe(true);
    expect(estRetourEnStock(-3, 1)).toBe(true);
    expect(estRetourEnStock(0, 0.5)).toBe(true);
  });

  it("ne prévient PAS une entrée sur un article déjà disponible", () => {
    // C'est le cas qui compte : une livraison de dix pièces sur un article qui
    // en avait déjà trois ne réveille personne.
    expect(estRetourEnStock(3, 13)).toBe(false);
    expect(estRetourEnStock(1, 2)).toBe(false);
  });

  it("ne prévient pas quand le stock baisse, ni quand il reste à zéro", () => {
    expect(estRetourEnStock(5, 2)).toBe(false);
    expect(estRetourEnStock(5, 0)).toBe(false);
    expect(estRetourEnStock(0, 0)).toBe(false);
    expect(estRetourEnStock(0, -1)).toBe(false);
  });

  it("la disponibilité retire ce qui est déjà réservé", () => {
    // Trois en stock dont trois réservés : il n'y en a pas.
    expect(disponibleDe(3, 3)).toBe(0);
    expect(estRetourEnStock(disponibleDe(0, 0), disponibleDe(3, 3))).toBe(false);
    // Trois en stock dont un réservé : il en reste deux, l'article revient.
    expect(estRetourEnStock(disponibleDe(0, 0), disponibleDe(3, 1))).toBe(true);
  });

  it("ne se laisse pas berner par un nombre absent ou illisible", () => {
    expect(estRetourEnStock(null, 5)).toBe(true);
    expect(estRetourEnStock(undefined, undefined)).toBe(false);
    expect(estRetourEnStock("0", "4")).toBe(true);
    expect(estRetourEnStock(Number.NaN, 4)).toBe(false);
  });
});

describe("l'ordre et l'idempotence de la reprise", () => {
  const ligne = (id: string, cree_le: string, notifie_le: string | null = null): LigneAlerte => ({
    id, article_id: "a1", email: `${id}@example.ch`, cree_le, notifie_le,
  });

  it("le premier inscrit est le premier prévenu", () => {
    const lignes = [
      ligne("c", "2026-03-10T09:00:00Z"),
      ligne("a", "2026-01-05T09:00:00Z"),
      ligne("b", "2026-02-02T09:00:00Z"),
    ];
    expect(ordreDeNotification(lignes).map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("une reprise après échec ne reprend QUE les non notifiées", () => {
    // Deux e-mails sont partis, le troisième a échoué : notifie_le n'a été
    // rempli que pour les deux premiers.
    const apresEchec = [
      ligne("a", "2026-01-05T09:00:00Z", "2026-04-01T10:00:00Z"),
      ligne("b", "2026-02-02T09:00:00Z", "2026-04-01T10:00:01Z"),
      ligne("c", "2026-03-10T09:00:00Z", null),
    ];
    expect(ordreDeNotification(apresEchec).map((l) => l.id)).toEqual(["c"]);
  });

  it("une seconde reprise après succès complet ne renvoie rien", () => {
    const toutesNotifiees = [
      ligne("a", "2026-01-05T09:00:00Z", "2026-04-01T10:00:00Z"),
      ligne("c", "2026-03-10T09:00:00Z", "2026-04-01T10:05:00Z"),
    ];
    expect(ordreDeNotification(toutesNotifiees)).toEqual([]);
  });

  it("à date égale, l'ordre reste stable — jamais deux envois au hasard", () => {
    const memeSeconde = [ligne("b", "2026-01-01T09:00:00Z"), ligne("a", "2026-01-01T09:00:00Z")];
    expect(ordreDeNotification(memeSeconde).map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("l'unicité par article et par adresse", () => {
  /**
   * L'index unique partiel vit en base : on vérifie ici la RÈGLE qu'il porte,
   * pour qu'elle soit écrite et lisible ailleurs que dans une migration.
   *
   * (article_id, lower(email)) unique WHERE notifie_le is null.
   */
  const clef = (l: LigneAlerte) => `${l.article_id}|${normaliserEmail(l.email)}`;

  const enAttente = (lignes: LigneAlerte[]) => lignes.filter((l) => l.notifie_le === null);

  it("deux inscriptions non notifiées de la même adresse se confondent", () => {
    const a: LigneAlerte = { id: "1", article_id: "art", email: "Marie@Example.CH", cree_le: "2026-01-01", notifie_le: null };
    const b: LigneAlerte = { id: "2", article_id: "art", email: "  marie@example.ch ", cree_le: "2026-01-02", notifie_le: null };
    expect(clef(a)).toBe(clef(b));
  });

  it("mais une réinscription APRÈS notification est une ligne nouvelle et légitime", () => {
    const ancienne: LigneAlerte = { id: "1", article_id: "art", email: "marie@example.ch", cree_le: "2026-01-01", notifie_le: "2026-02-01" };
    const nouvelle: LigneAlerte = { id: "2", article_id: "art", email: "marie@example.ch", cree_le: "2026-03-01", notifie_le: null };
    // L'index ne regarde que les non notifiées : une seule ici, aucun conflit.
    expect(enAttente([ancienne, nouvelle])).toHaveLength(1);
  });

  it("la même adresse sur deux articles différents ne se confond pas", () => {
    const a: LigneAlerte = { id: "1", article_id: "art1", email: "marie@example.ch", cree_le: "2026-01-01", notifie_le: null };
    const b: LigneAlerte = { id: "2", article_id: "art2", email: "marie@example.ch", cree_le: "2026-01-01", notifie_le: null };
    expect(clef(a)).not.toBe(clef(b));
  });
});

describe("l'envoi ne dépend pas de emails_info_ok", () => {
  const desabonnee = {
    id: "c1", email: "marie@example.ch", prenom: "Marie", nom: "Dupont",
    actif: true, membre: false, emails_info_ok: false,
  };

  it("une personne désabonnée de tout est exclue des CAMPAGNES", () => {
    const res = trierDestinataires([desabonnee], "tous_clients");
    expect(res.destinataires).toHaveLength(0);
    expect(res.exclus).toHaveLength(1);
  });

  it("mais rien dans la logique d'alerte ne consulte emails_info_ok", () => {
    // L'alerte est TRANSACTIONNELLE : elle est sollicitée, pour un article
    // précis, par la personne qui la reçoit. Le consentement marketing ne la
    // gouverne pas — et ne l'atteint nulle part dans la décision d'envoyer.
    expect(refusInscription(EPUISE, desabonnee.email)).toBeNull();
    const ligne: LigneAlerte = {
      id: "1", article_id: "art", email: desabonnee.email,
      cree_le: "2026-01-01", notifie_le: null,
    };
    expect(ordreDeNotification([ligne])).toHaveLength(1);
  });

  it("et le code de l'alerte ne mentionne jamais emails_info_ok", async () => {
    const fs = await import("node:fs");
    for (const f of ["src/lib/alertesStockLogique.ts", "src/lib/alertesStock.ts"]) {
      expect(fs.readFileSync(f, "utf8"), f).not.toContain("emails_info_ok");
    }
  });
});

describe("le modèle d'e-mail", () => {
  it("« Retour en stock » est modifiable depuis l'écran des modèles", async () => {
    expect(META_RETOUR_EN_STOCK.type).toBe("retour_en_stock");
    expect(META_RETOUR_EN_STOCK.label).toBe("Retour en stock");
    expect([...META_RETOUR_EN_STOCK.variables]).toEqual(["article", "prix"]);
    // Et email.ts le reprend bien dans la liste que lit l'écran.
    const source = (await import("node:fs")).readFileSync("src/lib/email.ts", "utf8");
    expect(source).toContain("META_RETOUR_EN_STOCK");
    expect(source).toContain("MODELE_RETOUR_EN_STOCK");
  });

  it("son objet est « <Article> est de nouveau disponible »", () => {
    expect(MODELE_RETOUR_EN_STOCK.sujet).toBe("{article} est de nouveau disponible");
  });

  it("il a ses quatre champs, comme tous les autres", () => {
    const m = MODELE_RETOUR_EN_STOCK;
    for (const champ of ["sujet", "titre", "intro", "message_final"] as const) {
      expect(m[champ], champ).toBeTruthy();
    }
  });

  it("la phrase qui évite l'attente fausse est écrite une seule fois", () => {
    expect(MENTION_SANS_RESERVATION).toMatch(/ne met rien de côté/);
  });
});

describe("les attentes, côté pension", () => {
  const l = (id: string, article: string, notifie: string | null, cree = "2026-01-01"): LigneAlerte =>
    ({ id, article_id: article, email: `${id}@x.ch`, cree_le: cree, notifie_le: notifie });

  const jeu = [
    l("1", "collier", null, "2026-01-03"),
    l("2", "collier", null, "2026-01-01"),
    l("3", "collier", "2026-02-01"),
    l("4", "laisse", null, "2026-01-02"),
    l("5", "muselière", "2026-02-02"),
  ];

  it("le filtre sépare l'attente de la notification", () => {
    expect(filtrerAttentes(jeu, "en_attente").map((x) => x.id)).toEqual(["1", "2", "4"]);
    expect(filtrerAttentes(jeu, "notifiees").map((x) => x.id)).toEqual(["3", "5"]);
    expect(filtrerAttentes(jeu, "toutes")).toHaveLength(5);
  });

  it("le classement de réassort met devant ce qu'on attend le plus", () => {
    const r = resumeParArticle(jeu);
    expect(r.map((x) => x.article_id)).toEqual(["collier", "laisse", "muselière"]);
    expect(r[0]).toMatchObject({ enAttente: 2, notifiees: 1, total: 3, depuis: "2026-01-01" });
    // Un article dont tout le monde a été prévenu ne réclame plus rien.
    expect(r[2]).toMatchObject({ enAttente: 0, notifiees: 1, depuis: null });
  });

  it("le compteur s'accorde", () => {
    expect(libelleAttentes(0)).toBe("Personne n'attend cet article");
    expect(libelleAttentes(1)).toBe("1 personne attend cet article");
    expect(libelleAttentes(7)).toBe("7 personnes attendent cet article");
  });

  it("sur une liste vide, le résumé est vide — pas une ligne fantôme", () => {
    expect(resumeParArticle([])).toEqual([]);
  });
});
