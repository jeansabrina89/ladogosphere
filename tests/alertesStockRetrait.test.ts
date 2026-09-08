import { describe, it, expect } from "vitest";
import {
  ordreDeNotification,
  filtrerAttentes,
  resumeParArticle,
  estRetiree,
  compterRetirees,
  libelleRetirees,
  MESSAGE_RETRAIT,
  RAISON_RETIREE,
  type LigneAlerte,
} from "@/src/lib/alertesStockLogique";

/**
 * Le retrait d'une alerte : on efface la PERSONNE, on garde la DEMANDE.
 *
 * Ces tests couvrent le seul vrai risque du changement — qu'une ligne retirée
 * repasse pour une inscription vivante et qu'on écrive à une adresse qu'on a
 * promis d'effacer.
 */

describe("une ligne retirée n'est JAMAIS notifiée", () => {
  /**
   * Une ligne retirée garde `notifie_le` à null, exactement comme quelqu'un
   * qui attend. Sans la condition sur `retire_le`, elle serait notifiée. Ce
   * test doit échouer si cette condition disparaît.
   */
  const retiree: LigneAlerte = {
    id: "r", article_id: "a1", email: null,
    cree_le: "2026-01-01T09:00:00Z", notifie_le: null, retire_le: "2026-02-01T10:00:00Z",
  };
  const vivante: LigneAlerte = {
    id: "v", article_id: "a1", email: "marie@example.ch",
    cree_le: "2026-01-02T09:00:00Z", notifie_le: null,
  };

  it("elle est écartée de l'ordre de notification", () => {
    expect(ordreDeNotification([retiree, vivante]).map((l) => l.id)).toEqual(["v"]);
  });

  it("même si elle est la plus ancienne et n'a jamais été prévenue", () => {
    expect(retiree.notifie_le).toBeNull();
    expect(retiree.cree_le < vivante.cree_le).toBe(true);
    expect(ordreDeNotification([retiree])).toEqual([]);
  });

  it("et même si une adresse survivait au retrait", () => {
    // Ceinture et bretelles : `retire_le` suffit à écarter la ligne, quoi
    // qu'il reste dans les autres colonnes.
    const bancale = { ...retiree, email: "marie@example.ch" };
    expect(ordreDeNotification([bancale])).toEqual([]);
  });

  it("une ligne sans adresse n'est jamais notifiée non plus", () => {
    const sansAdresse: LigneAlerte = { ...vivante, id: "s", email: null };
    expect(ordreDeNotification([sansAdresse])).toEqual([]);
  });

  it("estRetiree ne se laisse pas berner par un champ absent", () => {
    expect(estRetiree({ retire_le: "2026-02-01" })).toBe(true);
    expect(estRetiree({ retire_le: null })).toBe(false);
    expect(estRetiree({})).toBe(false);
  });
});

describe("l'état exact d'une ligne retirée", () => {
  /** Ce que `annulerAlerte` écrit — la forme attendue en base. */
  const RETRAIT = { email: null, client_id: null, token: null, retire_le: "2026-02-01T10:00:00Z" };

  const avant = {
    id: "1", article_id: "art", client_id: "c1", email: "marie@example.ch",
    cree_le: "2026-01-01T09:00:00Z", notifie_le: "2026-01-20T08:00:00Z",
    token: "11111111-1111-1111-1111-111111111111", retire_le: null,
  };
  const apres = { ...avant, ...RETRAIT };

  it("les trois données personnelles sont effacées", () => {
    expect(apres.email).toBeNull();
    expect(apres.client_id).toBeNull();
    expect(apres.token).toBeNull();
  });

  it("le jeton effacé rend le lien de l'e-mail inopérant", () => {
    expect(apres.token).toBeNull();
  });

  it("la demande, elle, reste entière", () => {
    expect(apres.article_id).toBe(avant.article_id);
    expect(apres.cree_le).toBe(avant.cree_le);
    expect(apres.notifie_le).toBe(avant.notifie_le);
    expect(apres.retire_le).toBe(RETRAIT.retire_le);
  });

  it("et la ligne existe toujours : rien n'a été supprimé", () => {
    expect(apres.id).toBe(avant.id);
  });
});

describe("se réinscrire après un retrait", () => {
  /**
   * L'index unique ne porte plus que sur les lignes qui ont ENCORE une adresse
   * (`where notifie_le is null and email is not null`). Une ligne retirée ne
   * bloque donc personne.
   */
  const enAttenteAvecAdresse = (lignes: LigneAlerte[]) =>
    lignes.filter((l) => l.notifie_le === null && l.email !== null);

  it("la ligne retirée ne compte plus dans l'unicité", () => {
    const retiree: LigneAlerte = {
      id: "1", article_id: "art", email: null,
      cree_le: "2026-01-01", notifie_le: null, retire_le: "2026-02-01",
    };
    const nouvelle: LigneAlerte = {
      id: "2", article_id: "art", email: "marie@example.ch",
      cree_le: "2026-03-01", notifie_le: null,
    };
    expect(enAttenteAvecAdresse([retiree, nouvelle])).toHaveLength(1);
  });

  it("la même personne repart de zéro : nouvelle ligne, nouvelle date", () => {
    const nouvelle: LigneAlerte = {
      id: "2", article_id: "art", email: "marie@example.ch",
      cree_le: "2026-03-01", notifie_le: null,
    };
    expect(nouvelle.retire_le).toBeUndefined();
    expect(ordreDeNotification([nouvelle]).map((l) => l.id)).toEqual(["2"]);
  });
});

describe("les deux compteurs de l'écran Attentes", () => {
  const l = (
    id: string, notifie: string | null, retire: string | null = null, cree = "2026-01-01"
  ): LigneAlerte => ({
    id, article_id: "collier", email: retire ? null : `${id}@x.ch`,
    cree_le: cree, notifie_le: notifie, retire_le: retire,
  });

  const jeu = [
    l("1", null, null, "2026-01-03"),           // attend
    l("2", null, null, "2026-01-01"),           // attend
    l("3", "2026-02-01"),                        // prévenue
    l("4", null, "2026-02-05", "2026-01-02"),   // retirée avant notification
    l("5", "2026-02-01", "2026-02-06"),          // prévenue puis retirée
  ];

  it("le RÉASSORT compte les retirées : la demande a existé", () => {
    const [r] = resumeParArticle(jeu);
    expect(r.total).toBe(5);
    expect(r.retirees).toBe(2);
  });

  it("mais elles ne passent pas pour des gens en attente", () => {
    const [r] = resumeParArticle(jeu);
    expect(r.enAttente).toBe(2);
    expect(r.notifiees).toBe(1);
    expect(r.enAttente + r.notifiees + r.retirees).toBe(r.total);
  });

  it("et une demande retirée ne date pas l'attente", () => {
    // La retirée du 2 janvier est plus ancienne que les deux qui attendent :
    // elle ne doit pas faire remonter « depuis ».
    const [r] = resumeParArticle(jeu);
    expect(r.depuis).toBe("2026-01-01");
  });

  it("la LISTE nominative n'en montre aucune, quel que soit le filtre", () => {
    expect(filtrerAttentes(jeu, "en_attente").map((x) => x.id)).toEqual(["1", "2"]);
    expect(filtrerAttentes(jeu, "notifiees").map((x) => x.id)).toEqual(["3"]);
    expect(filtrerAttentes(jeu, "toutes").map((x) => x.id)).toEqual(["1", "2", "3"]);
  });

  it("elles se comptent à part", () => {
    expect(compterRetirees(jeu)).toBe(2);
    expect(libelleRetirees(2)).toBe("2 demandes retirées");
    expect(libelleRetirees(1)).toBe("1 demande retirée");
    expect(libelleRetirees(0)).toBe("");
  });

  it("un article tout retiré ne réclame plus rien, mais garde sa trace", () => {
    const tout = [l("a", null, "2026-02-01"), l("b", null, "2026-02-02")];
    const [r] = resumeParArticle(tout);
    expect(r).toMatchObject({ enAttente: 0, notifiees: 0, retirees: 2, total: 2, depuis: null });
    expect(filtrerAttentes(tout, "toutes")).toEqual([]);
  });
});

describe("le vocabulaire du retrait", () => {
  it("le message est exactement celui demandé, et ne parle pas de la trace", () => {
    expect(MESSAGE_RETRAIT).toBe(
      "Votre adresse a été effacée. Vous ne recevrez plus d'alerte pour cet article."
    );
    expect(MESSAGE_RETRAIT).not.toMatch(/trace|conserv|demande reste/i);
  });

  it("la raison du renvoi impossible dit pourquoi, pas « erreur »", () => {
    expect(RAISON_RETIREE).toMatch(/effacée/);
    expect(RAISON_RETIREE).not.toMatch(/erreur/i);
  });
});
