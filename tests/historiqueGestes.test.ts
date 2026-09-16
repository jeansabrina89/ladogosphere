import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/src/lib/supabase-admin", () => ({ supabaseAdmin: {} }));

const { default: HistoriqueGestes, LIGNES_VISIBLES } = await import("@/app/components/HistoriqueGestes");
const { default: PointageFait } = await import("@/app/components/PointageFait");
const { default: ResultatEssaiSaisi } = await import("@/app/components/ResultatEssaiSaisi");
const { libelleEvenement } = await import("@/src/lib/journalEvenements");
const { formatHorodatage, instantUtc } = await import("@/src/lib/dates");
const { ecart, ecartModificationReservation } = await import("@/src/lib/journalLogique");
type LigneHistorique = import("@/src/lib/journalEvenements").LigneHistorique;

/** L'historique d'une fiche, tel que l'équipe le lit. */

const SJ = { texte: "SJ", titre: "Sabrina Jean", genre: "personnel" as const };

function ligne(i: number, p: Partial<LigneHistorique> = {}): LigneHistorique {
  return {
    id: `l${i}`, entite: "reservation", evenement: "depart", libelle: "Départ", motif: null,
    // 14.09.2026 15:32 UTC = 17:32 à Zurich (heure d'été).
    created_at: `2026-09-14T15:${String(32 - i).padStart(2, "0")}:00Z`,
    userId: "u1", auteur: SJ, avant: null, apres: null, ...p,
  };
}

describe("formatHorodatage", () => {
  it("écrit la date et l'heure de Zurich, pièce par pièce", () => {
    expect(formatHorodatage("2026-09-14T15:32:00Z")).toBe("14.09.2026 17:32");
    expect(formatHorodatage("2026-01-05T08:03:00Z")).toBe("05.01.2026 09:03");
    expect(formatHorodatage(null)).toBe("");
  });

  it("une colonne sans fuseau, remplie en UTC, se lit comme UTC", () => {
    expect(instantUtc("2026-09-16T12:32:05.123")).toBe("2026-09-16T12:32:05.123Z");
    expect(instantUtc("2026-09-16 12:32:05")).toBe("2026-09-16T12:32:05Z");
    expect(instantUtc("2026-09-16T12:32:05+00:00")).toBe("2026-09-16T12:32:05+00:00");
    expect(instantUtc("2026-09-16T12:32:05Z")).toBe("2026-09-16T12:32:05Z");
    expect(instantUtc(null)).toBeNull();
    expect(formatHorodatage(instantUtc("2026-09-16T12:32:00"))).toBe("16.09.2026 14:32");
  });
});

describe("HistoriqueGestes", () => {
  it("« 14.09.2026 17:32 · Départ · SJ », le nom complet au survol", () => {
    const html = renderToStaticMarkup(createElement(HistoriqueGestes, { lignes: [ligne(0)] }));
    expect(html).toContain("Historique");
    expect(html.replace(/<[^>]+>/g, "")).toContain("14.09.2026 17:32 · Départ · SJ");
    expect(html).toContain('title="Sabrina Jean"');
  });

  it("« automatique » pour un cron, « client » pour un geste du client, le motif affiché", () => {
    const html = renderToStaticMarkup(createElement(HistoriqueGestes, {
      lignes: [
        ligne(0, { libelle: "Demande de paiement envoyée", auteur: { texte: "automatique", titre: null, genre: "automatique" } }),
        ligne(1, { libelle: "Réservation créée", auteur: { texte: "client", titre: null, genre: "client" }, motif: "Seconde journée forcée" }),
      ],
    }));
    const texte = html.replace(/<[^>]+>/g, "");
    expect(texte).toContain("Demande de paiement envoyée · automatique");
    expect(texte).toContain("Réservation créée · client");
    expect(texte).toContain("Seconde journée forcée");
  });

  it("au-delà de 8 lignes, les plus anciennes se replient", () => {
    expect(LIGNES_VISIBLES).toBe(8);
    const html8 = renderToStaticMarkup(createElement(HistoriqueGestes, { lignes: Array.from({ length: 8 }, (_, i) => ligne(i)) }));
    expect(html8).not.toContain("<details");
    const html11 = renderToStaticMarkup(createElement(HistoriqueGestes, { lignes: Array.from({ length: 11 }, (_, i) => ligne(i)) }));
    expect(html11).toContain("<details");
    expect(html11).toContain("Voir les 3 lignes plus anciennes");
    // Les 8 plus récentes avant le repli.
    const avant = html11.split("<details")[0];
    expect(avant).toContain("17:32");
    expect(avant).not.toContain("17:22");
  });

  it("vide : le dit", () => {
    expect(renderToStaticMarkup(createElement(HistoriqueGestes, { lignes: [] }))).toContain("Aucun geste enregistré");
  });
});

describe("PointageFait et ResultatEssaiSaisi", () => {
  it("rien tant que le pointage n'est pas fait ; l'heure et les initiales sinon", () => {
    expect(renderToStaticMarkup(createElement(PointageFait, { verbe: "Arrivé", le: null, geste: null }))).toBe("");
    const html = renderToStaticMarkup(createElement(PointageFait, {
      verbe: "Arrivé", le: "2026-09-14T06:12:00Z", geste: { le: "2026-09-14T06:12:00Z", auteur: SJ },
    }));
    expect(html.replace(/<[^>]+>/g, "")).toBe("Arrivé à 08:12 · SJ");
  });

  it("« Validé le … par SJ »", () => {
    const html = renderToStaticMarkup(createElement(ResultatEssaiSaisi, {
      statut: "valide", le: "2026-09-14T15:32:00Z", auteur: SJ,
    }));
    expect(html.replace(/<[^>]+>/g, "")).toBe("Validé le 14.09.2026 17:32 par SJ");
  });
});

describe("les libellés des gestes", () => {
  it("un même code se lit selon son entité", () => {
    expect(libelleEvenement("annulation", "reservation")).toBe("Réservation annulée");
    expect(libelleEvenement("annulation", "depense")).toBe("Annulée par contre-écriture");
    expect(libelleEvenement("depart", "reservation")).toBe("Départ");
    expect(libelleEvenement("paiement", "paiement")).toBe("Encaissement");
    expect(libelleEvenement("code_inconnu", "reservation")).toBe("code_inconnu");
  });
});

describe("ce qu'une modification retient", () => {
  it("seulement les champs qui ont bougé", () => {
    expect(ecart({ nom: "Rex", poids: "12", race: "" }, { nom: "Rex", poids: 12, race: null })).toBeNull();
    expect(ecart({ nom: "Rex", poids: 12 }, { nom: "Max", poids: 12 })).toEqual({
      avant: { nom: "Rex" }, apres: { nom: "Max" },
    });
  });

  it("les heures se comparent comme elles se lisent", () => {
    expect(ecartModificationReservation(
      { heure_arrivee: "09:00:00", date_debut: "2026-09-14" },
      { heure_arrivee: "09:00", date_debut: "2026-09-14" },
    )).toBeNull();
    expect(ecartModificationReservation(
      { box_id: "a", date_fin: "2026-09-15" },
      { box_id: "b", date_fin: "2026-09-15" },
    )).toEqual({ avant: { box_id: "a" }, apres: { box_id: "b" } });
  });
});
