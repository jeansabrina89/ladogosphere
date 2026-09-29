import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { CLES_SIGNATURE } from "@/src/lib/signatureEmail";

/**
 * APP 58 — qui a le droit de changer la signature de la maison.
 *
 * ── POURQUOI UN FICHIER À PART ────────────────────────────────────────────
 *
 * La route se monte avec ses propres doublures : la garde de permission et la
 * base. Les mêler à celles qui rendent un e-mail aurait donné un décor que
 * personne n'ose plus toucher.
 *
 * ── CE QUE CE FICHIER GARDE ───────────────────────────────────────────────
 *
 * Qu'une employée soit REFUSÉE, et surtout qu'elle soit refusée AVANT toute
 * écriture. Une garde posée après l'enregistrement rendrait bien un 403 — et
 * la signature aurait changé quand même.
 */

type Ecriture = { cle: string; valeur: string };

const H = vi.hoisted(() => ({
  estAdmin: true,
  ecritures: [] as Ecriture[],
  traces: [] as string[],
}));

vi.mock("@/src/lib/permissions", () => ({
  exigerAdminApi: async () =>
    H.estAdmin ? null : NextResponse.json({ error: "Réservé à l'administratrice." }, { status: 403 }),
}));

vi.mock("@/src/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  }),
}));

vi.mock("@/src/lib/supabase-admin", () => {
  function from() {
    const chain = {
      select: () => chain,
      eq: () => chain,
      upsert: (vals: { cle: string; valeur: string }) => {
        H.ecritures.push({ cle: vals.cle, valeur: vals.valeur });
        return chain;
      },
      maybeSingle: async () => ({ data: { valeur: "" }, error: null }),
      single: async () => ({ data: { id: "p1" }, error: null }),
    };
    return chain;
  }
  return { supabaseAdmin: { from } };
});

vi.mock("@/src/lib/journalEvenements", () => ({
  tracerEvenement: async (e: { evenement: string }) => { H.traces.push(e.evenement); },
}));

import { POST } from "@/app/api/emails/reglages/route";

const CORPS = {
  [CLES_SIGNATURE.nom]: "Camille Rey",
  [CLES_SIGNATURE.fonction]: "Responsable",
  [CLES_SIGNATURE.adresse]: "Sion, Valais, Suisse",
  [CLES_SIGNATURE.email]: "camille@exemple.ch",
  [CLES_SIGNATURE.telephone]: "",
  [CLES_SIGNATURE.site]: "https://ladogosphere.ch",
};

function requete(corps: Record<string, unknown>) {
  return new Request("https://exemple.ch/api/emails/reglages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  }) as never;
}

beforeEach(() => {
  H.estAdmin = true;
  H.ecritures = [];
  H.traces = [];
});

describe("seule l’administration modifie la signature", () => {
  it("UNE EMPLOYÉE EST REFUSÉE, et rien n’est écrit", async () => {
    H.estAdmin = false;
    const res = await POST(requete(CORPS));

    expect(res.status).toBe(403);
    // Le point qui compte : refusée AVANT l'écriture, pas après.
    expect(H.ecritures, "aucune écriture").toEqual([]);
    expect(H.traces, "aucune trace").toEqual([]);
  });

  it("l’administratrice enregistre les six clés", async () => {
    const res = await POST(requete(CORPS));
    expect(res.status).toBe(200);
    expect(H.ecritures.map((e) => e.cle).sort()).toEqual(Object.values(CLES_SIGNATURE).sort());
    expect(H.ecritures.find((e) => e.cle === CLES_SIGNATURE.nom)?.valeur).toBe("Camille Rey");
  });

  it("une saisie invalide est refusée AVANT toute écriture, et nomme le champ", async () => {
    const res = await POST(requete({ ...CORPS, [CLES_SIGNATURE.site]: "http://pas-securise.ch" }));
    const corps = await res.json();

    expect(res.status).toBe(400);
    expect(corps.error).toBe("Le site doit commencer par https://.");
    expect(corps.champ).toBe("site");
    // Six clés partent ensemble : en écrire trois puis refuser la quatrième
    // laisserait une signature à moitié changée.
    expect(H.ecritures).toEqual([]);
  });

  it("un e-mail invalide : même refus, même silence en base", async () => {
    const res = await POST(requete({ ...CORPS, [CLES_SIGNATURE.email]: "pasunemail" }));
    expect((await res.json()).error).toBe("L'e-mail affiché n'est pas valide.");
    expect(H.ecritures).toEqual([]);
  });

  it("un corps SANS clé de signature ne touche pas à la signature", async () => {
    /**
     * C'est le lien d'avis Google qui passe par là. Les deux réglages partagent
     * la route ; ils ne doivent pas se marcher dessus.
     */
    const res = await POST(requete({ avis_google_url: "https://g.page/r/CabcDEF/review" }));
    expect(res.status).toBe(200);
    expect(H.ecritures.map((e) => e.cle)).toEqual(["avis_google_url"]);
  });

  it("une clé inchangée n’encombre pas le journal", async () => {
    // La doublure rend "" pour l'ancienne valeur : seules les clés dont la
    // valeur change laissent une trace. Ici, le téléphone reste vide.
    await POST(requete(CORPS));
    expect(H.traces).not.toContain(CLES_SIGNATURE.telephone);
    expect(H.traces).toContain(CLES_SIGNATURE.nom);
  });
});
