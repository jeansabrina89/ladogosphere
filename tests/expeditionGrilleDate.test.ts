import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  AIDE_POIDS,
  expediableParDefaut,
  lirePoidsGrammes,
  manquePoids,
} from "@/src/lib/boutiqueLogique";
import {
  fraisPort,
  grilleCoherente,
  grilleEnSaisie,
  lireGrillePort,
  lireSaisieGrille,
  optionRemise,
  trierPaliers,
  validerGrillePort,
  type LignePanier,
  type PalierPort,
} from "@/src/lib/venteEnLigneLogique";
import { dateLocaleISO, formatDateFR, formatHorodatage } from "@/src/lib/dates";

const RACINE = join(__dirname, "..");
const lire = (rel: string) => readFileSync(join(RACINE, rel), "utf8");

// ── A. L'expédition décidée par article ───────────────────────────────────

describe("la case « Expédiable par la poste », proposée par la catégorie", () => {
  it("décochée pour l'alimentation humide et la litière", () => {
    expect(expediableParDefaut("alimentation_humide")).toBe(false);
    expect(expediableParDefaut("litiere")).toBe(false);
  });

  it("cochée pour tout le reste, alimentation sèche comprise", () => {
    for (const c of ["alimentation_seche", "friandises", "mastication", "colliers", "jouets", "soins", "divers", "", null]) {
      expect(expediableParDefaut(c), String(c)).toBe(true);
    }
  });

  it("la catégorie ne fait que proposer : à la création seulement, et tant que la case n'a pas été touchée", () => {
    const form = lire("app/(admin)/boutique/articles/FormArticle.tsx");
    expect(form).toContain("if (!article && !expediableTouche) setExpediable(expediableParDefaut(valeur));");
    expect(form).toContain("article?.expediable ?? expediableParDefaut(article?.categorie)");
    expect(form).toContain("onChange={(e) => { setExpediable(e.target.checked); setExpediableTouche(true); }}");
  });
});

describe("le poids, en grammes", () => {
  it("entier positif, ou vide", () => {
    expect(lirePoidsGrammes("")).toEqual({ ok: true, valeur: null });
    expect(lirePoidsGrammes("3000")).toEqual({ ok: true, valeur: 3000 });
    expect(lirePoidsGrammes("3'000")).toEqual({ ok: true, valeur: 3000 });
    for (const refuse of ["0", "-5", "0,75", "3.5", "abc"]) {
      expect(lirePoidsGrammes(refuse).ok, refuse).toBe(false);
    }
  });

  it("le formulaire dit pourquoi le poids compte", () => {
    expect(AIDE_POIDS).toBe("Sans poids, l'article ne peut pas être expédié.");
    expect(lire("app/(admin)/boutique/articles/FormArticle.tsx")).toContain("<p style={aide}>{AIDE_POIDS}</p>");
  });

  it("« sans poids » : ni le sur mesure, ni les fournitures d'atelier", () => {
    expect(manquePoids({ type_article: "standard", composant: false, poids_grammes: null })).toBe(true);
    expect(manquePoids({ type_article: "standard", composant: false, poids_grammes: 500 })).toBe(false);
    expect(manquePoids({ type_article: "personnalisable", composant: false, poids_grammes: null })).toBe(false);
    expect(manquePoids({ type_article: "standard", composant: true, poids_grammes: null })).toBe(false);
  });

  it("le sur mesure garde la règle du panier : ni pesé, ni soumis à la case", () => {
    const grille: PalierPort[] = [{ jusqu_a_grammes: 2000, prix: 9 }, { jusqu_a_grammes: 10000, prix: 12 }];
    const surMesure: LignePanier = {
      article_id: "c", libelle: "Collier sur mesure", quantite: 1, prix_unitaire: 43, taux_tva: 8.1,
      poids_grammes: null, expediable: false, type_article: "personnalisable",
    };
    expect(optionRemise({ lignes: [surMesure], reservationAVenir: false, grillePort: grille, poidsMaxGrammes: 10000 }, "postal"))
      .toMatchObject({ disponible: true, frais: 9 });
  });

  it("l'action n'écrit le poids et la case que si le bloc a été montré", () => {
    const action = lire("app/(admin)/boutique/actions.ts");
    expect(action).toMatch(/if \(formData\.get\("envoi_postal"\) === "1"\) \{[\s\S]*?lirePoidsGrammes[\s\S]*?expediable = formData\.get\("expediable"\) === "on";/);
    const form = lire("app/(admin)/boutique/articles/FormArticle.tsx");
    expect(form).toContain(`<input type="hidden" name="envoi_postal" value="1" />`);
    // Le bloc n'apparaît ni à l'atelier, ni pour un article sur mesure.
    expect(form).toMatch(/\{!atelier && \([\s\S]*?Envoi postal[\s\S]*?typeArticle === "personnalisable" \?/);
  });

  it("la liste montre la colonne « Poste » et filtre « sans poids », à la boutique seulement", () => {
    const liste = lire("app/components/stock/CatalogueStock.tsx");
    expect(liste).toContain(`{boutique && <th className="py-2 font-medium" style={{ paddingLeft: 12 }}>Poste</th>}`);
    expect(liste).toContain("href={`${config.liste}?sanspoids=1`}");
    expect(lire("app/(admin)/boutique/articles/page.tsx")).toContain("if (seulementSansPoids && !manquePoids(a)) return false;");
    expect(lire("app/components/stock/FiltresArticles.tsx")).toContain(`if (filtrePoids && (sur?.sansPoids ?? sansPoids)) p.set("sanspoids", "1");`);
  });
});

// ── B. La grille des frais de port ────────────────────────────────────────

/** La grille posée par la migration du 22 septembre 2026. */
const GRILLE: PalierPort[] = [{ jusqu_a_grammes: 2000, prix: 9 }, { jusqu_a_grammes: 10000, prix: 12 }];

describe("fraisPort avec la nouvelle grille", () => {
  it("1 kg → 9, 2 kg exactement → 9, 2,1 kg → 12, 10 kg → 12, 10,1 kg → refus", () => {
    expect(fraisPort(1000, GRILLE)).toBe(9);
    expect(fraisPort(2000, GRILLE)).toBe(9);
    expect(fraisPort(2100, GRILLE)).toBe(12);
    expect(fraisPort(10000, GRILLE)).toBe(12);
    expect(fraisPort(10100, GRILLE)).toBeNull();
  });

  it("au-delà du poids maximum, l'envoi postal est refusé avec sa raison", () => {
    const lourd: LignePanier = {
      article_id: "a", libelle: "Sac", quantite: 1, prix_unitaire: 30, taux_tva: 2.6,
      poids_grammes: 10100, expediable: true, type_article: "standard",
    };
    const o = optionRemise({ lignes: [lourd], reservationAVenir: false, grillePort: GRILLE, poidsMaxGrammes: 10000 }, "postal");
    expect(o).toMatchObject({ disponible: false, frais: null });
    expect(o.raison).toContain("dépasse 10 kg");
  });

  it("une grille vide ou incohérente refuse proprement, jamais un 0", () => {
    expect(fraisPort(500, [])).toBeNull();
    expect(fraisPort(500, [{ jusqu_a_grammes: 2000, prix: 9 }, { jusqu_a_grammes: 2000, prix: 12 }])).toBeNull();
    expect(fraisPort(500, [{ jusqu_a_grammes: 2000, prix: 9 }, { jusqu_a_grammes: 1000, prix: 12 }])).toBeNull();
    expect(fraisPort(500, [{ jusqu_a_grammes: 2000, prix: -1 }])).toBeNull();
    expect(fraisPort(500, [{ jusqu_a_grammes: 2000, prix: Number.NaN }])).toBeNull();
  });
});

describe("la grille lue en base ne se répare pas en silence", () => {
  it("la grille de la migration se lit telle quelle", () => {
    expect(lireGrillePort('[{"jusqu_a_grammes":2000,"prix":9},{"jusqu_a_grammes":10000,"prix":12}]')).toEqual(GRILLE);
  });

  it("un prix illisible ne devient pas 0 : toute la grille est refusée", () => {
    expect(lireGrillePort('[{"jusqu_a_grammes":2000,"prix":"neuf"},{"jusqu_a_grammes":10000,"prix":12}]')).toEqual([]);
    expect(lireGrillePort('[{"jusqu_a_grammes":2000},{"jusqu_a_grammes":10000,"prix":12}]')).toEqual([]);
  });

  it("un palier invalide ou en double fait refuser la grille, pas seulement la ligne", () => {
    expect(lireGrillePort('[{"jusqu_a_grammes":0,"prix":9},{"jusqu_a_grammes":10000,"prix":12}]')).toEqual([]);
    expect(lireGrillePort('[{"jusqu_a_grammes":2000,"prix":9},{"jusqu_a_grammes":2000,"prix":12}]')).toEqual([]);
    expect(lireGrillePort("pas du json")).toEqual([]);
  });

  it("une grille valide mais dans le désordre se lit triée", () => {
    expect(lireGrillePort('[{"jusqu_a_grammes":10000,"prix":12},{"jusqu_a_grammes":2000,"prix":9}]')).toEqual(GRILLE);
  });
});

describe("la validation de la grille saisie", () => {
  it("accepte la grille de la migration avec un colis de 10 kg au plus", () => {
    expect(validerGrillePort({ paliers: GRILLE, poidsMaxGrammes: 10000 })).toEqual({ ok: true });
  });

  it("refuse des paliers non croissants", () => {
    const r = validerGrillePort({ paliers: [{ jusqu_a_grammes: 5000, prix: 12 }, { jusqu_a_grammes: 2000, prix: 9 }], poidsMaxGrammes: 10000 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain("strictement croissants");
    expect(validerGrillePort({ paliers: [{ jusqu_a_grammes: 2000, prix: 9 }, { jusqu_a_grammes: 2000, prix: 12 }], poidsMaxGrammes: 10000 }).ok).toBe(false);
  });

  it("refuse un dernier palier au-delà du poids maximum", () => {
    const r = validerGrillePort({ paliers: [{ jusqu_a_grammes: 2000, prix: 9 }, { jusqu_a_grammes: 12000, prix: 15 }], poidsMaxGrammes: 10000 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain("dépasse le poids maximum");
  });

  it("refuse une grille vide, un prix négatif, un poids maximum nul", () => {
    expect(validerGrillePort({ paliers: [], poidsMaxGrammes: 10000 }).ok).toBe(false);
    expect(validerGrillePort({ paliers: [{ jusqu_a_grammes: 2000, prix: -1 }], poidsMaxGrammes: 10000 }).ok).toBe(false);
    expect(validerGrillePort({ paliers: GRILLE, poidsMaxGrammes: 0 }).ok).toBe(false);
  });

  it("accepte un prix nul : un palier peut être gratuit", () => {
    expect(validerGrillePort({ paliers: [{ jusqu_a_grammes: 2000, prix: 0 }], poidsMaxGrammes: 10000 })).toEqual({ ok: true });
  });

  it("la saisie de l'écran : kilos convertis en grammes, lignes vides ignorées, tri automatique", () => {
    const r = lireSaisieGrille({
      lignes: [{ kg: "10", prix: "12" }, { kg: "", prix: "" }, { kg: "2", prix: "9,00" }],
      poidsMaxKg: "10",
    });
    expect(r).toEqual({ ok: true, paliers: GRILLE, poidsMaxGrammes: 10000 });
    // 0,5 kg = 500 g, et l'aller-retour vers l'écran rend la même chose.
    const demi = lireSaisieGrille({ lignes: [{ kg: "0,5", prix: "7" }], poidsMaxKg: "10" });
    expect(demi).toEqual({ ok: true, paliers: [{ jusqu_a_grammes: 500, prix: 7 }], poidsMaxGrammes: 10000 });
    expect(grilleEnSaisie(GRILLE)).toEqual([{ kg: "2", prix: "9.00" }, { kg: "10", prix: "12.00" }]);
  });

  it("la saisie de l'écran refuse ce qu'elle ne sait pas lire", () => {
    expect(lireSaisieGrille({ lignes: [{ kg: "2", prix: "" }], poidsMaxKg: "10" }).ok).toBe(false);
    expect(lireSaisieGrille({ lignes: [{ kg: "deux", prix: "9" }], poidsMaxKg: "10" }).ok).toBe(false);
    expect(lireSaisieGrille({ lignes: [{ kg: "2", prix: "9" }], poidsMaxKg: "" }).ok).toBe(false);
    expect(lireSaisieGrille({ lignes: [{ kg: "12", prix: "15" }], poidsMaxKg: "10" }).ok).toBe(false);
    expect(lireSaisieGrille({ lignes: [], poidsMaxKg: "10" }).ok).toBe(false);
  });

  it("une grille triée est cohérente, une grille en double ne l'est pas", () => {
    expect(grilleCoherente(trierPaliers([{ jusqu_a_grammes: 10000, prix: 12 }, { jusqu_a_grammes: 2000, prix: 9 }]))).toBe(true);
    expect(grilleCoherente([])).toBe(false);
  });

  it("l'écran écrit au format que lit fraisPort, et trace chaque changement", () => {
    const action = lire("app/(admin)/(espace-reglages)/reglages/boutique/actions.ts");
    expect(action).toContain("{ cle: CLE_GRILLE, valeur: JSON.stringify(saisie.paliers), updated_at: maintenant }");
    expect(action).toContain(`evenement: "frais_port_grille"`);
    expect(lire("src/lib/journalEvenements.ts")).toContain(`frais_port_grille: "Grille des frais de port modifiée"`);
  });

  it("la migration pose les deux paliers et laisse le poids maximum à 10 kg", () => {
    const sql = lire("supabase/migrations/20260921224524_boutique_grille_port_deux_paliers.sql");
    expect(sql).toContain(`'[{"jusqu_a_grammes":2000,"prix":9},{"jusqu_a_grammes":10000,"prix":12}]'`);
    expect(sql).not.toMatch(/poids_max_colis_grammes'\s*,|set valeur = '\d+'/);
    expect(sql).toContain("insert into public.journal_evenements");
  });
});

// ── C. La date locale ─────────────────────────────────────────────────────

describe("la date d'une commande, à l'heure de Sion", () => {
  it("minuit et demi le 22 (22 h 31 UTC le 21) est du 22", () => {
    const confirmee = "2026-09-21T22:31:33.460+00:00";
    expect(formatDateFR(confirmee)).toBe("22/09/2026");
    expect(dateLocaleISO(confirmee)).toBe("2026-09-22");
    expect(formatHorodatage(confirmee)).toBe("22.09.2026 00:31");
    // La forme sans « T » que renvoie parfois la base.
    expect(formatDateFR("2026-09-21 22:31:33+00")).toBe("22/09/2026");
  });

  it("en hiver aussi (UTC+1)", () => {
    expect(formatDateFR("2026-01-14T23:30:00Z")).toBe("15/01/2026");
    expect(dateLocaleISO("2026-01-14T22:59:00Z")).toBe("2026-01-14");
  });

  it("une date seule ne bouge pas, un horodatage sans fuseau garde son jour", () => {
    expect(formatDateFR("2026-09-21")).toBe("21/09/2026");
    expect(dateLocaleISO("2026-09-21")).toBe("2026-09-21");
    expect(formatDateFR("2026-09-21T22:31:33")).toBe("21/09/2026");
  });

  it("les écrans et documents de la boutique ne tronquent plus un horodatage UTC", () => {
    const bon = lire("app/(admin)/boutique/commandes-en-ligne/[id]/bon/page.tsx");
    expect(bon).toContain("formatDateFR(commande.confirmee_le)");
    expect(bon).not.toMatch(/confirmee_le\.slice\(0, 10\)/);
    expect(lire("app/(client)/mon-compte/commandes/page.tsx")).not.toMatch(/confirmee_le\.slice\(0, 10\)/);
    const ticket = lire("src/lib/ticketDocument.ts");
    expect(ticket).toContain("const dateVente = dateLocaleISO(vente.date_vente);");
    expect(ticket).toContain("date: formatHorodatage(vente.date_vente),");
    expect(ticket).not.toMatch(/date_vente\)\.slice\(0, 10\)/);
    expect(lire("app/(admin)/boutique/caisse/actions.ts")).toContain("date: dateLocaleISO(vente.date_vente),");
    expect(lire("app/(admin)/boutique/ventes/page.tsx")).toContain("const heure = formatHeure(v.date_vente);");
    expect(lire("app/(admin)/boutique/ventes/[id]/page.tsx")).not.toMatch(/toLocaleString\("fr-CH"\)/);
  });
});
