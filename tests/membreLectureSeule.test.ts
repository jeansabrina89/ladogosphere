import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ligneAdhesionFiche } from "@/src/lib/membre";

/**
 * APP 57 — « Membre » se lit, il ne se coche plus.
 *
 * ── CE QUE LA CASE PERMETTAIT ─────────────────────────────────────────────
 *
 * L'équipe pouvait cocher « ⭐ Membre » sur une fiche client. Le statut se met
 * pourtant à jour tout seul à l'encaissement de l'adhésion. Cocher à la main
 * créait donc un membre SANS cotisation : la fiche affichait « membre », aucune
 * période ne le justifiait, et l'écart ne se voyait qu'en cherchant pourquoi
 * aucun renouvellement n'était jamais réclamé (décision de Sabrina,
 * 29.09.2026).
 *
 * ── CE QUE CE FICHIER GARDE ───────────────────────────────────────────────
 *
 * Le point qui compte n'est pas que la case ait disparu de l'écran : c'est que
 * le CHAMP ne soit plus lu côté serveur. Une case retirée du HTML se rajoute
 * dans une requête forgée ; un champ que l'action ne lit pas ne se force pas.
 * Les tests montent donc les deux actions et regardent ce qui part vraiment
 * vers la base.
 */

// ── Le décor : on capture ce qui part en base ─────────────────────────────

type Ligne = Record<string, unknown>;

const H = vi.hoisted(() => ({
  update: null as Ligne | null,
  insert: null as Ligne | null,
  estAdmin: true,
}));

vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("@/src/lib/verifierPermission", () => ({
  verifierPermission: async () => ({ userId: "u1", isAdmin: H.estAdmin }),
}));
vi.mock("@/src/lib/journalEvenements", () => ({ tracerEvenement: async () => undefined }));
vi.mock("@/src/lib/compteAuth", () => ({
  compteAuthParEmail: async () => ({ ok: true, id: null }),
}));

vi.mock("@/src/lib/supabase-admin", () => {
  function from(table: string) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      update: (vals: Ligne) => { if (table === "clients") H.update = vals; return chain; },
      insert: (vals: Ligne) => { if (table === "clients") H.insert = vals; return chain; },
      upsert: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({
        data: table === "clients" ? { id: "cl1", ...(H.insert ?? {}) } : null,
        error: null,
      }),
      then: <T,>(f: (v: { data: null; error: null }) => T) =>
        Promise.resolve({ data: null, error: null }).then(f),
    };
    return chain;
  }
  return { supabaseAdmin: { from } };
});

import { modifierClient } from "@/app/(admin)/(espace-clients)/clients/[id]/modifier/actions";
import { creerClient } from "@/app/(admin)/(espace-clients)/clients/nouveau/actions";

const ETAT = { erreur: null, champ: null, valeurs: {} } as never;

/** Une fiche valide : prénom, nom et e-mail, plus ce qu'on veut y ajouter. */
function formulaire(extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("prenom", "Camille");
  fd.set("nom", "Rey");
  fd.set("email", "camille.rey@exemple.ch");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  H.update = null;
  H.insert = null;
  H.estAdmin = true;
});

// ── La modification ───────────────────────────────────────────────────────

describe("modifier une fiche ne touche JAMAIS au statut membre", () => {
  it("sans champ « membre » : il n’est pas dans l’update, donc rien ne bouge", async () => {
    /**
     * L'ancienne action écrivait `membre: formData.get("membre") === "on"`.
     * Un formulaire sans la case envoyait donc `false` — et le membre d'hier
     * cessait de l'être parce que quelqu'un avait corrigé un numéro de
     * téléphone. C'est ce silence-là qu'on ferme.
     */
    await modifierClient("cl1", ETAT, formulaire());
    expect(H.update).not.toBeNull();
    expect(Object.keys(H.update!)).not.toContain("membre");
  });

  it("REQUÊTE FORGÉE avec « membre=on » : toujours rien", async () => {
    // Le champ n'est pas lu. Il n'y a plus rien à forger.
    await modifierClient("cl1", ETAT, formulaire({ membre: "on" }));
    expect(Object.keys(H.update!)).not.toContain("membre");
  });

  it("et « membre=off » ne peut pas non plus retirer le statut", async () => {
    await modifierClient("cl1", ETAT, formulaire({ membre: "off" }));
    expect(Object.keys(H.update!)).not.toContain("membre");
  });

  it("le reste de la fiche est bien enregistré (garde-fou du garde-fou)", async () => {
    /**
     * Sans ceci, une action qui n'écrirait PLUS RIEN passerait les trois tests
     * ci-dessus. Ils ne prouveraient alors que l'absence de tout.
     */
    await modifierClient("cl1", ETAT, formulaire({ telephone: "079 000 00 00" }));
    expect(H.update).toMatchObject({
      prenom: "Camille", nom: "Rey", email: "camille.rey@exemple.ch",
      telephone: "079 000 00 00",
    });
  });

  it("l’exemption, elle, reste modifiable par l’admin", () => {
    // Elle n'est PAS dans le périmètre : c'est une décision de la maison, pas
    // un état qui se déduit d'un encaissement.
    const src = readFileSync(
      join(__dirname, "..", "app/(admin)/(espace-clients)/clients/[id]/modifier/actions.ts"),
      "utf8",
    );
    expect(src).toContain("updateData.cotisation_exemptee");
  });
});

// ── La création ───────────────────────────────────────────────────────────

describe("un client créé n’est jamais membre d’office", () => {
  it("le champ n’est pas envoyé du tout : la base applique son défaut", async () => {
    /**
     * `clients.membre` a pour défaut `false` en base (colonne booléenne,
     * nullable). Ne pas envoyer le champ vaut donc mieux qu'envoyer `false` :
     * c'est la base qui dit la valeur de départ, à un seul endroit.
     */
    await creerClient(ETAT, formulaire());
    expect(H.insert).not.toBeNull();
    expect(Object.keys(H.insert!)).not.toContain("membre");
  });

  it("REQUÊTE FORGÉE avec « membre=on » à la création : sans effet", async () => {
    await creerClient(ETAT, formulaire({ membre: "on" }));
    expect(Object.keys(H.insert!)).not.toContain("membre");
  });

  it("la fiche est bien créée pour autant", async () => {
    await creerClient(ETAT, formulaire({ membre: "on" }));
    expect(H.insert).toMatchObject({ prenom: "Camille", nom: "Rey", actif: true });
  });
});

// ── La ligne d’information, dans ses trois cas ────────────────────────────

describe("la ligne d’adhésion dit ce qu’il en est", () => {
  it("adhésion en cours : la date, au format suisse", () => {
    expect(ligneAdhesionFiche({ finAdhesion: "2027-03-01", exempte: false })).toEqual({
      membre: true,
      texte: "⭐ Membre — adhésion valable jusqu'au 01.03.2027",
    });
  });

  it("exempté : pas de date, et c’est normal", () => {
    expect(ligneAdhesionFiche({ finAdhesion: null, exempte: true })).toEqual({
      membre: true,
      texte: "⭐ Membre — exempté d'adhésion",
    });
  });

  it("aucune adhésion : la phrase dit OÙ aller", () => {
    /**
     * « Pas d'adhésion » seul laisserait chercher. L'encaissement se fait
     * depuis la fiche client, pas depuis l'écran de modification : la phrase
     * le dit, puisque c'est précisément l'écran où l'on ne peut plus rien
     * cocher.
     */
    expect(ligneAdhesionFiche({ finAdhesion: null, exempte: false })).toEqual({
      membre: false,
      texte: "Pas d'adhésion en cours — à encaisser depuis la fiche client.",
    });
  });

  it("payé ET exempté : la date l’emporte", () => {
    // Dire « exempté » à quelqu'un qui a payé lui cacherait jusqu'à quand il
    // est couvert.
    expect(ligneAdhesionFiche({ finAdhesion: "2027-03-01", exempte: true }).texte)
      .toContain("valable jusqu'au 01.03.2027");
  });
});

// ── Les écrans ────────────────────────────────────────────────────────────

const lire = (relatif: string) => readFileSync(join(__dirname, "..", relatif), "utf8");

describe("les deux formulaires n’offrent plus la case", () => {
  it("plus aucun champ « membre » à envoyer", () => {
    for (const f of [
      "app/(admin)/(espace-clients)/clients/nouveau/FormNouveauClient.tsx",
      "app/(admin)/(espace-clients)/clients/[id]/modifier/FormModifierClient.tsx",
    ]) {
      expect(lire(f), f).not.toContain('name="membre"');
      expect(lire(f), f).not.toContain('caseCochee(v, "membre"');
    }
  });

  it("la fiche de modification affiche la ligne, calculée une seule fois", () => {
    const form = lire("app/(admin)/(espace-clients)/clients/[id]/modifier/FormModifierClient.tsx");
    expect(form).toContain("ligneAdhesionFiche({");
    expect(form).toContain("{adhesion.texte}");

    // La page charge l'adhésion avec la MÊME fonction que la fiche client :
    // un second calcul aurait fini par dire autre chose qu'elle.
    const page = lire("app/(admin)/(espace-clients)/clients/[id]/modifier/page.tsx");
    expect(page).toContain("cotisationActive(supabase, id, aujourdhuiISO())");
    expect(lire("app/(admin)/(espace-clients)/clients/[id]/page.tsx")).toContain("cotisationActive(");
  });

  it("la création n’affiche AUCUNE ligne d’adhésion", () => {
    // Un client qui vient d'être créé n'en a pas : une ligne « pas d'adhésion »
    // se lirait comme un reproche adressé à qui vient de saisir la fiche.
    const src = lire("app/(admin)/(espace-clients)/clients/nouveau/FormNouveauClient.tsx");
    expect(src).not.toContain("ligneAdhesionFiche");
    expect(src).not.toContain("adhésion");
  });

  it("CE QUI N’A PAS BOUGÉ : le badge, et ce qui pose le statut", () => {
    /**
     * Le lot ne retire pas le statut, il retire la MAIN sur le statut. Le badge
     * continue de l'afficher, et l'encaissement continue de le poser.
     */
    expect(lire("app/components/BadgeMembre.tsx")).toContain("membre");
    const poseurs = ["src/lib/cotisation.ts", "src/lib/membre.ts"];
    for (const f of poseurs) expect(lire(f).length, f).toBeGreaterThan(0);
  });
});
