// @vitest-environment jsdom
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "./setup/attenteJsdom";
import {
  FAMILLES,
  PAR_PAGE,
  champSensible,
  differences,
  entitesConnues,
  entitesDeLaFamille,
  filtresDepuisParams,
  MASQUE,
  nomDepuisTrace,
  nombreDePages,
  valeurLisible,
  versParamsJournal,
} from "@/src/lib/journalGestesLogique";
import { libelleEvenement, aUnLibelle } from "@/src/lib/journalEvenements";

/**
 * `journalEvenements` construit un client Supabase au CHARGEMENT du module.
 * Ce stub ne fait que rendre l'import possible : ce fichier ne lit aucune
 * donnee, il eprouve des fonctions pures et deux composants.
 */
vi.mock("@/src/lib/supabase-admin", () => ({ supabaseAdmin: { from: () => ({}) } }));

/**
 * APP 33 — l'écran « Journal des gestes » des Réglages.
 *
 * ── CE QUE CE FICHIER GARDE ───────────────────────────────────────────────
 *
 * Un journal qui ment est pire qu'un journal absent : on cesse de le consulter
 * sans cesser d'y croire. Les gardes sont donc dans cet ordre —
 *
 *   1. QUI y entre : la patronne, et elle seule ;
 *   2. ce qu'on NE VOIT JAMAIS : les champs sensibles, et toute écriture ;
 *   3. ce qu'on voit QUAND MÊME : un article supprimé, un geste sans libellé,
 *      une ligne dont l'objet n'a pas de fiche.
 */

const RACINE = join(__dirname, "..");
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), "utf8");

const PAGE = "app/(admin)/(espace-reglages)/reglages/journal/page.tsx";

afterEach(cleanup);

// ── La garde ───────────────────────────────────────────────────────────────

describe("qui entre dans le journal", () => {
  it("la MÊME garde que les autres écrans de Réglages", () => {
    /**
     * `exigerAdminPage()` = `exiger({ adminSeul: true })`. C'est ce que font
     * déjà Boutique, TVA, Entreprise et Remise membre. Reprendre la leur plutôt
     * que d'en inventer une évite qu'un jour les cinq ne disent plus la même
     * chose sur qui est « la patronne ».
     */
    expect(lire(PAGE)).toContain("await exigerAdminPage();");
    for (const voisin of ["boutique", "tva", "entreprise", "remise-membre"]) {
      const f = `app/(admin)/(espace-reglages)/reglages/${voisin}/page.tsx`;
      expect(lire(f), voisin).toContain("exigerAdminPage");
    }
  });

  it("la garde est POSÉE AVANT toute lecture", () => {
    // Lire puis refuser laisserait la donnée quitter la base pour rien — et un
    // jour, quelqu'un déplacerait le refus et la donnée resterait partie.
    const src = lire(PAGE);
    expect(src.indexOf("await exigerAdminPage();")).toBeLessThan(src.indexOf("lireJournal("));
  });

  it("l'espace CLIENT ne l'importe nulle part", () => {
    // Le journal dit qui a fait quoi : cela ne regarde pas une cliente.
    for (const partage of ["journalGestes", "journalGestesLogique"]) {
      const trouves = chercherDansDossier("app/(client)", partage);
      expect(trouves, partage).toEqual([]);
    }
  });

  it("aucune ÉCRITURE : ni action serveur, ni formulaire de modification", () => {
    /**
     * Et la base dit la même chose : deux triggers refusent UPDATE, DELETE et
     * TRUNCATE sur `journal_evenements`, la clé de service comprise. L'écran
     * n'est donc pas seul à tenir la règle — il ne pourrait pas la trahir.
     */
    for (const f of [
      PAGE,
      "app/(admin)/(espace-reglages)/reglages/journal/FiltresJournalGestes.tsx",
      "app/(admin)/(espace-reglages)/reglages/journal/LigneJournalGeste.tsx",
      "src/lib/journalGestes.ts",
    ]) {
      const src = lire(f);
      expect(src, `${f} : use server`).not.toContain('"use server"');
      for (const ecriture of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc("]) {
        expect(src, `${f} : ${ecriture}`).not.toContain(ecriture);
      }
    }
  });
});

function chercherDansDossier(dossier: string, aiguille: string): string[] {
  const trouves: string[] = [];
  const parcourir = (d: string) => {
    for (const e of readdirSync(d)) {
      const complet = join(d, e);
      if (statSync(complet).isDirectory()) parcourir(complet);
      else if (/\.tsx?$/.test(e) && readFileSync(complet, "utf8").includes(aiguille)) {
        trouves.push(complet);
      }
    }
  };
  parcourir(join(RACINE, dossier));
  return trouves;
}

// ── La pagination ──────────────────────────────────────────────────────────

describe("la pagination se fait EN BASE", () => {
  it("cinquante par page, et le compte vient de Postgres", () => {
    /**
     * `journal_evenements` ne se vide jamais. Charger la table pour en montrer
     * cinquante lignes marcherait ce mois-ci et ferait tomber l'écran dans deux
     * ans — au moment précis où l'on en aurait besoin.
     */
    const src = lire("src/lib/journalGestes.ts");
    expect(PAR_PAGE).toBe(50);
    expect(src).toContain(".range(debut, debut + PAR_PAGE - 1)");
    expect(src).toContain('{ count: "exact" }');
    // Aucune lecture sans borne : ce serait toute la table.
    expect(src).not.toMatch(/\.select\(COLONNES\)\s*;/);
  });

  it("l'ordre est STABLE : deux gestes de la même milliseconde ne dansent pas", () => {
    // Sans second critère, une ligne peut paraître sur deux pages, ou sur
    // aucune — et c'est indétectable à la lecture.
    const src = lire("src/lib/journalGestes.ts");
    expect(src).toContain('.order("created_at", { ascending: false })');
    expect(src).toContain('.order("id", { ascending: false })');
  });

  it("le nombre de pages ne descend jamais sous 1", () => {
    // Zéro geste doit afficher « page 1 sur 1 », pas « page 1 sur 0 ».
    expect(nombreDePages(0)).toBe(1);
    expect(nombreDePages(1)).toBe(1);
    expect(nombreDePages(50)).toBe(1);
    expect(nombreDePages(51)).toBe(2);
    expect(nombreDePages(2743)).toBe(55);
  });
});

// ── Les filtres ────────────────────────────────────────────────────────────

describe("les filtres vivent dans l'adresse", () => {
  it("chaque filtre se lit, et rien n'est cru sur parole", () => {
    const f = filtresDepuisParams({
      du: "2026-09-01", au: "2026-09-30",
      personne: "11111111-2222-3333-4444-555555555555",
      type: "factures", page: "3",
    });
    expect(f).toEqual({
      page: 3, du: "2026-09-01", au: "2026-09-30",
      personne: "11111111-2222-3333-4444-555555555555", famille: "factures",
    });
  });

  it("une date qui a la FORME d'une date, mais n'existe pas, est refusée", () => {
    /**
     * `2026-13-45` passe une expression régulière — quatre chiffres, deux,
     * deux — et partirait telle quelle dans la requête, que Postgres
     * refuserait. Le 30 février aussi. La forme ne suffit pas.
     */
    for (const fausse of ["2026-13-45", "2026-02-30", "2026-00-10", "2026-04-31"]) {
      expect(filtresDepuisParams({ du: fausse }).du, fausse).toBeNull();
    }
    // Et une vraie date d'un mois court passe.
    expect(filtresDepuisParams({ du: "2026-02-28" }).du).toBe("2026-02-28");
    expect(filtresDepuisParams({ du: "2024-02-29" }).du, "année bissextile").toBe("2024-02-29");
  });

  it("une saisie douteuse retombe sur « aucun filtre »", () => {
    /**
     * C'est une lecture seule, mais une chaîne libre qui partirait dans une
     * requête serait une porte ouverte pour rien. Et une date mal formée
     * afficherait une page vide sans dire pourquoi.
     */
    const f = filtresDepuisParams({
      du: "hier", au: "2026-13-45", personne: "moi", type: "licorne", page: "-4",
    });
    expect(f).toEqual({ page: 1, du: null, au: null, personne: null, famille: null });
  });

  it("des bornes à l'envers se remettent à l'endroit", () => {
    // « du 30 au 1er » ne rendrait RIEN, sans dire pourquoi.
    const f = filtresDepuisParams({ du: "2026-09-30", au: "2026-09-01" });
    expect(f.du).toBe("2026-09-01");
    expect(f.au).toBe("2026-09-30");
  });

  it("l'adresse reste courte : la page 1 ne s'écrit pas", () => {
    expect(versParamsJournal({ page: 1 }).toString()).toBe("");
    expect(versParamsJournal({ page: 2, famille: "ventes" }).toString()).toBe("type=ventes&page=2");
  });

  it("changer un filtre ramène à la page 1", () => {
    // Rester en page 7 après avoir réduit la liste à trois lignes afficherait
    // une page vide, et on croirait qu'il n'y a rien.
    expect(lire("app/(admin)/(espace-reglages)/reglages/journal/FiltresJournalGestes.tsx"))
      .toContain("page: 1");
  });

  it("chaque famille regroupe des entités, et aucune n'est dans deux familles", () => {
    const toutes = entitesConnues();
    expect(new Set(toutes).size, "aucun doublon entre familles").toBe(toutes.length);
    expect(entitesDeLaFamille("factures")).toContain("facture");
    expect(entitesDeLaFamille("acces")).toEqual(["acces"]);
    expect(entitesDeLaFamille("licorne")).toBeNull();
  });

  it("LES ENTITÉS PRÉSENTES EN BASE SONT TOUTES RANGÉES", () => {
    /**
     * Relevé le 28.09.2026. Quatre d'entre elles ne figurent PAS dans le type
     * `EntiteJournal` — `chiens` et `clients` au PLURIEL, `commande`,
     * `commande_en_ligne` : la colonne est un texte libre, et le type TypeScript
     * ne la contraint pas. Une entité oubliée deviendrait invisible au moindre
     * filtre, et c'est le genre de trou qu'un journal ne doit pas avoir.
     */
    const EN_BASE = [
      "abonnement", "acces", "alerte_stock", "article", "avoir", "chiens",
      "client", "clients", "commande", "commande_en_ligne", "decompte_tva",
      "depense", "ecriture", "entite_juridique", "facture", "paiement",
      "parametre", "parametres_tva", "promotion", "reservation", "vente",
    ];
    const rangees = new Set(entitesConnues());
    const orphelines = EN_BASE.filter((e) => !rangees.has(e));
    expect(orphelines, "ces entités ne tomberaient dans aucun filtre").toEqual([]);
  });
});

// ── Les libellés ───────────────────────────────────────────────────────────

describe("les libellés, et ce qui n'en a pas encore", () => {
  it("le repli est LISIBLE, et il se voit", () => {
    /**
     * Rendre le nom technique nu le faisait passer pour un libellé : on lisait
     * « alerte_renvoyee » sans se dire qu'il manquait un mot. « Autre geste : »
     * dit les deux choses à la fois.
     */
    expect(libelleEvenement("code_jamais_vu", "reservation")).toBe("Autre geste : code_jamais_vu");
    expect(aUnLibelle("code_jamais_vu", "reservation")).toBe(false);
    expect(aUnLibelle("emission", "facture")).toBe(true);
    expect(aUnLibelle("depart", "reservation")).toBe(true);
  });

  it("LA LISTE DES GESTES SANS LIBELLÉ, pour qu'on les voie", () => {
    /**
     * Ce test ne défend pas un état : il l'EXPOSE. Les couples ci-dessous sont
     * ceux relevés en base le 28.09.2026 ; onze n'ont pas encore de mot
     * français, et s'affichent donc « Autre geste : … ».
     *
     * Le jour où Sabrina en nomme un, ce test rougit et on retire sa ligne. Le
     * jour où un nouveau geste arrive sans libellé, il faudra l'ajouter ici —
     * et c'est justement le moment où l'on se pose la question.
     */
    const SANS_LIBELLE = [
      ["alerte_stock", "alerte_envoi_echec"],
      ["alerte_stock", "alerte_renvoyee"],
      ["article", "alerte_retour_en_stock"],
      ["chiens", "chien_change_de_fiche"],
      ["clients", "compte_auth_detache"],
      ["clients", "fiche_interne_creee"],
      ["commande", "statut"],
      ["commande_en_ligne", "confirmation"],
      ["commande_en_ligne", "remise"],
      ["facture", "documents_reconcilies"],
      ["parametres_tva", "tva_prestation"],
    ] as const;

    for (const [entite, evenement] of SANS_LIBELLE) {
      expect(aUnLibelle(evenement, entite), `${entite}/${evenement}`).toBe(false);
      expect(libelleEvenement(evenement, entite)).toBe(`Autre geste : ${evenement}`);
    }
  });

  it("les gestes les plus fréquents, eux, sont en français", () => {
    // Les cinq qui pèsent le plus en base : si l'un d'eux perdait son libellé,
    // l'écran deviendrait illisible d'un coup.
    expect(libelleEvenement("pdf", "facture")).toBe("PDF généré");
    expect(libelleEvenement("emission", "facture")).toBe("Facture émise");
    expect(libelleEvenement("avoir", "facture")).toBe("Avoir créé");
    expect(libelleEvenement("vente", "vente")).toBe("Vente encaissée");
    expect(libelleEvenement("retour", "vente")).toBe("Retour de caisse");
  });

  it("l'import des photos d'un fournisseur est nommé, et sous son entité", () => {
    /**
     * APP 35 l'avait laissé au repli — « Autre geste :
     * import_photos_fournisseur ». APP 35 bis le nomme.
     *
     * L'entité reste `parametre` : le geste ne concerne aucun article en
     * particulier, et `article` ferait pointer l'écran vers une fiche absente.
     * Le libellé est donc vérifié SOUS cette entité, celle que le script écrit.
     */
    expect(aUnLibelle("import_photos_fournisseur", "parametre")).toBe(true);
    expect(libelleEvenement("import_photos_fournisseur", "parametre")).toBe(
      "Photos importées depuis un fournisseur",
    );
  });
});

// ── Les champs sensibles ───────────────────────────────────────────────────

describe("ce qui ne s'affiche JAMAIS", () => {
  it("le masque couvre les mots qui comptent", () => {
    for (const champ of [
      "mot_de_passe", "password", "token", "jeton_reset", "secret_stripe",
      "api_key", "apiKey", "iban", "iban_complet", "bic", "cvv", "numero_carte",
    ]) {
      expect(champSensible(champ), champ).toBe(true);
    }
  });

  it("et ne masque PAS ce qui doit se lire", () => {
    /**
     * `sha256` est l'empreinte d'un PDF de facture : elle prouve que le document
     * n'a pas bougé. La cacher retirerait la seule chose qui rend la trace
     * vérifiable. `numero` et `reference` sont ce qu'on vient chercher.
     */
    for (const champ of ["sha256", "numero", "reference", "montant", "statut", "chemin", "email"]) {
      expect(champSensible(champ), champ).toBe(false);
    }
  });

  it("un champ sensible est remplacé des DEUX côtés, jamais affiché", () => {
    const d = differences({ iban: "CH5800791123000889012" }, { iban: "CH9300762011623852957" });
    expect(d).toHaveLength(1);
    expect(d[0].avant).toBe(MASQUE);
    expect(d[0].apres).toBe(MASQUE);
    expect(JSON.stringify(d)).not.toContain("CH58");
    expect(JSON.stringify(d)).not.toContain("CH93");
  });

  it("un champ sensible reste listé MÊME s'il n'a pas changé", () => {
    // On dit qu'il existe et qu'on ne le montre pas. Le taire laisserait croire
    // qu'il n'y en avait pas.
    const d = differences({ token: "abc" }, { token: "abc" });
    expect(d).toHaveLength(1);
    expect(d[0].sensible).toBe(true);
  });

  it("aucune clé sensible en base aujourd'hui — le masque est posé par principe", () => {
    /**
     * Vérifié le 28.09.2026 : 119 clés distinctes dans `avant` et `apres`,
     * aucune ne correspond au masque. C'est le bon moment pour le poser — le
     * jour où un jeton entrera dans une trace, personne n'aura à y penser.
     */
    const CLES_EN_BASE = [
      "total", "numero", "montant", "type", "chemin", "sha256", "destination",
      "echeance", "mode", "origine", "arrondi", "statut", "avoir", "facture_id",
      "destinataire", "lignes", "reference", "motif", "permissions", "email",
      "raison_sociale", "ide", "numero_tva", "titulaire_nom", "auth_user_id",
    ];
    expect(CLES_EN_BASE.filter(champSensible)).toEqual([]);
  });
});

// ── « Avant / après », lisible ─────────────────────────────────────────────

describe("le détail se lit, il ne se décode pas", () => {
  it("seuls les champs qui ont BOUGÉ sont listés", () => {
    // Vingt lignes dont deux ont changé cachent les deux qui comptent.
    const d = differences(
      { statut: "impayee", montant: 226.5, numero: "2026-0042" },
      { statut: "payee", montant: 226.5, numero: "2026-0042" },
    );
    expect(d.map((x) => x.champ)).toEqual(["statut"]);
    expect(d[0].avant).toBe("impayee");
    expect(d[0].apres).toBe("payee");
  });

  it("un champ qui DISPARAÎT est un changement", () => {
    // Et c'est souvent celui qu'on cherche.
    const d = differences({ box_id: "b-1" }, {});
    expect(d).toHaveLength(1);
    expect(d[0].avant).toBe("b-1");
    expect(d[0].apres).toBeNull();
  });

  it("aucune valeur ne sort en JSON brut", () => {
    expect(valeurLisible(true)).toBe("oui");
    expect(valeurLisible(false)).toBe("non");
    expect(valeurLisible(["chien", "chat"])).toBe("chien, chat");
    expect(valeurLisible([])).toBe("(vide)");
    // Un objet se compte, il ne s'étale pas : déplier trois niveaux rendrait la
    // ligne illisible, et ce n'est pas ce qu'on vient chercher.
    expect(valeurLisible({ a: 1, b: 2 })).toBe("2 champ(s)");
    expect(valeurLisible([{ a: 1 }, { a: 2 }])).toBe("2 élément(s)");
    expect(valeurLisible("")).toBeNull();
    expect(valeurLisible(null)).toBeNull();
  });

  it("le composant ne rend jamais JSON.stringify", () => {
    const src = lire("app/(admin)/(espace-reglages)/reglages/journal/LigneJournalGeste.tsx");
    expect(src).not.toContain("JSON.stringify");
    expect(src).toContain("differences(ligne.avant, ligne.apres)");
  });
});

// ── L'objet concerné ───────────────────────────────────────────────────────

describe("ce que la ligne concerne", () => {
  it("un ARTICLE SUPPRIMÉ garde sa référence et son nom, sans lien", () => {
    /**
     * APP 32 : la fiche a disparu, mais la trace porte « reference » et « nom ».
     * Sans ce repli, le journal dirait « Article supprimé » sans dire lequel —
     * c'est-à-dire rien, et c'est justement la ligne qu'on vient relire.
     */
    expect(nomDepuisTrace({ reference: "ART-0078", nom: "Paille" }, null))
      .toBe("ART-0078 Paille");
  });

  it("le nom se cherche dans « avant » puis dans « après »", () => {
    expect(nomDepuisTrace(null, { numero: "2026-0042" })).toBe("2026-0042");
    expect(nomDepuisTrace({}, {})).toBeNull();
    expect(nomDepuisTrace(null, null)).toBeNull();
  });

  it("LA LECTURE BRANCHE le repli, pas seulement le module qui le contient", () => {
    /**
     * LE TROU QUE CE TEST FERME, trouvé par mutation : `nomDepuisTrace`
     * était éprouvée seule, et le composant recevait `concerne` tout fait
     * en propriété. Retirer l'appel dans `journalGestes.ts` ne faisait donc
     * rougir personne — et un article supprimé serait redevenu anonyme.
     */
    const src = lire("src/lib/journalGestes.ts");
    expect(src).toContain("concerne: objet?.nom ?? nomDepuisTrace(l.avant, l.apres)");
    expect(src).toContain("lien: objet?.lien ?? null");
  });

  it("TOUTES les fiches visées existent vraiment", () => {
    /**
     * Un lien mort dans un journal fait douter du journal entier. Ce test relit
     * les adresses écrites dans `journalGestes.ts` et vérifie qu'un fichier de
     * route leur correspond — c'est ainsi que la fiche d'une commande en ligne
     * s'est révélée inexistante (il n'y a qu'un bon de préparation), et que ces
     * lignes s'affichent donc sans lien.
     */
    const src = lire("src/lib/journalGestes.ts");
    const chemins = [...src.matchAll(/fiche: \(r\) => `([^`]+)`/g)]
      .map((m) => m[1].replace(/\$\{r\.id\}/g, "[id]"));
    expect(chemins.length, "au moins quelques fiches").toBeGreaterThan(5);

    const GROUPES = [
      "(admin)", "(admin)/(espace-comptabilite)", "(admin)/(espace-clients)",
      "(admin)/(espace-pension)", "(admin)/(espace-prestations)", "(admin)/(espace-reglages)",
    ];
    for (const chemin of [...new Set(chemins)]) {
      const existe = GROUPES.some((g) =>
        existsSync(join(RACINE, "app", g, chemin.replace(/^\//, ""), "page.tsx")),
      );
      expect(existe, `${chemin} ne correspond à aucune route`).toBe(true);
    }
  });
});

// ── L'écran ────────────────────────────────────────────────────────────────

describe("l'écran lui-même", () => {
  it("le raccourci est sur l'accueil des Réglages", () => {
    const accueil = lire("app/(admin)/(espace-reglages)/reglages/page.tsx");
    expect(accueil).toContain('href="/reglages/journal"');
    expect(accueil).toContain("Journal des gestes");
  });

  it("une ligne montre l'heure, l'auteur, le libellé et l'objet", async () => {
    vi.mock("next/link", () => ({
      default: ({ href, children }: { href: string; children: React.ReactNode }) =>
        <a href={href}>{children}</a>,
    }));
    const { default: Ligne } = await import(
      "@/app/(admin)/(espace-reglages)/reglages/journal/LigneJournalGeste"
    );

    render(
      <ul>
        <Ligne
          ligne={{
            id: "l-1",
            createdAt: "2026-09-28T09:15:00Z",
            entite: "article",
            entiteId: "a-1",
            evenement: "suppression",
            libelle: "Article supprimé",
            motif: null,
            auteur: { texte: "SJ", titre: "Sabrina Jean", genre: "personnel" },
            concerne: "ART-0078 Paille",
            lien: null,
            avant: { reference: "ART-0078", nom: "Paille" },
            apres: null,
          }}
        />
      </ul>,
    );

    expect(screen.getByText("Article supprimé")).toBeTruthy();
    expect(screen.getByText("ART-0078 Paille")).toBeTruthy();
    expect(screen.getByText("SJ")).toBeTruthy();
    // Aucun lien : l'article n'existe plus.
    expect(document.querySelector("a")).toBeNull();
    // Le détail est là, replié, et il n'est pas du JSON.
    expect(screen.getByText("Voir le détail")).toBeTruthy();
    expect(document.body.textContent).not.toContain('{"reference"');
  });

  it("une ligne dont l'objet existe encore porte un lien vers sa fiche", async () => {
    const { default: Ligne } = await import(
      "@/app/(admin)/(espace-reglages)/reglages/journal/LigneJournalGeste"
    );
    render(
      <ul>
        <Ligne
          ligne={{
            id: "l-2", createdAt: "2026-09-28T09:15:00Z",
            entite: "facture", entiteId: "f-1", evenement: "emission",
            libelle: "Facture émise", motif: null,
            auteur: { texte: "SJ", titre: null, genre: "personnel" },
            concerne: "Facture 2026-0042", lien: "/factures/f-1",
            avant: null, apres: null,
          }}
        />
      </ul>,
    );
    const lien = screen.getByText("Facture 2026-0042").closest("a");
    expect(lien?.getAttribute("href")).toBe("/factures/f-1");
  });

  it("les familles annoncées à l'écran sont celles du module", () => {
    // Un seul endroit décide des regroupements : le module. L'écran les lit.
    const filtres = lire("app/(admin)/(espace-reglages)/reglages/journal/FiltresJournalGestes.tsx");
    expect(filtres).toContain("FAMILLES.map");
    for (const f of FAMILLES) {
      expect(filtres, f.libelle).not.toContain(f.libelle);
    }
  });
});
