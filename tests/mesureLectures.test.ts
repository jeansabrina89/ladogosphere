import { describe, it, expect } from "vitest";
import { cibleDeLaRequete, mesureActive, optionsMesure } from "@/src/lib/mesureLectures";

/**
 * APP 70 — l'instrumentation des lectures ne s'allume QUE pour une mesure
 * locale. Trois verrous, et il faut les trois.
 */
describe("la mesure des lectures", () => {
  it("est éteinte par défaut : le client Supabase est créé exactement comme avant", () => {
    expect(mesureActive({})).toBe(false);
    expect(optionsMesure()).toEqual({});
  });

  it("s'allume avec la variable ET un fichier, en local", () => {
    expect(mesureActive({ MESURE_LECTURES: "1", MESURE_FICHIER: "mesures/l.jsonl" })).toBe(true);
    expect(mesureActive({ MESURE_LECTURES: "1" })).toBe(false);
    expect(mesureActive({ MESURE_FICHIER: "mesures/l.jsonl" })).toBe(false);
  });

  it("reste éteinte sur Vercel, même si quelqu'un posait les deux autres", () => {
    expect(mesureActive({ MESURE_LECTURES: "1", MESURE_FICHIER: "x", VERCEL: "1" })).toBe(false);
  });

  it("ne garde de la requête que la table — ni les valeurs des filtres, ni rien d'autre", () => {
    expect(cibleDeLaRequete("https://x.supabase.co/rest/v1/clients?select=*&email=eq.sabrina%40exemple.ch"))
      .toBe("clients");
    expect(cibleDeLaRequete("https://x.supabase.co/rest/v1/rpc/emettre_facture")).toBe("rpc:emettre_facture");
    expect(cibleDeLaRequete("https://x.supabase.co/auth/v1/user")).toBe("auth:user");
    expect(cibleDeLaRequete("pas une url")).toBe("?");
  });
});
