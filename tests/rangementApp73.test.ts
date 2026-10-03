import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ESPACES, droitsNav, espacesVisibles, estActif, type CleEspace } from "@/src/lib/espaces";
import { rappelsDeLaSemaine, type EntreeJournee } from "@/src/lib/journee";
import {
  choixPourArticle,
  domainesDe,
  domainesValides,
  fournisseursDuDomaine,
  ordrePourDepense,
} from "@/src/lib/domainesFournisseurs";

/**
 * APP 73 — le rangement des écrans : ce qui a quitté l'accueil Clients et où
 * c'est allé, les menus, et les fournisseurs par domaine.
 */

const lire = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const CLIENTELE = lire("app", "(admin)", "(espace-clients)", "clientele", "page.tsx");
const PENSION = lire("app", "(admin)", "(espace-pension)", "pension", "page.tsx");

describe("l'accueil Clients ne garde que la clientèle", () => {
  it("les quatre éléments retirés n'y sont plus", () => {
    expect(CLIENTELE).not.toContain("Demandes de réservation en attente");
    expect(CLIENTELE).not.toContain("Réservations du personnel à voir");
    expect(CLIENTELE).not.toContain("Chiens en attente de validation");
    expect(CLIENTELE).not.toContain("/reservations/nouvelle");
    expect(CLIENTELE).not.toContain('titre="🐶 Chiens"');
  });

  it("il garde adhésions, nouveaux clients, « + Client », Clients et Abonnements", () => {
    expect(CLIENTELE).toContain("Adhésions à échéance dans le mois");
    expect(CLIENTELE).toContain("Nouveaux clients du mois");
    expect(CLIENTELE).toContain("+ Client");
    expect(CLIENTELE).toContain('href="/clients" titre="👤 Clients"');
    expect(CLIENTELE).toContain('href="/abonnements"');
  });
});

describe("les réservations sont à l'accueil Pension", () => {
  it("les deux tuiles, avec les mêmes liens, et « + Réservation »", () => {
    expect(PENSION).toMatch(/href="\/reservations"\s+titre="Demandes de réservation en attente"/);
    expect(PENSION).toMatch(/href="\/reservations\?personnel=1"\s+titre="Réservations du personnel à voir"/);
    expect(PENSION).toContain('href="/reservations/nouvelle"');
    expect(PENSION).toContain("compterReservationsPersonnelAVoir()");
  });
});

describe("« Aujourd'hui » : À ne pas oublier", () => {
  const base: EntreeJournee = {
    jourISO: "2026-10-03", arrivees: [], departs: [], chiensDejaVenus: [], colisParClient: {},
    adhesions: [], commandes: [], depensesSansJustificatif: [], facturesEnRetard: [],
    droits: { isAdmin: false, perm_encaissements: false, perm_boutique_vente: false },
  };

  it("une ligne chacune, avec le lien, quand les comptes ne sont pas nuls", () => {
    const r = rappelsDeLaSemaine({ ...base, demandesEnAttente: 3, reservationsPersonnelAVoir: 1 });
    expect(r.map((x) => [x.libelle, x.href])).toEqual([
      ["1 réservation du personnel à voir", "/reservations?personnel=1"],
      ["3 demandes de réservation à traiter", "/reservations"],
    ]);
  });

  it("rien quand les comptes sont nuls", () => {
    expect(rappelsDeLaSemaine({ ...base, demandesEnAttente: 0, reservationsPersonnelAVoir: 0 })).toEqual([]);
    expect(rappelsDeLaSemaine(base)).toEqual([]);
  });

  it("au singulier comme au pluriel", () => {
    const r = rappelsDeLaSemaine({ ...base, demandesEnAttente: 1, reservationsPersonnelAVoir: 2 });
    expect(r.map((x) => x.libelle).sort()).toEqual([
      "1 demande de réservation à traiter", "2 réservations du personnel à voir",
    ]);
  });
});

describe("les chiens à valider sont en haut de /chiens", () => {
  it("l'encadré et son filtre", () => {
    const page = lire("app", "(admin)", "(espace-clients)", "chiens", "page.tsx");
    expect(page).toContain("en attente de validation");
    expect(page).toContain("cle: FILTRE_ATTENTE");
  });
});

// ── Les menus ────────────────────────────────────────────────────────────────

const ADMIN = droitsNav({}, true);
const labels = (cle: CleEspace) => espacesVisibles(ADMIN).find((e) => e.cle === cle)!.entrees.map((e) => e.label);

describe("les menus", () => {
  it("aucun libellé n'apparaît deux fois dans la même barre", () => {
    for (const espace of espacesVisibles(ADMIN)) {
      const vus = espace.entrees.map((e) => e.label);
      expect(new Set(vus).size, espace.cle).toBe(vus.length);
    }
  });

  it("l'écran des fiches employées ne porte plus le nom de l'espace", () => {
    expect(labels("equipe")).not.toContain("👥 Équipe");
    expect(labels("equipe")).toEqual([
      "🏠 Équipe", "🗂️ Fiches employées", "🗓️ Préparer le planning", "🗓️ Planning du mois",
      "⏱️ Timbrage", "🌴 Vacances", "📄 Fiches de salaire",
    ]);
  });

  it("Journal des gestes, Fermetures, et l'accueil Prestations renommé", () => {
    expect(labels("reglages")).toContain("📓 Journal des gestes");
    const pension = labels("pension");
    expect(pension.indexOf("🔒 Fermetures")).toBe(pension.indexOf("🚫 Essais fermés") - 1);
    expect(labels("prestations")[0]).toBe("✅ Prestations du jour");
  });

  it("l'ordre des espaces d'APP 71 ne bouge pas", () => {
    expect(ESPACES.map((e) => e.cle)).toEqual([
      "aujourdhui", "clients", "chiens", "pension", "prestations",
      "boutique", "atelier", "comptabilite", "equipe", "reglages",
    ]);
  });

  /*
   * Chaque tuile et chaque raccourci d'un accueil a son entrée dans le menu de
   * l'espace — ou une raison écrite, listée ici et en commentaire dans la page.
   */
  const ACCUEILS: [CleEspace, string[]][] = [
    ["clients", ["app", "(admin)", "(espace-clients)", "clientele", "page.tsx"]],
    ["pension", ["app", "(admin)", "(espace-pension)", "pension", "page.tsx"]],
    // Prestations : son accueil est la liste du jour, sans tuile ni raccourci.
    ["boutique", ["app", "(admin)", "boutique", "page.tsx"]],
    ["atelier", ["app", "(admin)", "atelier", "page.tsx"]],
    ["comptabilite", ["app", "(admin)", "(espace-comptabilite)", "comptabilite", "page.tsx"]],
    ["equipe", ["app", "(admin)", "(espace-equipe)", "equipe", "page.tsx"]],
    ["reglages", ["app", "(admin)", "(espace-reglages)", "reglages", "page.tsx"]],
  ];
  const EXCEPTIONS: Record<string, string> = {
    // Le chiffre du sur-mesure se lit au comptoir ; l'écran vit dans l'Atelier.
    "boutique /boutique/commandes": "rangé dans l'Atelier",
    // Un formulaire de création, pas un écran : on y arrive depuis les fiches.
    "equipe /employes/nouveau-rh": "formulaire de création",
  };

  for (const [cle, chemin] of ACCUEILS) {
    it(`accueil ${cle} : chaque tuile a son entrée de menu`, () => {
      const source = lire(...chemin);
      const hrefs = [...source.matchAll(/<(?:Tuile|Raccourci)\s+(?:key=\{[^}]*\}\s+)?href="([^"]+)"/g)]
        .map((m) => m[1].split("?")[0]);
      expect(hrefs.length).toBeGreaterThan(0);
      const espace = ESPACES.find((e) => e.cle === cle)!;
      const ecrans = [espace.accueil, ...espace.ecrans];
      for (const h of hrefs) {
        if (EXCEPTIONS[`${cle} ${h}`]) {
          expect(source, `${cle} ${h} : la raison doit être écrite dans la page`).toMatch(/\{\/\*[\s\S]*?\*\/\}/);
          continue;
        }
        expect(ecrans.some((e) => estActif(h, e.href, e.exact)), `${cle} ${h}`).toBe(true);
      }
    });
  }
});

// ── Une employée voit les mêmes écrans qu'avant ─────────────────────────────

describe("les comptes employés de test voient les mêmes écrans qu'avant", () => {
  // Les deux profils présents en base au 03.10.2026 (permissions seulement).
  const AUCUN = droitsNav({}, false);
  const COMPTOIR = droitsNav({ perm_encaissements: true, perm_boutique_vente: true, perm_prestations: true }, false);
  const hrefs = (d: ReturnType<typeof droitsNav>) =>
    Object.fromEntries(espacesVisibles(d).map((e) => [e.cle, e.entrees.map((x) => x.href)]));

  const PENSION_PERSONNEL = ["/pension", "/chiens-du-jour", "/checkin", "/reservations", "/planning", "/boxes", "/calendrier-essais"];

  it("sans permission", () => {
    expect(hrefs(AUCUN)).toEqual({
      aujourdhui: ["/"],
      clients: ["/clientele", "/clients"],
      chiens: ["/chiens"],
      pension: PENSION_PERSONNEL,
    });
  });

  it("encaissement, vente et prestations", () => {
    expect(hrefs(COMPTOIR)).toEqual({
      aujourdhui: ["/"],
      clients: ["/clientele", "/clients", "/adhesions", "/abonnements"],
      chiens: ["/chiens"],
      pension: PENSION_PERSONNEL,
      prestations: ["/prestations", "/prestations/planning", "/prestations/locataires"],
      boutique: ["/boutique", "/boutique/caisse", "/boutique/ventes", "/boutique/commandes-en-ligne", "/boutique/articles"],
    });
  });
});

// ── Les fournisseurs par domaine ─────────────────────────────────────────────

describe("les fournisseurs par domaine", () => {
  const F = [
    { id: "a", nom: "Grossiste", domaines: ["boutique", "atelier"] },
    { id: "b", nom: "Régie", domaines: ["general"] },
    { id: "c", nom: "Cuir", domaines: ["atelier"] },
    { id: "d", nom: "Croquettes", domaines: ["boutique"] },
    { id: "e", nom: "Ancien", domaines: null },
  ];

  it("Boutique et Atelier filtrent, la Comptabilité voit tout", () => {
    expect(fournisseursDuDomaine(F, "boutique").map((f) => f.id)).toEqual(["a", "d"]);
    expect(fournisseursDuDomaine(F, "atelier").map((f) => f.id)).toEqual(["a", "c"]);
    expect(fournisseursDuDomaine(F, null).map((f) => f.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("sans domaine lisible, une fiche se range dans les autres frais", () => {
    expect(domainesDe({ domaines: null })).toEqual(["general"]);
    expect(domainesValides(["atelier", "pirate", "boutique", "atelier"])).toEqual(["boutique", "atelier"]);
    expect(domainesValides([])).toEqual([]);
  });

  it("le choix sur une fiche article ne propose que son domaine — et garde le fournisseur actuel", () => {
    expect(choixPourArticle(F, "boutique").map((f) => f.id)).toEqual(["a", "d"]);
    expect(choixPourArticle(F, "atelier").map((f) => f.id)).toEqual(["a", "c"]);
    expect(choixPourArticle(F, "atelier", "d").map((f) => f.id)).toEqual(["a", "c", "d"]);
  });

  it("sur une dépense, tous, les autres frais en premier", () => {
    expect(ordrePourDepense(F).map((f) => f.nom)).toEqual(["Ancien", "Régie", "Croquettes", "Cuir", "Grossiste"]);
  });

  it("les fiches article, fourniture et dépense appellent ces choix", () => {
    expect(lire("app", "(admin)", "boutique", "articles", "nouveau", "page.tsx")).toMatch(/choixPourArticle\([\s\S]*?"boutique"\)/);
    expect(lire("app", "(admin)", "atelier", "fournitures", "nouvelle", "page.tsx")).toMatch(/choixPourArticle\([\s\S]*?"atelier"\)/);
    expect(lire("app", "(admin)", "boutique", "articles", "[id]", "modifier", "page.tsx")).toMatch(/choixPourArticle\([\s\S]*?perimetre,/);
    expect(lire("app", "(admin)", "(espace-comptabilite)", "comptabilite", "depenses", "nouvelle", "page.tsx")).toContain("ordrePourDepense(");
  });

  it("les écrans Boutique et Atelier gardent leur garde, sans dépense lue", () => {
    expect(lire("app", "(admin)", "boutique", "fournisseurs", "page.tsx")).toContain('exigerAccesAdmin("perm_boutique_gestion")');
    expect(lire("app", "(admin)", "atelier", "fournisseurs", "page.tsx")).toContain('exigerAccesAdmin("perm_atelier")');
    const commun = lire("app", "components", "fournisseurs", "PageFournisseursDomaine.tsx");
    expect(commun).not.toContain('from("depenses")');
    expect(commun).not.toContain("iban");
  });

  it("une fiche sans domaine coché est refusée, et chaque geste se trace", () => {
    const actions = lire("app", "(admin)", "(espace-comptabilite)", "comptabilite", "fournisseurs", "actions.ts");
    expect(actions).toContain("if (valeurs.domaines.length === 0) return { erreur: MESSAGE_DOMAINE_REQUIS");
    for (const ev of ["creation", "modification", "desactivation", "suppression"]) {
      expect(actions).toContain(`"${ev}"`);
    }
  });
});

describe("le remplissage initial des domaines, dans la migration", () => {
  const sql = lire("supabase", "migrations", "20261003193451_app73_fournisseurs_domaines.sql");

  it("colonne non vide, valeurs connues, défaut « general »", () => {
    expect(sql).toMatch(/domaines text\[\] not null default '\{general\}'/);
    expect(sql).toMatch(/cardinality\(domaines\) > 0/);
    expect(sql).toMatch(/domaines <@ array\['boutique', 'atelier', 'general'\]/);
  });

  it("lié à un article boutique → boutique ; à une fourniture d'atelier → atelier ; à rien → general", () => {
    expect(sql).toMatch(/a\.composant = false\)\s+then 'boutique'/);
    expect(sql).toMatch(/a\.composant = true\)\s+then 'atelier'/);
    // Rien de lié : la ligne n'est pas touchée, elle garde le défaut.
    expect(sql).toMatch(/and cardinality\(d\.domaines\) > 0/);
  });

  it("aucun droit ni aucune politique ne change", () => {
    expect(sql).not.toMatch(/\b(grant|revoke|policy|create function|security definer)\b/i);
  });
});
