import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CLE_DATE_OUVERTURE,
  avertissementPersonnel,
  bandeauBoutique,
  bandeauReservation,
  boutiqueOuverte,
  dateAvantOuverture,
  dateOuvertureCourte,
  dateOuvertureLongue,
  dateOuvertureUtilisable,
  dateOuvertureValide,
  premiereDateReservable,
  refusDateAvantOuverture,
} from "@/src/lib/ouvertureLogique";

/**
 * APP 56 — rien avant le 1er mars 2027.
 *
 * ── LA DÉCISION, ET POURQUOI ELLE VIT DANS UN RÉGLAGE ─────────────────────
 *
 * La Dogosphère ouvre le lundi 1er mars 2027 (décision de Sabrina,
 * 29.09.2026 ; c'était le 15 octobre 2026). Les clients peuvent réserver dès
 * maintenant, mais aucune date avant l'ouverture.
 *
 * La date a DÉJÀ changé une fois. Écrite en dur, elle se serait retrouvée dans
 * un bandeau, un refus serveur, un avertissement du personnel et un panier —
 * quatre endroits à retrouver au report suivant, dont un serait resté en
 * arrière sans que rien ne le signale. Elle vit donc dans `parametres`, et
 * toutes les phrases se fabriquent à partir d'elle. Ce fichier le vérifie.
 */

const OUVERTURE = "2027-03-01";

// ── Les fonctions pures ────────────────────────────────────────────────────

describe("premiereDateReservable : demain, ou l’ouverture si elle est plus tard", () => {
  it("bien avant l’ouverture : c’est l’ouverture", () => {
    expect(premiereDateReservable("2026-09-29", OUVERTURE)).toBe(OUVERTURE);
  });

  it("LA VEILLE de l’ouverture : c’est encore l’ouverture", () => {
    // Le lendemain du 28 février est le 1er mars : les deux coïncident, et
    // c'est la borne où une erreur de signe ne se verrait pas.
    expect(premiereDateReservable("2027-02-28", OUVERTURE)).toBe(OUVERTURE);
  });

  it("l’avant-veille : l’ouverture l’emporte sur demain", () => {
    expect(premiereDateReservable("2027-02-27", OUVERTURE)).toBe(OUVERTURE);
  });

  it("LE JOUR de l’ouverture : demain reprend la main", () => {
    expect(premiereDateReservable("2027-03-01", OUVERTURE)).toBe("2027-03-02");
  });

  it("LE LENDEMAIN : la règle ordinaire, sans qu’on ait rien retiré", () => {
    /**
     * C'est le sens du `max` : une fois la date passée, l'application redevient
     * normale toute seule. Personne n'a besoin d'être là le 2 mars au matin
     * pour effacer un réglage.
     */
    expect(premiereDateReservable("2027-03-02", OUVERTURE)).toBe("2027-03-03");
  });

  it("réglage vide, absent ou illisible : demain, comme avant ce lot", () => {
    for (const reglage of ["", null, undefined, "   ", "bientôt", "2027-13-01", "2027-02-31"]) {
      expect(premiereDateReservable("2026-09-29", reglage), String(reglage)).toBe("2026-09-30");
    }
  });

  it("le passage de mois et d’année tient", () => {
    expect(premiereDateReservable("2026-12-31", "")).toBe("2027-01-01");
    expect(premiereDateReservable("2027-02-28", "")).toBe("2027-03-01");
  });
});

describe("dateAvantOuverture", () => {
  it("la veille : oui ; le jour même : non ; le lendemain : non", () => {
    expect(dateAvantOuverture("2027-02-28", OUVERTURE)).toBe(true);
    expect(dateAvantOuverture("2027-03-01", OUVERTURE)).toBe(false);
    expect(dateAvantOuverture("2027-03-02", OUVERTURE)).toBe(false);
  });

  it("réglage vide ou illisible : JAMAIS de refus", () => {
    for (const reglage of ["", null, undefined, "n'importe quoi"]) {
      expect(dateAvantOuverture("2020-01-01", reglage), String(reglage)).toBe(false);
    }
  });

  it("une date absente ou illisible ne déclenche pas de refus non plus", () => {
    // Ce n'est pas à cette fonction de dire qu'une date manque : d'autres
    // contrôles le font, avec un message qui nomme le vrai problème.
    for (const d of ["", null, undefined, "demain"]) {
      expect(dateAvantOuverture(d, OUVERTURE), String(d)).toBe(false);
    }
  });
});

describe("boutiqueOuverte", () => {
  it("la veille : fermée ; LE JOUR MÊME : ouverte", () => {
    /**
     * Le jour de l'ouverture, la boutique est ouverte. Une boutique qui
     * n'ouvrirait que le lendemain de sa date d'ouverture ferait mentir toutes
     * les phrases affichées la veille.
     */
    expect(boutiqueOuverte("2027-02-28", OUVERTURE)).toBe(false);
    expect(boutiqueOuverte("2027-03-01", OUVERTURE)).toBe(true);
    expect(boutiqueOuverte("2027-03-02", OUVERTURE)).toBe(true);
  });

  it("réglage vide ou illisible : ouverte", () => {
    for (const reglage of ["", null, undefined, "2027-02-31"]) {
      expect(boutiqueOuverte("2020-01-01", reglage), String(reglage)).toBe(true);
    }
  });
});

describe("le réglage se lit, se valide et s’efface", () => {
  it("une date ISO passe ; le vide aussi, il efface", () => {
    expect(dateOuvertureUtilisable("2027-03-01")).toBe("2027-03-01");
    expect(dateOuvertureValide("")).toBe(true);
    expect(dateOuvertureValide("2027-03-01")).toBe(true);
  });

  it("une date IMPOSSIBLE est refusée, pas repliée", () => {
    /**
     * `new Date("2027-02-31")` rend le 3 mars sans se plaindre. Annoncer une
     * ouverture au 3 mars quand quelqu'un a tapé le 31 février serait pire que
     * de refuser : personne ne comprendrait d'où sort la date.
     */
    expect(dateOuvertureUtilisable("2027-02-31")).toBe("");
    expect(dateOuvertureValide("2027-02-31")).toBe(false);
  });

  it("le reste est refusé", () => {
    for (const mauvais of ["01.03.2027", "2027-3-1", "bientôt", "20270301"]) {
      expect(dateOuvertureUtilisable(mauvais), mauvais).toBe("");
      expect(dateOuvertureValide(mauvais), mauvais).toBe(false);
    }
  });

  it("la clé du réglage est bien celle de la migration", () => {
    expect(CLE_DATE_OUVERTURE).toBe("date_ouverture");
  });
});

// ── Les dates écrites ──────────────────────────────────────────────────────

describe("la date en toutes lettres", () => {
  it("« 1er mars 2027 » — et non « 1 mars »", () => {
    /**
     * `toLocaleDateString("fr-CH")` rend « 1 mars ». Le premier du mois s'écrit
     * « 1er », et c'est précisément le jour décidé : la seule irrégularité du
     * français en la matière tombe sur cette date-là.
     */
    expect(dateOuvertureCourte(OUVERTURE)).toBe("1er mars 2027");
    expect(dateOuvertureLongue(OUVERTURE)).toBe("lundi 1er mars 2027");
  });

  it("les autres jours n’ont pas d’exposant", () => {
    expect(dateOuvertureCourte("2026-10-15")).toBe("15 octobre 2026");
    expect(dateOuvertureLongue("2026-10-15")).toBe("jeudi 15 octobre 2026");
    expect(dateOuvertureCourte("2027-03-02")).toBe("2 mars 2027");
  });

  it("le jour de la semaine est le bon", () => {
    // Le 1er mars 2027 est un lundi : c'est ce que la décision annonce.
    expect(dateOuvertureLongue(OUVERTURE).startsWith("lundi ")).toBe(true);
  });

  it("réglage vide : rien, pas « undefined »", () => {
    expect(dateOuvertureCourte("")).toBe("");
    expect(dateOuvertureLongue(null)).toBe("");
  });
});

// ── Les quatre phrases ─────────────────────────────────────────────────────

describe("chaque phrase, mot pour mot, et tirée du réglage", () => {
  it("le bandeau du tunnel de réservation", () => {
    expect(bandeauReservation("2026-09-29", OUVERTURE)).toBe(
      "La Dogosphère ouvre le lundi 1er mars 2027. Vous pouvez déjà réserver à partir de cette date.",
    );
  });

  it("le refus serveur d’une réservation", () => {
    expect(refusDateAvantOuverture(OUVERTURE)).toBe(
      "Nous ouvrons le 1er mars 2027 : choisissez une date à partir de ce jour.",
    );
  });

  it("l’avertissement du personnel", () => {
    expect(avertissementPersonnel(OUVERTURE)).toBe(
      "Attention : cette date est avant l'ouverture (1er mars 2027).",
    );
  });

  it("le bandeau du panier", () => {
    expect(bandeauBoutique("2026-09-29", OUVERTURE)).toBe(
      "La boutique en ligne ouvre le lundi 1er mars 2027.",
    );
  });

  it("AUCUNE phrase n’écrit la date en dur", () => {
    /**
     * La garde du lot. Si une seule des quatre portait « 2027 » dans son code,
     * le report suivant en laisserait une en arrière.
     */
    const src = readFileSync(join(__dirname, "..", "src/lib/ouvertureLogique.ts"), "utf8");
    // Les commentaires citent la décision, et c'est leur rôle : on ne lit que
    // le code. Les blocs d'abord, les lignes ensuite — l'inverse couperait un
    // « // » vivant à l'intérieur d'un bloc.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // Aucune ANNÉE, donc aucune date figée. Le nom des mois, lui, est du
    // vocabulaire : « mars » est dans la table des douze, et doit y rester.
    expect(code).not.toMatch(/\b20\d\d\b/);
    expect(code, "le garde-fou lit bien du code").toContain("premiereDateReservable");
  });

  it("l’autre date le prouve : changer le réglage change les quatre phrases", () => {
    const AUTRE = "2026-10-15";
    expect(bandeauReservation("2026-09-29", AUTRE)).toContain("jeudi 15 octobre 2026");
    expect(refusDateAvantOuverture(AUTRE)).toContain("15 octobre 2026");
    expect(avertissementPersonnel(AUTRE)).toContain("(15 octobre 2026)");
    expect(bandeauBoutique("2026-09-29", AUTRE)).toContain("jeudi 15 octobre 2026");
  });
});

describe("les bandeaux disparaissent d’eux-mêmes", () => {
  it("le jour de l’ouverture, plus aucun bandeau", () => {
    expect(bandeauReservation(OUVERTURE, OUVERTURE)).toBeNull();
    expect(bandeauBoutique(OUVERTURE, OUVERTURE)).toBeNull();
  });

  it("après l’ouverture non plus", () => {
    expect(bandeauReservation("2027-06-01", OUVERTURE)).toBeNull();
    expect(bandeauBoutique("2027-06-01", OUVERTURE)).toBeNull();
  });

  it("réglage vide ou illisible : aucun bandeau, jamais", () => {
    for (const reglage of ["", null, undefined, "bientôt"]) {
      expect(bandeauReservation("2020-01-01", reglage), String(reglage)).toBeNull();
      expect(bandeauBoutique("2020-01-01", reglage), String(reglage)).toBeNull();
    }
  });
});

// ── La boutique en ligne, côté serveur ─────────────────────────────────────

const H = vi.hoisted(() => ({ ouverture: "", panier: null as { id: string } | null }));

vi.mock("@/src/lib/ouverture", () => ({ lireDateOuverture: async () => H.ouverture }));
vi.mock("@/src/lib/dates", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  aujourdhuiISO: () => "2026-09-29",
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/src/lib/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => {
      const c = {
        select: () => c, eq: () => c,
        maybeSingle: async () => ({ data: { id: "cl1", email: "a@b.ch", prenom: "Camille" } }),
      };
      return c;
    },
  }),
}));
vi.mock("@/src/lib/supabase-admin", () => {
  function from() {
    const c = {
      select: () => c, eq: () => c, in: () => c, order: () => c,
      maybeSingle: async () => ({ data: null, error: null }),
      then: <T,>(f: (v: { data: never[]; error: null }) => T) =>
        Promise.resolve({ data: [] as never[], error: null }).then(f),
    };
    return c;
  }
  return { supabaseAdmin: { from, rpc: async () => ({ data: null, error: null }) } };
});
vi.mock("@/src/lib/venteEnLigne", () => ({
  articleEnLigne: async () => null,
  lignesPanier: async () => [],
  lireCommande: async () => null,
  lireParametresEnLigne: async () => ({ grillePort: [], poidsMaxGrammes: 0, francoPortDes: null, delaiPreparationJours: 0 }),
  panierDuClient: async () => H.panier,
  reservationsAVenir: async () => [],
}));
vi.mock("@/src/lib/email", () => ({ envoyerEmailCommandeConfirmee: async () => undefined }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import { confirmerCommande } from "@/app/(public)/catalogue/actions";

beforeEach(() => {
  H.ouverture = "";
  H.panier = null;
});

describe("la boutique en ligne refuse la commande avant l’ouverture", () => {
  const entree = {
    mode_remise: "retrait" as const,
    reservation_id: null,
    adresse: null,
    mode_paiement: "facture" as const,
    cle_idempotence: "k1",
    conditions_acceptees: true,
  };

  it("avant l’ouverture : LA MÊME PHRASE QUE LE BANDEAU", async () => {
    /**
     * Le bouton est déjà inactif dans le panier. Ce contrôle-ci est celui qui
     * compte : une requête forgée ne passe pas par le bouton. Et la phrase est
     * la même des deux côtés — qui contourne l'écran lit ce que l'écran disait.
     */
    H.ouverture = OUVERTURE;
    const r = await confirmerCommande(entree);
    expect(r.error).toBe("La boutique en ligne ouvre le lundi 1er mars 2027.");
  });

  it("le refus tombe AVANT toute lecture du panier", async () => {
    // Le panier est vide (null) : si la garde ne tombait pas d'abord, on lirait
    // « Votre panier est vide », et le refus d'ouverture serait perdu.
    H.ouverture = OUVERTURE;
    H.panier = null;
    expect((await confirmerCommande(entree)).error).toContain("La boutique en ligne ouvre");
  });

  it("le jour de l’ouverture : la garde NE TOMBE PLUS", async () => {
    // On est le 2026-09-29 (horloge figée) : une ouverture à cette date ou
    // avant laisse passer, et le traitement ordinaire reprend.
    H.ouverture = "2026-09-29";
    const r = await confirmerCommande(entree);
    expect(r.error).not.toContain("La boutique en ligne ouvre");
    expect(r.error).toBe("Votre panier est vide.");
  });

  it("réglage vide : rien ne change", async () => {
    H.ouverture = "";
    expect((await confirmerCommande(entree)).error).toBe("Votre panier est vide.");
  });
});

// ── Le câblage, là où le monter coûterait plus que de le lire ─────────────

const lire = (relatif: string) => readFileSync(join(__dirname, "..", relatif), "utf8");

describe("les gardes de réservation sont posées, et au bon endroit", () => {
  it("l’action client refuse CHAQUE occurrence, pas seulement la première", () => {
    /**
     * Une série ou un abonnement dont un seul rendez-vous tombe avant
     * l'ouverture doit être refusé en entier. Vérifier la première date et pas
     * les onze suivantes serait la faute la plus coûteuse à rattraper : douze
     * réservations posées, dont la moitié impossibles.
     */
    const src = lire("app/(client)/mon-compte/reservations/actions.ts");
    expect(src).toMatch(/for \(const occ of input\.occurrences\) \{\s*\n\s*if \(dateAvantOuverture\(occ\.date_debut, dateOuverture\)\)/);
    expect(src).toContain("refusDateAvantOuverture(dateOuverture)");
  });

  it("LE PERSONNEL N’EST JAMAIS BLOQUÉ : la garde vient après son chemin", () => {
    /**
     * L'assertion la plus importante du câblage. Le chemin « fiche interne »
     * rend la main avant ; si la garde remontait au-dessus, l'équipe ne
     * pourrait plus saisir un cas particulier — ce que le lot interdit
     * explicitement.
     */
    const src = lire("app/(client)/mon-compte/reservations/actions.ts");
    expect(src.indexOf("if (estInterne) {")).toBeLessThan(src.indexOf("const dateOuverture = await lireDateOuverture()"));

    const route = lire("app/api/reservations/client/route.ts");
    expect(route.indexOf("interne) {")).toBeLessThan(route.indexOf("const dateOuverture = await lireDateOuverture()"));
    expect(route).toContain("refusDateAvantOuverture(dateOuverture)");
  });
});

describe("les écrans sont câblés sur le réglage", () => {
  it("le tunnel client : une seule première date, pour le calendrier ET les champs", () => {
    const src = lire("app/(client)/mon-compte/reservations/nouvelle/TunnelReservation.tsx");
    expect(src).toContain("const demain = premiereDateReservable(aujourdhui, dateOuverture);");
    expect(src).toContain("bandeauReservation(aujourdhui, dateOuverture)");
    // Le calendrier et les trois champs de date boivent à la même source.
    expect(src).toContain("minDate={demain}");
    expect(src.match(/min=\{demain\}/g) ?? []).toHaveLength(2);
    expect(src).toContain("min={dateArrivee || demain}");
    // Et l'ancien calcul « demain » en dur a bien disparu.
    expect(src).not.toContain("d.setDate(d.getDate() + 1)");
  });

  it("le formulaire du personnel : un avertissement, aucun blocage", () => {
    const src = lire("app/(admin)/(espace-clients)/reservations/nouvelle/FormReservation.tsx");

    // Le bloc est rendu SOUS cette condition, et la phrase est dedans. Vérifier
    // seulement que l'appel existe quelque part laisserait passer un bloc
    // désactivé : la phrase serait dans le fichier et jamais à l'écran.
    const debut = src.indexOf("{avantOuverture && (");
    expect(debut, "le bloc est rendu sous la condition, et pas autrement").toBeGreaterThan(0);
    expect(src.slice(debut, debut + 600)).toContain("avertissementPersonnel(dateOuverture)");

    // Les DEUX dates comptent : la simple et celle d'une récurrence.
    expect(src).toContain("dateAvantOuverture(dateDebut, dateOuverture)");
    expect(src).toContain("dateAvantOuverture(dateDebutRecurrence, dateOuverture)");
    // Rien n'est désactivé à cause de l'ouverture.
    expect(src).not.toMatch(/disabled=\{[^}]*avantOuverture/);
  });

  it("LE PERSONNEL CRÉE QUAND MÊME : aucune garde sur son chemin", () => {
    /**
     * L'autre moitié du point C, et celle qui se vérifie mal à l'œil : le
     * formulaire prévient, mais rien dans le chemin de création du personnel
     * ne refuse. Si une garde s'y glissait un jour, l'équipe ne pourrait plus
     * saisir le cas particulier pour lequel l'avertissement a été écrit.
     */
    for (const f of [
      "app/(admin)/(espace-clients)/reservations/nouvelle/actions.ts",
      "src/lib/reservationPersonnel.ts",
    ]) {
      // Pas de `try` ici : un fichier renommé doit faire tomber le test, pas
      // le rendre muet. Le premier jet de ce test visait
      // « reservationsPersonnel.ts », au pluriel — il ne lisait rien et
      // passait au vert.
      const src = lire(f);
      expect(src, f).not.toContain("dateAvantOuverture");
      expect(src, f).not.toContain("refusDateAvantOuverture");
    }
  });

  it("le panier : bandeau posé et bouton inactif", () => {
    const src = lire("app/(public)/catalogue/panier/Panier.tsx");
    expect(src).toContain("{avisOuverture && (");
    expect(src).toContain("disabled={!!refus || enCours || !conditionsOk || !!avisOuverture}");
    const page = lire("app/(public)/catalogue/panier/page.tsx");
    // Calculé côté SERVEUR : l'horloge du navigateur ne décide pas de
    // l'ouverture d'un commerce.
    expect(page).toContain("bandeauBoutique(aujourdhuiISO(), await lireDateOuverture())");
  });

  it("LA CAISSE N’EST PAS TOUCHÉE", () => {
    /**
     * La vente au comptoir ne passe pas par `confirmerCommande`. Le jour de
     * l'ouverture est une affaire de vente EN LIGNE : bloquer le comptoir
     * empêcherait la pension d'encaisser ce qu'elle vend sur place.
     */
    const src = lire("app/(admin)/boutique/caisse/actions.ts");
    expect(src).not.toContain("lireDateOuverture");
    expect(src).not.toContain("boutiqueOuverte");
  });
});

describe("le réglage a son écran et sa porte", () => {
  it("le champ est dans Réglages → Entreprise, avec sa phrase d’aide", () => {
    const src = lire("app/(admin)/(espace-reglages)/reglages/entreprise/FormDateOuverture.tsx");
    expect(src).toContain(
      "Avant cette date, les clients ne peuvent ni réserver ni commander en ligne.",
    );
    expect(src).toContain("Laissez vide une fois ouvert.");
  });

  it("l’écran Entreprise a enfin une carte dans le menu", () => {
    // Il existait sans porte : on y arrivait par l'adresse, ou pas du tout.
    const src = lire("app/(admin)/(espace-reglages)/reglages/page.tsx");
    expect(src).toContain('href="/reglages/entreprise"');
  });

  it("le geste s’inscrit au journal, et il a un libellé", () => {
    const actions = lire("app/(admin)/(espace-reglages)/reglages/entreprise/actions.ts");
    expect(actions).toContain('evenement: "date_ouverture"');
    expect(actions).toContain("tracerEvenement");
    // APP 33 : un geste sans libellé s'affiche en clé technique.
    expect(lire("src/lib/journalEvenements.ts")).toContain("date_ouverture:");
  });

  it("la migration pose la date, sans écraser un réglage déjà changé", () => {
    const sql = lire("supabase/migrations/20260929205750_app56_date_ouverture.sql");
    expect(sql).toContain("'date_ouverture'");
    expect(sql).toContain("'2027-03-01'");
    expect(sql).toMatch(/on conflict \(cle\) do nothing/);
  });
});
