import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  optionsPaiement,
  refusConfirmation,
  contientSurMesure,
  panierMixte,
  PHRASE_PANIER_MIXTE,
  RAISON_SUR_MESURE_PAIEMENT,
  optionsRemise,
  type LignePanier,
  type ContexteRemise,
} from "@/src/lib/venteEnLigneLogique";
import {
  STATUTS_COMMANDE,
  STATUT_ATTENTE_PAIEMENT,
  statutSuivant,
  estEnRetard,
  libelleStatutCommande,
} from "@/src/lib/personnalisationLogique";

/**
 * APP 38 — un article fait sur mesure se paie avant d'être fabriqué.
 *
 * ── CE QUE CE LOT PROTÈGE ─────────────────────────────────────────────────
 *
 * Un collier gravé au nom d'un chien ne se revend à personne. Le fabriquer
 * avant d'être payé, c'est accepter de le jeter si la cliente ne vient pas.
 * La règle est publiée sur le site : paiement à la commande, fabrication
 * ensuite, annulation gratuite tant qu'elle n'a pas commencé.
 *
 * ── CE QUI NE CHANGE PAS, ET C'EST AUSSI IMPORTANT ────────────────────────
 *
 * Au comptoir, Sabrina encaisse elle-même : la commande naît « a_faire » avec
 * sa date promise, exactement comme avant ce lot. Un test le garde, parce que
 * c'est le parcours quotidien et qu'il n'avait aucune raison de bouger.
 */

const LIGNE = (a: Partial<LignePanier>): LignePanier => ({
  article_id: "art-1",
  libelle: "Article",
  quantite: 1,
  prix_unitaire: 30,
  taux_tva: 8.1,
  ...a,
});

const SUR_MESURE = LIGNE({ libelle: "Collier gravé", type_article: "personnalisable" });
const ORDINAIRE = LIGNE({ article_id: "art-2", libelle: "Laisse", type_article: "stock" });

const CONTEXTE = (lignes: LignePanier[]): ContexteRemise => ({
  lignes,
  reservationAVenir: false,
  grillePort: [{ jusqu_a_grammes: 2000, prix: 9 }],
  poidsMaxGrammes: 30000,
});

// ── D15. Le panier ─────────────────────────────────────────────────────────

describe("« Je paie au retrait » tombe devant le sur mesure", () => {
  it("le mode est grisé, avec la raison en toutes lettres", () => {
    const modes = optionsPaiement([SUR_MESURE]);
    const retrait = modes.find((m) => m.valeur === "sur_place")!;
    expect(retrait.disponible).toBe(false);
    expect(retrait.raison).toBe("Les articles faits sur mesure se paient à la commande.");
  });

  it("« Recevoir une facture » reste possible", () => {
    const facture = optionsPaiement([SUR_MESURE]).find((m) => m.valeur === "facture")!;
    expect(facture.disponible).toBe(true);
    expect(facture.raison).toBeNull();
  });

  it("« Payer en ligne » garde son état actuel, et sa propre raison", () => {
    /**
     * Il est inactif pour une raison qui n'a rien à voir avec le sur mesure :
     * il n'existe pas encore. Le jour où il s'ouvrira, il conviendra au sur
     * mesure sans qu'on touche à cette règle — c'est pour cela qu'elle ne
     * nomme que « au retrait ».
     */
    const enLigne = optionsPaiement([SUR_MESURE]).find((m) => m.valeur === "en_ligne")!;
    expect(enLigne.disponible).toBe(false);
    expect(enLigne.raison).toBeNull();
    expect(enLigne.aide).toBe("Pas encore disponible.");
  });

  it("un panier ordinaire n'est PAS touché", () => {
    const retrait = optionsPaiement([ORDINAIRE]).find((m) => m.valeur === "sur_place")!;
    expect(retrait.disponible).toBe(true);
    expect(retrait.raison).toBeNull();
  });

  it("les trois modes restent affichés, toujours", () => {
    // Un mode absent laisse croire qu'il n'existe pas ; un mode grisé avec sa
    // raison apprend quelque chose. Même règle que les modes de remise.
    expect(optionsPaiement([SUR_MESURE]).map((m) => m.valeur))
      .toEqual(["sur_place", "facture", "en_ligne"]);
  });
});

describe("le serveur refuse la même combinaison, avec la même phrase", () => {
  it("au retrait + sur mesure : refusé", () => {
    /**
     * Le grisé ne suffit pas : une requête forgée arriverait ici avec
     * « sur_place » et un collier gravé dans le panier, et la fabrication
     * partirait sans paiement.
     */
    const refus = refusConfirmation({
      lignes: [SUR_MESURE],
      mode: "retrait",
      contexte: CONTEXTE([SUR_MESURE]),
      modePaiement: "sur_place",
    });
    expect(refus).toBe(RAISON_SUR_MESURE_PAIEMENT);
  });

  it("la phrase est la MÊME des deux côtés", () => {
    const duNavigateur = optionsPaiement([SUR_MESURE])
      .find((m) => m.valeur === "sur_place")!.raison;
    const duServeur = refusConfirmation({
      lignes: [SUR_MESURE],
      mode: "retrait",
      contexte: CONTEXTE([SUR_MESURE]),
      modePaiement: "sur_place",
    });
    expect(duServeur).toBe(duNavigateur);
  });

  it("par facture, le même panier passe", () => {
    expect(
      refusConfirmation({
        lignes: [SUR_MESURE],
        mode: "retrait",
        contexte: CONTEXTE([SUR_MESURE]),
        modePaiement: "facture",
      }),
    ).toBeNull();
  });

  it("au retrait sans sur mesure, rien ne change", () => {
    expect(
      refusConfirmation({
        lignes: [ORDINAIRE],
        mode: "retrait",
        contexte: CONTEXTE([ORDINAIRE]),
        modePaiement: "sur_place",
      }),
    ).toBeNull();
  });

  it("le mode de remise reste jugé AVANT le paiement", () => {
    // Un mode de remise impossible doit continuer de parler en premier : sinon
    // on corrigerait son paiement pour découvrir ensuite que la remise cloche.
    const lignes = [SUR_MESURE];
    const contexte = CONTEXTE(lignes);
    const remise = optionsRemise(contexte).find((o) => !o.disponible);
    if (remise) {
      expect(
        refusConfirmation({ lignes, mode: remise.valeur, contexte, modePaiement: "sur_place" }),
      ).toBe(remise.raison);
    }
  });
});

describe("le panier mixte s'explique", () => {
  it("sur mesure + ordinaire : la phrase se dit", () => {
    expect(panierMixte([SUR_MESURE, ORDINAIRE])).toBe(true);
    expect(PHRASE_PANIER_MIXTE).toContain("toute la commande passe par la facture");
  });

  it("sur mesure seul : rien à expliquer", () => {
    // Le mode grisé porte déjà sa raison ; répéter serait du bruit.
    expect(panierMixte([SUR_MESURE])).toBe(false);
  });

  it("ordinaire seul : rien non plus", () => {
    expect(panierMixte([ORDINAIRE])).toBe(false);
    expect(contientSurMesure([ORDINAIRE])).toBe(false);
  });
});

// ── Le statut ──────────────────────────────────────────────────────────────

describe("« En attente de paiement » est un statut d'atelier à part entière", () => {
  it("il vient AVANT « à faire »", () => {
    const ordre = STATUTS_COMMANDE.map((s) => s.valeur);
    expect(ordre.indexOf(STATUT_ATTENTE_PAIEMENT)).toBe(0);
    expect(ordre.indexOf(STATUT_ATTENTE_PAIEMENT)).toBeLessThan(ordre.indexOf("a_faire"));
  });

  it("son libellé, mot pour mot", () => {
    expect(libelleStatutCommande(STATUT_ATTENTE_PAIEMENT)).toBe("En attente de paiement");
  });

  it("aucun bouton ne le fait avancer", () => {
    /**
     * Ce n'est pas un geste de Sabrina qui le débloque, c'est l'arrivée du
     * paiement. Un « statut suivant » aurait donné un bouton, et le bouton
     * aurait lancé une fabrication non payée.
     */
    expect(statutSuivant(STATUT_ATTENTE_PAIEMENT)).toBeNull();
    // Les autres gardent leur enchaînement.
    expect(statutSuivant("a_faire")).toBe("en_cours");
    expect(statutSuivant("en_cours")).toBe("prete");
  });

  it("il n'est jamais « en retard » : il n'a rien promis", () => {
    expect(estEnRetard("2020-01-01", STATUT_ATTENTE_PAIEMENT, "2026-09-28")).toBe(false);
    expect(estEnRetard(null, STATUT_ATTENTE_PAIEMENT, "2026-09-28")).toBe(false);
    // Une commande à faire, elle, reste en retard.
    expect(estEnRetard("2020-01-01", "a_faire", "2026-09-28")).toBe(true);
  });
});

// ── D16, D17 : ce que la base tient ────────────────────────────────────────

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");

/** La migration d'APP 38, relue dans le dépôt. */
function migrationApp38(): string {
  const f = readdirSync(MIGRATIONS)
    .filter((x) => x.endsWith("_app38_sur_mesure_paye_avant_fabrication.sql"))
    .sort()
    .at(-1);
  if (!f) throw new Error("la migration d'APP 38 est absente du dépôt");
  return readFileSync(join(MIGRATIONS, f), "utf8");
}

describe("la commande d'atelier naît en attente, sans date promise", () => {
  it("la confirmation en ligne demande le statut d'attente", () => {
    const source = readFileSync(
      join(__dirname, "..", "app", "(public)", "catalogue", "actions.ts"), "utf8",
    );
    expect(source).toContain('p_statut: "attente_paiement"');
  });

  it("la base refuse une date promise sur une commande en attente", () => {
    /**
     * Ce n'est pas l'appelant qui décide : la fonction MET la date à null
     * quand le statut est « attente_paiement ». Promettre une date dont le
     * compte à rebours n'a pas commencé serait s'engager sur rien.
     */
    const sql = migrationApp38();
    expect(sql).toMatch(
      /case when p_statut = 'attente_paiement' then null else p_date_promise end/,
    );
  });

  it("une commande ne naît QUE « a_faire » ou « attente_paiement »", () => {
    expect(migrationApp38()).toMatch(/p_statut not in \('a_faire', 'attente_paiement'\)/);
  });
});

describe("le paiement complet, et lui seul, lance la fabrication", () => {
  it("la bascule est accrochée au seul endroit où une facture devient acquittée", () => {
    /**
     * Six chemins mènent au paiement complet — trois en SQL, trois par
     * l'application — et tous passent par `recalculer_paiement_facture`.
     * L'accrocher ailleurs aurait voulu dire l'accrocher six fois.
     */
    const sql = migrationApp38();
    expect(sql).toMatch(
      /if v_statut = 'acquittee' then\s+perform public\.liberer_atelier_commande_payee/,
    );
  });

  it("un paiement partiel ne bascule rien", () => {
    // La garde est le `if` ci-dessus : « partiellement_reglee » ne l'ouvre pas.
    const sql = migrationApp38();
    const apres = sql.slice(sql.indexOf("if v_statut = 'acquittee' then"));
    expect(apres).not.toMatch(/partiellement_reglee[\s\S]{0,80}liberer_atelier/);
  });

  it("un second appel ne change rien : la bascule ne voit que l'attente", () => {
    /**
     * L'idempotence n'est pas un drapeau, c'est le filtre lui-même : une ligne
     * déjà passée « a_faire » n'est plus trouvée. Un rapprochement bancaire
     * qui repasse deux fois ne décale pas la date promise d'une semaine.
     */
    const sql = migrationApp38();
    const bloc = sql.slice(
      sql.indexOf("function public.liberer_atelier_commande_payee"),
      sql.indexOf("revoke execute on function public.liberer_atelier_commande_payee"),
    );
    expect(bloc).toMatch(/cp\.statut = 'attente_paiement'/);
    /*
     * Et la garde est RÉPÉTÉE sur l'UPDATE, contre deux appels simultanés :
     * entre la lecture et l'écriture, un autre a pu passer. Les commentaires
     * SQL sont retirés avant de comparer — la garde compte, sa mise en page non.
     */
    const sansCommentaires = bloc.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");
    expect(sansCommentaires).toMatch(/where id = r\.id and statut = 'attente_paiement'/);
  });

  it("la date promise se compte depuis le jour du PAIEMENT", () => {
    const bloc = migrationApp38();
    expect(bloc).toMatch(/jours_ouvrables_apres\(current_date, coalesce\(r\.delai_jours, 0\)\)/);
  });

  it("chaque bascule s'inscrit au journal, dans la forme des autres statuts", () => {
    const bloc = migrationApp38();
    expect(bloc).toMatch(/'commande', r\.id, 'statut'/);
    expect(bloc).toMatch(/jsonb_build_object\('statut', 'attente_paiement'\)/);
  });
});

describe("le calcul des jours ouvrables existe des DEUX côtés", () => {
  it("la base sait le faire, et saute samedi et dimanche", () => {
    /**
     * Le calcul vivait en TypeScript seulement, ce qui suffisait tant que la
     * date se décidait dans le navigateur. Elle se décide maintenant à
     * l'arrivée d'un virement, sans qu'aucun code applicatif ne tourne.
     *
     * Les deux écritures ont été comparées à l'application de la migration sur
     * 36 520 couples : empreintes identiques. Ce test garde seulement que la
     * fonction SQL existe et nomme sa règle — la comparaison, elle, demande la
     * base, et son résultat est dans le message du commit.
     */
    const sql = migrationApp38();
    expect(sql).toContain("function public.jours_ouvrables_apres(p_depart date, p_jours int)");
    expect(sql).toMatch(/extract\(isodow from v_jour\) < 6/);
  });

  it("elle naît fermée, comme le veut AGENTS.md", () => {
    const sql = migrationApp38();
    for (const f of [
      "public.jours_ouvrables_apres(date, int)",
      "public.liberer_atelier_commande_payee(uuid)",
    ]) {
      expect(sql, f).toContain(`revoke execute on function ${f} from public, anon, authenticated`);
      expect(sql, f).toContain(`grant execute on function ${f} to service_role`);
    }
  });
});

// ── D18. Les écrans du personnel ───────────────────────────────────────────

describe("l'attente de paiement n'est jamais comptée comme du travail", () => {
  it("le tableau de l'atelier ne compte que « à faire » et « en cours »", () => {
    const source = readFileSync(
      join(__dirname, "..", "app", "(admin)", "atelier", "page.tsx"), "utf8",
    );
    expect(source).toMatch(/\.in\("statut", \["a_faire", "en_cours"\]\)/);
    expect(source).not.toContain("attente_paiement");
  });

  it("le suivi de fabrication la retire de ses colonnes, closes comprises", () => {
    /**
     * Elle n'est ni à faire, ni close. La mêler aux sections l'aurait fait
     * compter comme du travail — ou disparaître derrière « Voir les closes »,
     * ce qui revient à ne pas la voir venir.
     */
    const source = readFileSync(
      join(__dirname, "..", "app", "(admin)", "boutique", "commandes", "page.tsx"), "utf8",
    );
    expect(source).toMatch(/s\.valeur !== STATUT_ATTENTE_PAIEMENT/);
  });

  it("elle a son bloc, replié et en lecture seule", () => {
    const source = readFileSync(
      join(__dirname, "..", "app", "(admin)", "boutique", "commandes", "page.tsx"), "utf8",
    );
    expect(source).toContain("En attente de paiement ({enAttente.length})");
    expect(source).toContain("<details");
    // Aucune CarteCommande dans ce bloc : pas de carte, donc pas de bouton
    // d'avancement. Une commande en sort par le paiement, jamais par un clic.
    const bloc = source.slice(source.indexOf("{enAttente.length > 0 &&"), source.indexOf("</details>"));
    expect(bloc).not.toContain("CarteCommande");
  });
});

// ── D19. Le comptoir ───────────────────────────────────────────────────────

describe("au comptoir, RIEN ne change", () => {
  it("la création au comptoir ne demande aucun statut : elle garde le défaut", () => {
    /**
     * Sabrina encaisse elle-même : la commande naît « a_faire », avec sa date
     * promise, comme avant ce lot. C'est le parcours quotidien, et il n'avait
     * aucune raison de bouger.
     */
    const source = readFileSync(join(__dirname, "..", "src", "lib", "personnalisation.ts"), "utf8");
    const appel = source.slice(
      source.indexOf('supabaseAdmin.rpc("creer_commande_sur_mesure"'),
      source.indexOf('supabaseAdmin.rpc("creer_commande_sur_mesure"') + 600,
    );
    expect(appel).toContain("p_date_promise: entree.date_promise");
    expect(appel).not.toContain("p_statut");
  });

  it("et le défaut de la fonction est bien « a_faire »", () => {
    expect(migrationApp38()).toMatch(/p_statut text default 'a_faire'/);
  });

  it("l'ancienne signature est SUPPRIMÉE, pas laissée à côté", () => {
    /**
     * Deux fonctions de même nom auraient coexisté — PostgREST aurait eu à
     * choisir, et le choix ne se serait pas vu.
     */
    expect(migrationApp38()).toMatch(
      /drop function if exists public\.creer_commande_sur_mesure\(\s*text, uuid, uuid, jsonb, numeric, integer, date, text, uuid, jsonb\)/,
    );
  });
});

// ── L'annulation ───────────────────────────────────────────────────────────

/**
 * ── LA PORTÉE A DÉMÉNAGÉ (APP 51) ─────────────────────────────────────────
 *
 * Ce bloc affirmait que l'annulation n'emportait QUE « attente_paiement » —
 * et il le lisait dans la migration d'APP 38, par son nom de fichier. C'était
 * vrai le jour où il a été écrit, et c'est resté vrai de ce FICHIER-LÀ pour
 * toujours : APP 51 a élargi la règle à « a_faire » dans une migration
 * suivante, sans que rien ici ne bronche.
 *
 * Un test qui vise un fichier de migration par son nom ne garde donc pas une
 * règle : il garde une archive. La règle vivante — quels statuts sont
 * emportés, lesquels restent, et pourquoi — est gardée par
 * `tests/annulationEmporteAtelier.test.ts`, qui relit la DERNIÈRE définition
 * de la fonction, quelle que soit la migration qui la porte.
 *
 * Ce qui reste ici est ce qu'APP 38 a réellement établi et qui ne bouge pas :
 * l'annulation d'une commande en ligne touche à l'atelier, et elle le dit au
 * journal des gestes.
 */
describe("APP 38 : l'annulation touche à l'atelier, et le journal l'enregistre", () => {
  it("la fonction d'annulation lit bien les commandes d'atelier liées", () => {
    const sql = migrationApp38();
    const bloc = sql.slice(sql.indexOf("function public.annuler_commande_en_ligne"));
    expect(bloc).toMatch(/join public\.commandes_personnalisees cp on cp\.id = cl\.commande_personnalisee_id/);
  });

  it("et elle le dit au journal, comme tout changement de statut", () => {
    const sql = migrationApp38();
    const bloc = sql.slice(sql.indexOf("function public.annuler_commande_en_ligne"));
    expect(bloc).toMatch(/'commande', r\.id, 'statut'/);
  });
});
