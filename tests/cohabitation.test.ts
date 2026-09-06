import { describe, it, expect } from "vitest";
import {
  choixCohabitationDe,
  cohabitationVerrouillee,
  occupeLeBoxSeul,
  estPrivatifPourSelection,
  chiensSeulsDansLeBox,
  selectionMixteRefusee,
  avertissementChienSeul,
  tousPetitsGabarits,
  estChoixCohabitation,
  LIBELLES_COHABITATION,
  MENTION_DECIDE_PAR_PENSION,
  type ChienCohabitation,
} from "../src/lib/cohabitation";

const FOYER = "cli-1";
const AUTRE_FOYER = "cli-2";

const chien = (p: Partial<ChienCohabitation> = {}): ChienCohabitation => ({
  id: "d1", nom: "Pixel", client_id: FOYER, categorie_poids: "15_30kg", ...p,
});

describe("libellés exacts", () => {
  it("les trois options du formulaire client", () => {
    expect(LIBELLES_COHABITATION.partage).toBe("Peut partager son box avec d'autres chiens");
    expect(LIBELLES_COHABITATION.famille).toBe("Seulement avec mes autres chiens");
    expect(LIBELLES_COHABITATION.seul).toBe("Doit être seul dans son box");
    expect(MENTION_DECIDE_PAR_PENSION).toBe("Décidé par la pension");
  });
  it("estChoixCohabitation filtre les valeurs", () => {
    expect(estChoixCohabitation("famille")).toBe(true);
    expect(estChoixCohabitation("autre")).toBe(false);
    expect(estChoixCohabitation(undefined)).toBe(false);
  });
});

describe("choixCohabitationDe", () => {
  it("par défaut : partage", () => {
    expect(choixCohabitationDe(chien())).toBe("partage");
    expect(choixCohabitationDe(null)).toBe("partage");
  });
  it("doit_etre_isole → seul", () => {
    expect(choixCohabitationDe(chien({ doit_etre_isole: true }))).toBe("seul");
  });
  it("privatif_obligatoire → seul", () => {
    expect(choixCohabitationDe(chien({ hebergement_autorise: "privatif_obligatoire" }))).toBe("seul");
  });
  it("famille_uniquement → famille", () => {
    expect(choixCohabitationDe(chien({ famille_uniquement: true }))).toBe("famille");
  });
  it("isolé prime sur famille", () => {
    expect(choixCohabitationDe(chien({ doit_etre_isole: true, famille_uniquement: true }))).toBe("seul");
  });
});

describe("cohabitationVerrouillee — la pension prime", () => {
  it("aucune restriction : libre", () => {
    expect(cohabitationVerrouillee(chien())).toBe(false);
  });
  it("privatif_obligatoire : toujours verrouillé", () => {
    expect(cohabitationVerrouillee(chien({ hebergement_autorise: "privatif_obligatoire" }))).toBe(true);
  });
  it("source pension : verrouillé", () => {
    expect(cohabitationVerrouillee(chien({ doit_etre_isole: true, cohabitation_source: "pension" }))).toBe(true);
    expect(cohabitationVerrouillee(chien({ famille_uniquement: true, cohabitation_source: "pension" }))).toBe(true);
  });
  it("restriction historique sans source : réputée venir de la pension", () => {
    expect(cohabitationVerrouillee(chien({ doit_etre_isole: true }))).toBe(true);
    expect(cohabitationVerrouillee(chien({ famille_uniquement: true }))).toBe(true);
  });
  it("restriction posée par le client : modifiable", () => {
    expect(cohabitationVerrouillee(chien({ doit_etre_isole: true, cohabitation_source: "client" }))).toBe(false);
    expect(cohabitationVerrouillee(chien({ famille_uniquement: true, cohabitation_source: "client" }))).toBe(false);
  });
  it("la pension verrouille même un chien sans restriction visible", () => {
    expect(cohabitationVerrouillee(chien({ cohabitation_source: "pension" }))).toBe(true);
  });
});

describe("occupeLeBoxSeul", () => {
  it("un chien « seul » occupe toujours le box", () => {
    const c = chien({ doit_etre_isole: true });
    expect(occupeLeBoxSeul(c, [c])).toBe(true);
  });
  it("un chien « partage » ne l'occupe jamais seul", () => {
    const c = chien();
    expect(occupeLeBoxSeul(c, [c])).toBe(false);
  });
  it("« famille » réservé SEUL occupe le box entier", () => {
    const c = chien({ famille_uniquement: true });
    expect(occupeLeBoxSeul(c, [c])).toBe(true);
  });
  it("« famille » réservé avec un compagnon du foyer partage", () => {
    const a = chien({ id: "a", famille_uniquement: true });
    const b = chien({ id: "b", famille_uniquement: true });
    expect(occupeLeBoxSeul(a, [a, b])).toBe(false);
    expect(occupeLeBoxSeul(b, [a, b])).toBe(false);
  });
  it("« famille » avec un chien d'un AUTRE foyer reste seul", () => {
    const a = chien({ id: "a", famille_uniquement: true });
    const etranger = chien({ id: "z", client_id: AUTRE_FOYER });
    expect(occupeLeBoxSeul(a, [a, etranger])).toBe(true);
  });
});

describe("estPrivatifPourSelection", () => {
  it("sélection vide : jamais privatif", () => {
    expect(estPrivatifPourSelection([])).toBe(false);
  });
  it("un chien ordinaire : pas privatif", () => {
    expect(estPrivatifPourSelection([chien()])).toBe(false);
  });
  it("un chien isolé : privatif", () => {
    expect(estPrivatifPourSelection([chien({ doit_etre_isole: true })])).toBe(true);
  });
  it("un « famille » seul : privatif", () => {
    expect(estPrivatifPourSelection([chien({ famille_uniquement: true })])).toBe(true);
  });
  it("deux « famille » du même foyer : PAS privatif (tarif 2 chiens)", () => {
    const a = chien({ id: "a", famille_uniquement: true });
    const b = chien({ id: "b", famille_uniquement: true });
    expect(estPrivatifPourSelection([a, b])).toBe(false);
  });
  it("trois « famille » du même foyer : PAS privatif (tarif 3 chiens)", () => {
    const trio = ["a", "b", "c"].map((id) => chien({ id, famille_uniquement: true }));
    expect(estPrivatifPourSelection(trio)).toBe(false);
  });
  it("deux chiens ordinaires du même foyer : pas privatif", () => {
    expect(estPrivatifPourSelection([chien({ id: "a" }), chien({ id: "b" })])).toBe(false);
  });
});

describe("chiensSeulsDansLeBox", () => {
  it("liste les chiens qui occupent un box entier", () => {
    const a = chien({ id: "a", nom: "Alpha", famille_uniquement: true });
    expect(chiensSeulsDansLeBox([a]).map((c) => c.nom)).toEqual(["Alpha"]);
  });
  it("vide quand tout le monde partage", () => {
    const a = chien({ id: "a", famille_uniquement: true });
    const b = chien({ id: "b", famille_uniquement: true });
    expect(chiensSeulsDansLeBox([a, b])).toEqual([]);
  });
});

describe("selectionMixteRefusee", () => {
  it("un seul chien : toujours accepté", () => {
    expect(selectionMixteRefusee([chien({ doit_etre_isole: true })])).toEqual({ ok: true });
  });
  it("plusieurs chiens sans isolé : accepté", () => {
    expect(selectionMixteRefusee([chien({ id: "a" }), chien({ id: "b" })])).toEqual({ ok: true });
  });
  it("un isolé mélangé à d'autres : refusé, en nommant le chien", () => {
    const r = selectionMixteRefusee([
      chien({ id: "a", nom: "Belle", doit_etre_isole: true }),
      chien({ id: "b", nom: "Nuage" }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain("Belle");
      expect(r.message).toContain("ne peut pas partager son box");
    }
  });
  it("deux « famille » du même foyer ne sont pas une sélection mixte", () => {
    const a = chien({ id: "a", famille_uniquement: true });
    const b = chien({ id: "b", famille_uniquement: true });
    expect(selectionMixteRefusee([a, b])).toEqual({ ok: true });
  });
});

describe("avertissementChienSeul", () => {
  it("reprend le nom et le prix", () => {
    const m = avertissementChienSeul("Belle", "70.00 CHF");
    expect(m).toBe("Belle occupe un box pour lui seul : vous payez les deux places, au tarif chien seul en box (70.00 CHF).");
  });
});

describe("tousPetitsGabarits", () => {
  it("vrai si tous < 15 kg", () => {
    expect(tousPetitsGabarits(["moins_15kg", "moins_15kg"])).toBe(true);
  });
  it("faux dès un gabarit plus grand", () => {
    expect(tousPetitsGabarits(["moins_15kg", "15_30kg"])).toBe(false);
  });
  it("faux sur une liste vide", () => {
    expect(tousPetitsGabarits([])).toBe(false);
  });
  it("un gabarit inconnu compte comme non petit", () => {
    expect(tousPetitsGabarits(["moins_15kg", null])).toBe(false);
  });
});
