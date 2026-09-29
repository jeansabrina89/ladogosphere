import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * APP 53 — ce que l'adhésion donne vraiment, dit au client.
 *
 * ── L'ERREUR QUI ÉTAIT ÉCRITE ─────────────────────────────────────────────
 *
 * Le rappel d'adhésion promettait des « tarifs préférentiels » et des « tarifs
 * membres ». C'était faux, et vérifiablement :
 * `resoudrePrixUnitaire` (src/lib/calculTarif.ts) ne regarde PLUS `est_membre`
 * — toute réservation est facturée au tarif membre, les tarifs non-membres
 * sont désactivés en base. L'adhésion n'abaisse aucun prix : elle ouvre le
 * DROIT DE RÉSERVER (`reservationAutorisee`, `MESSAGE_ADHESION_REQUISE`).
 *
 * Promettre une remise inexistante dans le message même qui demande de payer
 * est la seule chose que ce rappel ne pouvait pas se permettre. D'où ce test :
 * il lit l'e-mail RENDU, celui que la cliente reçoit, pas une constante.
 *
 * « Priorité lors des périodes chargées » est retiré pour la même raison :
 * aucune règle de l'application ne l'applique.
 */

const H = vi.hoisted(() => ({ html: [] as string[] }));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (p: { html: string }) => {
        H.html.push(p.html);
        return { data: { id: "re_test" }, error: null };
      },
    };
  },
}));

vi.mock("@/src/lib/supabase-admin", () => {
  function from() {
    const chain = {
      select: () => chain,
      eq: () => chain,
      insert: () => Promise.resolve({ error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    };
    return chain;
  }
  return { supabaseAdmin: { from } };
});

vi.mock("@/src/lib/entiteJuridique", () => ({ entiteA: async () => ({}) }));
vi.mock("@/src/lib/entiteJuridiqueLogique", () => ({ raisonSocialeAffichee: () => "La Dogosphère" }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import { envoyerEmailRappelCotisation } from "@/src/lib/email";

async function rendre(variante: "echue" | "rappel"): Promise<string> {
  H.html = [];
  await envoyerEmailRappelCotisation({
    email: "client@exemple.ch", prenom: "Camille", nom: "Rey",
    date_fin: "2026-08-31", montant: 200,
    iban: "CH00 0000 0000 0000 0000 0", titulaire: "Sabrina Jean",
    variante,
  });
  expect(H.html).toHaveLength(1);
  return H.html[0];
}

beforeEach(() => {
  H.html = [];
});

const VARIANTES = ["echue", "rappel"] as const;

describe("le rappel d’adhésion ne promet plus de prix", () => {
  it("aucune des deux variantes ne parle de tarif ni de priorité", async () => {
    for (const variante of VARIANTES) {
      const html = await rendre(variante);
      expect(html, variante).not.toContain("tarifs membres");
      expect(html, variante).not.toContain("préférentiel");
      expect(html, variante).not.toContain("Priorité");
      // Le filet large : aucune promesse de prix, sous aucune forme.
      expect(html, variante).not.toMatch(/tarif[s]? (membre|préférentiel)/i);
    }
  });

  it("« echue » : renouveler, c’est continuer à réserver", async () => {
    const html = await rendre("echue");
    expect(html).toContain(
      "Renouvelez-la pour continuer à réserver les séjours et la garderie de votre compagnon.",
    );
  });

  it("« rappel » : ce qu’on perd est nommé, et c’est l’accès", async () => {
    /**
     * La phrase demandée mot pour mot. Elle dit une conséquence vraie — sans
     * adhésion, `reservationAutorisee` refuse — là où l'ancienne annonçait une
     * hausse de prix qui n'avait jamais lieu.
     */
    const html = await rendre("rappel");
    expect(html).toContain("Sans renouvellement, vous n'avez plus accès aux réservations.");
  });

  it("les deux variantes nomment bien l’échéance", async () => {
    // Le garde-fou du garde-fou : si l'interpolation cassait, les assertions
    // ci-dessus passeraient sur un e-mail vide de tout.
    for (const variante of VARIANTES) {
      const html = await rendre(variante);
      expect(html, variante).toContain("31 août 2026");
      expect(html, variante).toContain("Camille");
    }
  });
});

describe("l’encadré des avantages ne garde que le vérifiable", () => {
  it("les trois lignes, mot pour mot", async () => {
    const html = await rendre("echue");
    expect(html).toContain("🐾 Avantages membres");
    expect(html).toContain("✔ Accès aux réservations de séjours et de garderie");
    expect(html).toContain("✔ Accès aux réservations d'urgence");
    expect(html).toContain("✔ Remise membre sur certains rayons de la boutique");
  });

  it("et rien d’autre : trois coches, pas quatre", async () => {
    /**
     * Sans ce compte, on pourrait rajouter une quatrième promesse sans qu'aucun
     * test ne bronche — et c'est exactement ainsi que « Priorité lors des
     * périodes chargées » s'était installée.
     */
    const html = await rendre("echue");
    const debut = html.indexOf("🐾 Avantages membres");
    const encadre = html.slice(debut, html.indexOf("</div>", debut));
    expect(encadre.split("✔")).toHaveLength(4);
  });
});
