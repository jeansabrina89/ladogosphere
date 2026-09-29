import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  ALERTE_JAMAIS_SIGNEES,
  CASE_CONDITIONS_PENSION,
  CASE_CONDITIONS_VENTE,
  REFUS_CONDITIONS_PENSION,
  REFUS_CONDITIONS_VENTE,
  alerteAncienneVersion,
  etatConditions,
  formatVersion,
  ligneAcceptationClient,
  repereConditions,
  resumeAcceptationPersonnel,
  versionCourante,
  type Acceptation,
} from "@/src/lib/acceptationsConditionsLogique";
import { refusHeuresSejour, REFUS_HEURES_SEJOUR } from "@/src/lib/heuresSejour";
import {
  VERSIONS_CONDITIONS_DEFAUT,
  versionsDepuisReglages,
  refusVersionConditions,
  CLES_VERSIONS_CONDITIONS,
} from "@/src/lib/acceptationsConditionsLogique";

/**
 * APP 59 — les versions ont quitté `liensLegaux.ts` pour devenir des réglages
 * (`conditions_pension_version`, `conditions_vente_version`). Ce fichier les
 * lisait comme des constantes ; il les lit maintenant comme des valeurs de
 * DÉPART, et vérifie en plus qu'un réglage qui avance fait bien apparaître le
 * repère « ancienne version ».
 */
const VERSION_CONDITIONS_PENSION = VERSIONS_CONDITIONS_DEFAUT.pension;
const VERSION_CONDITIONS_VENTE = VERSIONS_CONDITIONS_DEFAUT.vente;

/**
 * APP 42 — la preuve datée qu'un client a accepté les conditions.
 *
 * ── CE QU'ON GARDE, ET POURQUOI ───────────────────────────────────────────
 *
 * Les conditions vivent sur le site, et rien ne disait qui les avait acceptées.
 * Le jour d'un désaccord — un chien rendu plus tôt, une commande contestée — il
 * n'y aurait eu que la parole de chacun.
 *
 * ── CE QUI NE BLOQUE JAMAIS, ET C'EST AUSSI IMPORTANT ─────────────────────
 *
 * Le personnel. Sabrina prend une réservation au téléphone pendant qu'un chien
 * aboie : lui refuser l'enregistrement parce qu'un papier n'est pas signé
 * l'obligerait à contourner l'outil, et la trace serait perdue pour de bon. On
 * l'AVERTIT. Une version périmée ne barre pas la route non plus.
 *
 * ── ÉPROUVÉ EN BASE, ET NON ICI ───────────────────────────────────────────
 *
 * Table en ajout seul (modification et suppression refusées, clé de service
 * comprise), papier sans saisie_par refusé, en-ligne AVEC saisie_par refusé,
 * document inconnu refusé — transaction annulée, résultats dans le commit.
 */

const A = (a: Partial<Acceptation> & { document: string; version: string }): Acceptation => ({
  acceptee_le: "2026-09-29T10:00:00+00:00",
  mode: "en_ligne",
  ...a,
});

// ── Les versions ───────────────────────────────────────────────────────────

describe("les versions viennent du site, et d'un seul endroit", () => {
  it("chaque document a la sienne, en ISO court", () => {
    expect(VERSION_CONDITIONS_PENSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(VERSION_CONDITIONS_VENTE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(versionCourante("pension")).toBe(VERSION_CONDITIONS_PENSION);
    expect(versionCourante("vente")).toBe(VERSION_CONDITIONS_VENTE);
  });

  it("APP 59 : la version vient du RÉGLAGE, et le repli tient", () => {
    const reglees = versionsDepuisReglages(new Map([
      [CLES_VERSIONS_CONDITIONS.pension, "2027-01-15"],
    ]));
    expect(versionCourante("pension", reglees)).toBe("2027-01-15");
    // L'autre clé manque : elle reprend sa valeur de départ.
    expect(versionCourante("vente", reglees)).toBe(VERSION_CONDITIONS_VENTE);
  });

  it("un réglage illisible ne fait passer personne pour à jour", () => {
    for (const mauvais of ["", "29.09.2026", "pas une date", "2026-02-31"]) {
      const v = versionsDepuisReglages(new Map([[CLES_VERSIONS_CONDITIONS.pension, mauvais]]));
      expect(v.pension, mauvais).toBe(VERSIONS_CONDITIONS_DEFAUT.pension);
      expect(refusVersionConditions(mauvais), mauvais).not.toBeNull();
    }
    expect(refusVersionConditions("2027-01-15")).toBeNull();
  });

  it("LE REPÈRE APPARAÎT quand le réglage avance", () => {
    /**
     * Le geste que le lot rend possible : Sabrina met les conditions à jour sur
     * le site, reporte la date ici, et les acceptations d'hier deviennent
     * « ancienne version » — sans bloquer personne.
     */
    const acc = [A({ document: "pension", version: "2026-09-29" })];
    expect(repereConditions(acc, "pension", { pension: "2026-09-29", vente: "2026-09-29" })).toBeNull();
    expect(repereConditions(acc, "pension", { pension: "2027-01-15", vente: "2026-09-29" }))
      .toBe("Conditions acceptées dans une ancienne version (du 29.09.2026).");
  });

  it("elles se lisent à la française", () => {
    expect(formatVersion("2026-09-29")).toBe("29.09.2026");
    expect(formatVersion("")).toBe("");
  });

  it("L'ÉCRAN dit quand et comment les mettre à jour", () => {
    /**
     * L'oublier ne casse rien tout de suite : les clients continuent
     * d'accepter, mais sous l'ancien numéro — et l'on croira qu'ils ont lu un
     * texte qu'ils n'ont pas vu. C'est une erreur silencieuse.
     */
    const src = readFileSync(
      join(process.cwd(), "app/(admin)/(espace-reglages)/reglages/entreprise/FormVersionsConditions.tsx"),
      "utf8",
    );
    expect(src).toContain("Quand vous modifiez ces conditions sur le site, reportez ici la date");
    expect(src).toContain("verront un repère, sans être bloqués.");
    // Et les constantes ont bien quitté le code.
    const legaux = readFileSync(join(process.cwd(), "src/lib/liensLegaux.ts"), "utf8");
    expect(legaux).not.toContain("export const VERSION_CONDITIONS_PENSION");
    expect(legaux).not.toContain("export const VERSION_CONDITIONS_VENTE");
  });
});

// ── L'état d'un client ─────────────────────────────────────────────────────

describe("où en est un client", () => {
  it("jamais accepté", () => {
    expect(etatConditions([], "pension").etat).toBe("jamais");
    expect(repereConditions([], "pension")).toBe(ALERTE_JAMAIS_SIGNEES);
    expect(resumeAcceptationPersonnel([], "pension")).toBe("Jamais acceptées");
    // Côté client : rien du tout, pas un reproche.
    expect(ligneAcceptationClient([], "pension")).toBeNull();
  });

  it("à jour : aucun repère", () => {
    const acc = [A({ document: "pension", version: VERSION_CONDITIONS_PENSION })];
    expect(etatConditions(acc, "pension").etat).toBe("a_jour");
    expect(repereConditions(acc, "pension")).toBeNull();
  });

  it("UNE VERSION PLUS ANCIENNE : repère, mais aucun blocage", () => {
    const acc = [A({ document: "pension", version: "2025-01-01" })];
    expect(etatConditions(acc, "pension").etat).toBe("ancienne");
    expect(repereConditions(acc, "pension")).toBe(alerteAncienneVersion("2025-01-01"));
    expect(repereConditions(acc, "pension")).toContain("01.01.2025");
    expect(repereConditions(acc, "pension")).toContain("ancienne version");
  });

  it("LA DERNIÈRE fait foi, jamais la plus ancienne", () => {
    /**
     * Un client qui a signé le papier en 2025 puis coché la case cette année
     * est à jour. Prendre la première trouvée l'aurait laissé « en retard »
     * pour toujours.
     */
    const acc = [
      A({ document: "pension", version: "2025-01-01", acceptee_le: "2025-01-01T10:00:00Z", mode: "papier" }),
      A({ document: "pension", version: VERSION_CONDITIONS_PENSION, acceptee_le: "2026-09-29T10:00:00Z" }),
    ];
    expect(etatConditions(acc, "pension").etat).toBe("a_jour");
    // Et dans l'autre ordre : le résultat ne dépend pas de la liste reçue.
    expect(etatConditions([...acc].reverse(), "pension").etat).toBe("a_jour");
  });

  it("les deux documents ne se mélangent pas", () => {
    const acc = [A({ document: "vente", version: VERSION_CONDITIONS_VENTE })];
    expect(etatConditions(acc, "pension").etat).toBe("jamais");
    expect(etatConditions(acc, "vente").etat).toBe("a_jour");
  });

  it("le personnel lit le mode et les initiales", () => {
    const papier = [A({
      document: "pension", version: VERSION_CONDITIONS_PENSION,
      mode: "papier", saisiePar: "SJ", acceptee_le: "2026-09-29T12:00:00Z",
    })];
    const resume = resumeAcceptationPersonnel(papier, "pension");
    expect(resume).toContain("29.09.2026");
    expect(resume).toContain("sur papier");
    expect(resume).toContain("SJ");

    const enLigne = [A({ document: "pension", version: VERSION_CONDITIONS_PENSION })];
    expect(resumeAcceptationPersonnel(enLigne, "pension")).toContain("en ligne");
  });

  it("le client lit une phrase simple, avec la version", () => {
    const acc = [A({ document: "vente", version: VERSION_CONDITIONS_VENTE, acceptee_le: "2026-09-28T09:00:00Z" })];
    const ligne = ligneAcceptationClient(acc, "vente") ?? "";
    expect(ligne).toContain("Conditions de vente acceptées le 28.09.2026");
    expect(ligne).toContain(`version du ${formatVersion(VERSION_CONDITIONS_VENTE)}`);
  });
});

// ── E bis : les heures d'un séjour ─────────────────────────────────────────

describe("un séjour sans ses deux heures est refusé", () => {
  it("sans heure d'arrivée", () => {
    expect(refusHeuresSejour("sejour", null, "17:00")).toBe(REFUS_HEURES_SEJOUR);
    expect(refusHeuresSejour("sejour", "", "17:00")).toBe(REFUS_HEURES_SEJOUR);
    expect(refusHeuresSejour("sejour", "   ", "17:00")).toBe(REFUS_HEURES_SEJOUR);
  });

  it("sans heure de départ", () => {
    expect(refusHeuresSejour("sejour", "08:00", null)).toBe(REFUS_HEURES_SEJOUR);
  });

  it("avec les deux : rien à redire", () => {
    expect(refusHeuresSejour("sejour", "08:00", "17:00")).toBeNull();
  });

  it("une journée et une journée d'essai ne sont PAS concernées", () => {
    // Elles tiennent dans la journée : leur décompte ne dépend pas de l'heure.
    expect(refusHeuresSejour("journee", null, null)).toBeNull();
    expect(refusHeuresSejour("essai", null, null)).toBeNull();
  });

  it("LES TROIS actions serveur portent le refus", () => {
    /**
     * Le `required` du formulaire ne suffit pas : une requête forgée arriverait
     * sans heure, et le séjour perdrait une journée au décompte — en silence,
     * avec une facture cohérente avec elle-même, simplement plus courte.
     */
    for (const f of [
      "app/(client)/mon-compte/reservations/actions.ts",
      "app/(admin)/(espace-clients)/reservations/nouvelle/actions.ts",
      "app/(admin)/(espace-clients)/reservations/[id]/modifier/actions.ts",
    ]) {
      expect(lire(f), f).toContain("refusHeuresSejour(");
    }
  });

  it("les deux formulaires du personnel les rendent obligatoires", () => {
    for (const f of [
      "app/(admin)/(espace-clients)/reservations/nouvelle/FormReservation.tsx",
      "app/(admin)/(espace-clients)/reservations/[id]/modifier/FormModifierReservation.tsx",
    ]) {
      expect(lire(f), f).toMatch(/required=\{(type|res\.type_reservation) === "sejour"\}/);
    }
  });

  it("le calcul du tarif n'est PAS touché", () => {
    // Il a raison de se taire quand il ne sait pas : c'est la SAISIE qui ne
    // doit plus laisser passer le vide.
    expect(lire("src/lib/calculTarif.ts")).not.toContain("refusHeuresSejour");
  });
});

// ── Ce que les écrans posent ───────────────────────────────────────────────

const lire = (relatif: string) => readFileSync(join(process.cwd(), relatif), "utf8");

describe("les cases, non cochées, et leurs refus", () => {
  it("les textes, mot pour mot", () => {
    expect(CASE_CONDITIONS_PENSION).toBe("J'ai lu et j'accepte les conditions de la pension.");
    expect(CASE_CONDITIONS_VENTE).toBe("J'ai lu et j'accepte les conditions de vente.");
    expect(REFUS_CONDITIONS_PENSION).toBe("Veuillez accepter les conditions de la pension.");
    expect(REFUS_CONDITIONS_VENTE).toBe("Veuillez accepter les conditions de vente.");
    expect(ALERTE_JAMAIS_SIGNEES)
      .toBe("Conditions de la pension pas encore signées : à faire signer à l'arrivée.");
  });

  it("NON cochées par défaut, des deux côtés", () => {
    /**
     * Pré-cocher aurait vidé le geste de son sens : une acceptation qu'on n'a
     * pas faite ne prouve rien, et c'est une preuve qu'on cherche à garder.
     */
    for (const f of [
      "app/(public)/catalogue/panier/Panier.tsx",
      "app/(client)/mon-compte/reservations/nouvelle/TunnelReservation.tsx",
    ]) {
      expect(lire(f), f).toMatch(/useState\(false\);?[\s\S]{0,40}$|const \[conditionsOk, setConditionsOk\] = useState\(false\)/m);
      expect(lire(f), f).toContain("const [conditionsOk, setConditionsOk] = useState(false)");
    }
  });

  it("le bouton attend la case", () => {
    /**
     * Ce test figeait la condition ENTIÈRE du bouton, au caractère près. APP 56
     * lui a ajouté un terme — la boutique fermée avant l'ouverture — et il est
     * tombé alors que rien de ce qu'il garde n'avait bougé.
     *
     * Il garde donc maintenant son intention, et elle seule : la case des
     * conditions figure dans ce qui désactive le bouton. Les autres raisons de
     * le désactiver ont leurs propres tests et n'ont pas à être recopiées ici,
     * faute de quoi ce fichier tombera à chaque raison nouvelle.
     */
    const panier = lire("app/(public)/catalogue/panier/Panier.tsx");
    const condition = panier.match(/disabled=\{[^}]*conditionsOk[^}]*\}/)?.[0] ?? "";
    expect(condition, "le bouton de confirmation dépend de la case").toContain("!conditionsOk");
    expect(condition).toContain("!!refus");

    expect(lire("app/(client)/mon-compte/reservations/nouvelle/TunnelReservation.tsx"))
      .toMatch(/chargement \|\| !conditionsOk/);
  });

  it("LE SERVEUR REFUSE, pas seulement l'écran", () => {
    // Le bouton grisé ne suffit pas : une requête forgée arriverait sans la
    // case, et le geste partirait sans preuve.
    expect(lire("app/(public)/catalogue/actions.ts"))
      .toMatch(/conditions_acceptees !== true[\s\S]{0,80}REFUS_CONDITIONS_VENTE/);
    expect(lire("app/(client)/mon-compte/reservations/actions.ts"))
      .toMatch(/conditions_acceptees !== true[\s\S]{0,80}REFUS_CONDITIONS_PENSION/);
  });

  it("le refus vient AVANT toute écriture", () => {
    /**
     * Une réservation créée puis une acceptation refusée laisserait une
     * réservation sans preuve — exactement ce qu'on cherche à éviter.
     */
    const src = lire("app/(client)/mon-compte/reservations/actions.ts");
    expect(src.indexOf("REFUS_CONDITIONS_PENSION"))
      .toBeLessThan(src.indexOf("creerReservationsPersonnel({"));
  });

  it("la ligne est écrite avec son origine", () => {
    expect(lire("app/(public)/catalogue/actions.ts"))
      .toMatch(/document: "vente"[\s\S]{0,120}commandeId: res\.id/);
    expect(lire("app/(client)/mon-compte/reservations/actions.ts"))
      .toMatch(/document: "pension"[\s\S]{0,120}reservationId/);
  });

  it("et son échec est VISIBLE", () => {
    // Une commande enregistrée sans sa preuve n'est pas une catastrophe — elle
    // tient — mais on le dit, plutôt que de laisser croire que tout est en ordre.
    expect(lire("app/(public)/catalogue/actions.ts")).toMatch(/trace\.message\.toLowerCase\(\)/);
    expect(lire("app/(client)/mon-compte/reservations/actions.ts"))
      .toMatch(/if \(trace\) return \{ ok: false, erreur: trace \}/);
  });
});

describe("la phrase sur les données, elle, ne change pas", () => {
  it("elle reste une phrase, pas une case", () => {
    /**
     * On n'a pas à demander l'accord de quelqu'un pour traiter ce qu'il nous
     * confie afin de le servir — on le lui DIT. La transformer en case aurait
     * laissé croire qu'un refus était possible.
     */
    const src = lire("app/(public)/catalogue/panier/Panier.tsx");
    const bloc = src.slice(src.indexOf("MENTION_DONNEES_AVANT"));
    expect(bloc.slice(0, 400)).not.toContain('type="checkbox"');
  });
});

// ── Le personnel ───────────────────────────────────────────────────────────

describe("le personnel est AVERTI, jamais bloqué", () => {
  it("l'écran de création montre l'avertissement, et rien ne l'arrête", () => {
    const form = lire("app/(admin)/(espace-clients)/reservations/nouvelle/FormReservation.tsx");
    expect(form).toContain("ALERTE_JAMAIS_SIGNEES");
    expect(form).toContain("conditionsManquantes");
    // Aucune garde : le mot ne doit pas apparaître dans un `disabled`.
    expect(form).not.toMatch(/disabled=\{[^}]*conditionsManquantes/);
  });

  it("l'action du personnel ne refuse PAS l'absence d'acceptation", () => {
    const src = lire("app/(admin)/(espace-clients)/reservations/nouvelle/actions.ts");
    expect(src).not.toContain("REFUS_CONDITIONS_PENSION");
    expect(src).not.toContain("conditions_acceptees");
  });

  it("la fiche de la réservation porte le même repère", () => {
    expect(lire("app/(admin)/(espace-clients)/reservations/[id]/page.tsx"))
      .toMatch(/repereConditions\(await acceptationsDuClient\(client_id\), "pension", await lireVersionsConditions\(\)\)/);
  });

  it("l'écran des arrivées le porte aussi", () => {
    // C'est là qu'on croise le client, avec le chien devant soi et un stylo à
    // portée. Le rappeler ailleurs serait le rappeler quand on ne peut rien faire.
    const src = lire("app/(admin)/(espace-pension)/chiens-du-jour/page.tsx");
    expect(src).toContain("clientsSansConditionsPension");
    expect(src).toContain("Conditions à signer");
  });

  it("la saisie papier est sous la permission des clients", () => {
    /**
     * Faire signer un papier fait partie de l'accueil. Une permission de plus
     * aurait été une case à cocher pour chaque employée, et personne ne
     * l'aurait cochée.
     */
    const src = lire("app/(admin)/(espace-clients)/clients/[id]/actions.ts");
    const bloc = src.slice(src.indexOf("export async function enregistrerConditionsPapier"));
    expect(bloc).toMatch(/verifierPermission\("perm_clients_modifier"\)/);
  });

  it("elle écrit une ligne PAPIER avec son auteur, et le journal", () => {
    const src = lire("app/(admin)/(espace-clients)/clients/[id]/actions.ts");
    const bloc = src.slice(src.indexOf("export async function enregistrerConditionsPapier"));
    expect(bloc).toMatch(/mode: "papier"/);
    expect(bloc).toMatch(/saisiePar: verif\.userId/);
    expect(bloc).toMatch(/evenement: "conditions_signees_papier"/);
    expect(bloc).toMatch(/entite: "client"/);
  });

  it("elle refuse une signature datée dans l'avenir", () => {
    const src = lire("app/(admin)/(espace-clients)/clients/[id]/actions.ts");
    const bloc = src.slice(src.indexOf("export async function enregistrerConditionsPapier"));
    expect(bloc).toMatch(/signee_le > aujourdhuiISO\(\)/);
  });

  it("la VERSION n'est jamais reçue de l'écran", () => {
    /**
     * `enregistrerAcceptation` la lit à la source : aucun écran ne peut en
     * inventer une, ni enregistrer une acceptation sous une version périmée.
     */
    const src = lire("src/lib/acceptationsConditions.ts");
    expect(src).toMatch(/version: versionCourante\(e\.document, await lireVersionsConditions\(\)\)/);
    expect(src).not.toMatch(/version: e\.version/);
  });
});

// ── La base ────────────────────────────────────────────────────────────────

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");

function migrationApp42(): string {
  const f = readdirSync(MIGRATIONS)
    .filter((x) => x.endsWith("_app42_acceptations_conditions.sql"))
    .sort()
    .at(-1);
  if (!f) throw new Error("la migration d'APP 42 est absente du dépôt");
  return readFileSync(join(MIGRATIONS, f), "utf8");
}

describe("ce que la base tient", () => {
  it("une acceptation ne se modifie ni ne se supprime", () => {
    // Une preuve qu'on peut réécrire n'est plus une preuve.
    const sql = migrationApp42();
    expect(sql).toMatch(/before update or delete on public\.acceptations_conditions/);
    expect(sql).toMatch(/before truncate on public\.acceptations_conditions/);
  });

  it("le papier a son auteur, l'en-ligne n'en a pas", () => {
    expect(migrationApp42()).toMatch(/when 'papier' then saisie_par is not null/);
  });

  it("une origine au plus : une réservation OU une commande", () => {
    expect(migrationApp42()).toMatch(/reservation_id is null or commande_id is null/);
  });

  it("LE CLIENT LIT LES SIENNES, et n'écrit rien", () => {
    /**
     * Aucune politique d'insertion pour `authenticated` : ce n'est pas un
     * oubli. Une acceptation doit naître AVEC le geste qu'elle accompagne, et
     * c'est l'action serveur qui tient les deux ensemble. Laisser le navigateur
     * insérer permettrait une acceptation sans réservation, ou l'inverse.
     */
    const sql = migrationApp42();
    expect(sql).toMatch(/create policy client_select_acceptations_conditions[\s\S]{0,200}for select/);
    expect(sql).toMatch(/c\.auth_user_id = \(select auth\.uid\(\)\)/);
    expect(sql).not.toMatch(/for insert\s+to authenticated/);
  });

  it("le personnel lit tout", () => {
    expect(migrationApp42()).toMatch(/personnel_select_acceptations_conditions[\s\S]{0,160}is_personnel\(\)/);
  });

  it("le texte des conditions n'est PAS copié en base", () => {
    // Il vit sur le site ; la `version` dit laquelle a été acceptée. Le copier
    // demanderait de le tenir à jour à deux endroits.
    const sql = migrationApp42();
    expect(sql).not.toMatch(/\btexte\b\s+text/);
    expect(sql).toMatch(/version text not null/);
  });
});

// ── Les liens (garde-fou d'APP 36, étendu) ─────────────────────────────────

describe("les liens des conditions restent sûrs", () => {
  it("ils pointent vers le SITE et gardent target + rel", () => {
    for (const f of [
      "app/(client)/mon-compte/reservations/nouvelle/TunnelReservation.tsx",
      "app/(public)/catalogue/panier/Panier.tsx",
      "app/(admin)/(espace-clients)/clients/[id]/BlocConditions.tsx",
      "app/(client)/mon-compte/profil/page.tsx",
    ]) {
      const src = lire(f);
      expect(src, `${f} n'écrit pas l'adresse à la main`).not.toContain("ladogosphere.ch");
      expect(src, `${f} importe les constantes`).toMatch(/from "@\/src\/lib\/liensLegaux"/);
      /*
       * TOUT lien sortant de ces écrans, et pas seulement ceux écrits en clair :
       * le bloc du personnel passe par une variable, et c'est justement celui
       * qu'un garde-fou trop littéral aurait laissé filer.
       */
      const liens = [...src.matchAll(/<a\s+href=\{([^}]+)\}([\s\S]{0,120})/g)];
      expect(liens.length, `${f} : au moins un lien`).toBeGreaterThan(0);
      for (const [, cible, suite] of liens) {
        expect(suite, `${f} : {...LIEN_EXTERNE} après href={${cible}}`).toContain("LIEN_EXTERNE");
      }
    }
  });
});
