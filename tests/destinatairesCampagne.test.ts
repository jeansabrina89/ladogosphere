import { describe, it, expect } from "vitest";
import { trierDestinataires, type ClientCampagne } from "../src/lib/destinatairesCampagne";

const c = (id: string, over: Partial<ClientCampagne> = {}): ClientCampagne => ({
  id, email: `${id}@example.test`, actif: true, emails_info_ok: true, ...over,
});

const ids = (l: ClientCampagne[]) => l.map((x) => x.id).sort();

describe("cible : tous les clients", () => {
  it("un client actif et consentant reçoit le message", () => {
    const { destinataires, exclus } = trierDestinataires([c("a")], "tous_clients");
    expect(ids(destinataires)).toEqual(["a"]);
    expect(exclus).toHaveLength(0);
  });

  it("un client qui a refusé les informations est exclu, et compté comme tel", () => {
    const { destinataires, exclus } = trierDestinataires(
      [c("a"), c("b", { emails_info_ok: false })], "tous_clients");
    expect(ids(destinataires)).toEqual(["a"]);
    expect(ids(exclus)).toEqual(["b"]);
  });

  it("un client inactif ne reçoit rien et n'est pas compté comme refus", () => {
    const { destinataires, exclus } = trierDestinataires([c("a", { actif: false })], "tous_clients");
    expect(destinataires).toHaveLength(0);
    expect(exclus).toHaveLength(0);
  });

  it("un client inactif ET refusant n'est pas compté deux fois", () => {
    const { destinataires, exclus } = trierDestinataires(
      [c("a", { actif: false, emails_info_ok: false })], "tous_clients");
    expect(destinataires).toHaveLength(0);
    expect(exclus).toHaveLength(0);
  });

  it("un client sans adresse est ignoré", () => {
    for (const email of [null, "", "   "]) {
      const { destinataires, exclus } = trierDestinataires([c("a", { email })], "tous_clients");
      expect(destinataires).toHaveLength(0);
      expect(exclus).toHaveLength(0);
    }
  });

  it("actif null vaut actif, emails_info_ok null vaut consentant", () => {
    const { destinataires } = trierDestinataires(
      [c("a", { actif: null, emails_info_ok: null })], "tous_clients");
    expect(ids(destinataires)).toEqual(["a"]);
  });
});

describe("cible : membres à jour", () => {
  const liste = [c("membre"), c("simple"), c("membre_refus", { emails_info_ok: false })];
  const aJour = new Set(["membre", "membre_refus"]);

  it("seuls les membres à jour sont visés", () => {
    const { destinataires } = trierDestinataires(liste, "membres_actifs", aJour);
    expect(ids(destinataires)).toEqual(["membre"]);
  });

  it("un membre à jour qui refuse est compté dans les exclus", () => {
    const { exclus } = trierDestinataires(liste, "membres_actifs", aJour);
    expect(ids(exclus)).toEqual(["membre_refus"]);
  });

  it("un non-membre qui refuse n'est pas compté : il n'était pas visé", () => {
    const { destinataires, exclus } = trierDestinataires(
      [c("simple", { emails_info_ok: false })], "membres_actifs", new Set());
    expect(destinataires).toHaveLength(0);
    expect(exclus).toHaveLength(0);
  });

  it("sans membre à jour, personne n'est visé", () => {
    const { destinataires, exclus } = trierDestinataires(liste, "membres_actifs", new Set());
    expect(destinataires).toHaveLength(0);
    expect(exclus).toHaveLength(0);
  });
});

describe("l'aperçu et l'envoi comptent la même chose", () => {
  const liste = [
    c("a"), c("b", { emails_info_ok: false }), c("c", { actif: false }),
    c("d", { email: null }), c("e"),
  ];

  it("deux appels successifs donnent le même tri", () => {
    const un = trierDestinataires(liste, "tous_clients");
    const deux = trierDestinataires(liste, "tous_clients");
    expect(ids(un.destinataires)).toEqual(ids(deux.destinataires));
    expect(ids(un.exclus)).toEqual(ids(deux.exclus));
  });

  it("destinataires et exclus ne se recoupent jamais", () => {
    const { destinataires, exclus } = trierDestinataires(liste, "tous_clients");
    const communs = ids(destinataires).filter((x) => ids(exclus).includes(x));
    expect(communs).toEqual([]);
  });

  it("le tri ne perd personne parmi les joignables de la cible", () => {
    const { destinataires, exclus } = trierDestinataires(liste, "tous_clients");
    const joignables = liste.filter((x) => x.actif !== false && (x.email ?? "").trim() !== "");
    expect(destinataires.length + exclus.length).toBe(joignables.length);
  });

  it("liste vide : rien, sans erreur", () => {
    expect(trierDestinataires([], "tous_clients")).toEqual({ destinataires: [], exclus: [] });
  });
});
