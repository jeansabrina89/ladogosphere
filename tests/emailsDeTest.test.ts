import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  MESSAGE_ADRESSE_INVALIDE,
  MESSAGE_AUCUN_TYPE,
  MESSAGE_PLAFOND,
  PLAFOND_ENVOIS,
  PREFIXE_TEST,
  TYPES_EMAIL_TEST,
  adresseValide,
  clesRetenues,
  debutFenetre,
  donneesExemple,
  pdfDemonstration,
  refusGardeFou,
  typeEmailTest,
} from "@/src/lib/emailsDeTest";
import {
  MESSAGE_SANS_ARTICLE,
  MESSAGE_SANS_COMMANDE,
  clesSansEtape,
  envoyerEmailsDeTest,
  type ContexteEnvoiTest,
  type FonctionsEnvoi,
} from "@/src/lib/emailsDeTestEnvoi";

/**
 * Envoi d'e-mails de test depuis Réglages → E-mails.
 *
 * Ce qu'on vérifie ici : que la liste n'oublie aucune fonction d'envoi, que le
 * journal les marque `test:`, qu'un envoi de test n'écrit nulle part ailleurs,
 * et que les deux garde-fous tiennent.
 */

const RACINE = join(__dirname, "..");
const lire = (...m: string[]) => readFileSync(join(RACINE, ...m), "utf8");

/** Le code sans ses commentaires : un garde-fou ne se déclenche pas sur sa propre explication. */
const sansCommentaires = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SOURCE_EMAIL = lire("src", "lib", "email.ts");
const SOURCE_ROUTE = lire("app", "api", "emails", "test", "route.ts");
const SOURCE_ENVOI = lire("src", "lib", "emailsDeTestEnvoi.ts");

// ── La liste n'oublie personne ─────────────────────────────────────────────

/** Les exports `envoyer…` de src/lib/email.ts, lus dans le fichier lui-même. */
function exportsDEnvoi(): string[] {
  return [...SOURCE_EMAIL.matchAll(/^export async function (envoyer\w+)/gm)].map((m) => m[1]);
}

describe("tous les e-mails de l’application sont proposés", () => {
  it("le fichier est bien relu (garde-fou du garde-fou)", () => {
    expect(exportsDEnvoi().length).toBeGreaterThanOrEqual(17);
  });

  it("chaque fonction d’envoi exportée a au moins un type dans la liste", () => {
    // C'est LE test qui compte : ajouter un e-mail à l'application sans
    // l'ajouter ici le rendrait intestable, et personne ne s'en apercevrait.
    const proposees = new Set(TYPES_EMAIL_TEST.map((t) => t.fonction));
    const oubliees = exportsDEnvoi().filter((f) => !proposees.has(f));
    expect(oubliees).toEqual([]);
  });

  it("aucun type ne désigne une fonction qui n’existe pas", () => {
    const reelles = new Set(exportsDEnvoi());
    const fantomes = TYPES_EMAIL_TEST.filter((t) => !reelles.has(t.fonction)).map((t) => t.cle);
    expect(fantomes).toEqual([]);
  });

  it("les clés sont uniques et chaque type a un libellé", () => {
    const cles = TYPES_EMAIL_TEST.map((t) => t.cle);
    expect(new Set(cles).size).toBe(cles.length);
    for (const t of TYPES_EMAIL_TEST) {
      expect(t.libelle.trim(), t.cle).not.toBe("");
      expect(t.typeJournal.trim(), t.cle).not.toBe("");
    }
  });

  it("chaque type de la liste a une étape d’envoi", () => {
    expect(clesSansEtape(contexte(), doublures().fonctions)).toEqual([]);
  });

  it("les clés reçues sont filtrées et remises dans l’ordre de la liste", () => {
    expect(clesRetenues(["paiement", "inconnu", "message_libre", "paiement"]))
      .toEqual(["message_libre", "paiement"]);
    expect(clesRetenues("pas un tableau")).toEqual([]);
    expect(clesRetenues(undefined)).toEqual([]);
  });

  it("chaque type se retrouve par sa clé", () => {
    expect(typeEmailTest("facture_emise")?.fonction).toBe("envoyerEmailFactureEmise");
    expect(typeEmailTest("inexistant")).toBeNull();
  });
});

// ── Le préfixe du journal ──────────────────────────────────────────────────

describe("le journal distingue un test d’un vrai message", () => {
  it("le préfixe est `test:`", () => {
    expect(PREFIXE_TEST).toBe("test:");
  });

  it("`envoyerEmail` préfixe le type et n’écrit aucune réservation", () => {
    const insertion = SOURCE_EMAIL.slice(
      SOURCE_EMAIL.indexOf('from("emails_envoyes").insert('),
      SOURCE_EMAIL.indexOf("if (error) {", SOURCE_EMAIL.indexOf('from("emails_envoyes").insert('))
    );
    expect(insertion).toContain("test ? PREFIXE_TEST + p.type : p.type");
    expect(insertion).toContain("reservation_id: test ? null : (p.reservationId ?? null)");
  });

  it("la marque est portée par l’appel, jamais par un drapeau de module", () => {
    // Un drapeau partagé marquerait `test:` un vrai e-mail parti en même temps.
    expect(SOURCE_EMAIL).toContain("AsyncLocalStorage");
    expect(SOURCE_EMAIL).toContain("export function dansEnvoiDeTest");
    expect(SOURCE_EMAIL).not.toMatch(/let\s+\w*[eE]nvoiDeTest\w*\s*=/);
  });

  it("la route enveloppe TOUS ses envois dans cette marque", () => {
    expect(SOURCE_ROUTE).toContain("dansEnvoiDeTest(() =>");
    expect(SOURCE_ROUTE).toContain("envoyerEmailsDeTest(");
  });
});

// ── Aucun effet de bord ────────────────────────────────────────────────────

/** Une base simulée : on compte ses lignes avant et après. */
function baseSimulee() {
  const tables: Record<string, number> = {
    emails_envoyes: 0,
    emails_campagnes: 4,
    alertes_stock: 7,
    factures: 11,
    commandes: 1,
    reservations: 9,
    clients: 3,
    articles: 5,
  };
  return {
    tables,
    instantane: () => ({ ...tables }),
    /** Ce que fait `envoyerEmail` : une ligne au journal, et rien d'autre. */
    journaliser: () => { tables.emails_envoyes += 1; },
  };
}

function contexte(sur: Partial<ContexteEnvoiTest> = {}): ContexteEnvoiTest {
  return {
    destinataire: "sabrina@exemple.test",
    donnees: donneesExemple(new Date("2026-09-16T10:00:00Z")),
    iban: "CH00 0000 0000 0000 0000 0",
    titulaire: "La Dogosphère",
    tokenDesinscription: "jeton-reel",
    facture: { numero: "FAC-2026-0008", date: "2026-07-15", echeance: "2026-08-14", montant: 120, pdf: Buffer.from("pdf") },
    commandeId: "cmd-1",
    article: { id: "art-1", nom: "Collier", prix: 68, photoUrl: null },
    ...sur,
  };
}

/** Des doublures qui enregistrent, et journalisent comme le fait la vraie. */
function doublures(base = baseSimulee(), echouer: string[] = []) {
  const appels: { fonction: string; destinataire: string }[] = [];
  const faire = (nom: string) => async (
    p: { email?: string } | string,
    // Selon la fonction de commande : l'adresse seule, ou des options qui la portent.
    d?: string | null | { destinataire?: string | null },
  ) => {
    const surCommande = typeof d === "object" && d !== null ? d.destinataire : d;
    const destinataire = typeof p === "string" ? (surCommande ?? "(depuis la commande)") : (p.email ?? "");
    appels.push({ fonction: nom, destinataire });
    if (echouer.includes(nom)) throw new Error(`Resend: échec complet et non tronqué pour ${nom}`);
    base.journaliser();
  };
  const fonctions = Object.fromEntries(
    TYPES_EMAIL_TEST.map((t) => [t.fonction, faire(t.fonction)])
  ) as unknown as FonctionsEnvoi;
  return { fonctions, appels };
}

const TOUTES = TYPES_EMAIL_TEST.map((t) => t.cle);

describe("un envoi de test n’écrit que dans emails_envoyes", () => {
  it("toutes les autres tables ont le même nombre de lignes avant et après", async () => {
    const base = baseSimulee();
    const avant = base.instantane();

    await envoyerEmailsDeTest({
      cles: TOUTES,
      contexte: contexte(),
      envois: doublures(base).fonctions,
      lireResendId: async () => "re_123",
    });

    const apres = base.instantane();
    for (const table of Object.keys(avant)) {
      if (table === "emails_envoyes") continue;
      expect(apres[table], table).toBe(avant[table]);
    }
    expect(apres.emails_envoyes).toBeGreaterThan(avant.emails_envoyes);
  });

  it("ni la route ni l’orchestrateur n’écrivent quoi que ce soit", () => {
    for (const [nom, source] of [["route", SOURCE_ROUTE], ["orchestrateur", SOURCE_ENVOI]] as const) {
      expect(source, nom).not.toMatch(/\.insert\(/);
      expect(source, nom).not.toMatch(/\.update\(/);
      expect(source, nom).not.toMatch(/\.upsert\(/);
      expect(source, nom).not.toMatch(/\.delete\(/);
    }
  });

  it("aucun marqueur d’envoi n’est touché", () => {
    // Sur le CODE seul : les commentaires ont le droit de nommer ce qu'on a
    // justement décidé de ne pas faire, et c'est même là qu'il faut le dire.
    const code = sansCommentaires(SOURCE_ROUTE);
    for (const interdit of [
      "notifie_le", "emails_campagnes", "pdf_path",
      "genererPdfFacture", "finaliserEmission",
    ]) {
      expect(code, interdit).not.toContain(interdit);
    }
    // Le PDF est LU, jamais généré : le générer écrirait sur la facture.
    // `lirePdfFacture` remplace `telechargerPdf` depuis le 24 septembre 2026 :
    // elle distingue « jamais créé » de « perdu », et ne fabrique rien.
    expect(code).toContain("lirePdfFacture(");
  });

  it("le jeton d’un retour en stock est factice : aucune alerte n’est lue", () => {
    expect(SOURCE_ENVOI).toContain("test-jeton-sans-alerte");
    expect(SOURCE_ROUTE).not.toContain("alertes_stock");
  });
});

// ── Ce qui manque ne fait pas échouer ──────────────────────────────────────

describe("une donnée absente n’est pas un échec", () => {
  it("sans commande, les deux types qui en dépendent le disent", async () => {
    const r = await envoyerEmailsDeTest({
      cles: ["commande_confirmee", "commande_prete", "commande_expediee"],
      contexte: contexte({ commandeId: null }),
      envois: doublures().fonctions,
      lireResendId: async () => "re_1",
    });
    expect(r.map((x) => [x.cle, x.statut, x.message])).toEqual([
      ["commande_confirmee", "indisponible", MESSAGE_SANS_COMMANDE],
      // Celle-ci reçoit son destinataire en paramètre : aucune commande requise.
      ["commande_prete", "envoye", null],
      ["commande_expediee", "indisponible", MESSAGE_SANS_COMMANDE],
    ]);
  });

  it("sans article publié en stock, le retour en stock le dit", async () => {
    const r = await envoyerEmailsDeTest({
      cles: ["retour_en_stock"],
      contexte: contexte({ article: null }),
      envois: doublures().fonctions,
      lireResendId: async () => null,
    });
    expect(r[0].statut).toBe("indisponible");
    expect(r[0].message).toBe(MESSAGE_SANS_ARTICLE);
  });

  it("les commandes visent bien l’adresse choisie, pas celle du client", async () => {
    const { fonctions, appels } = doublures();
    await envoyerEmailsDeTest({
      cles: ["commande_confirmee", "commande_expediee"],
      contexte: contexte(),
      envois: fonctions,
      lireResendId: async () => null,
    });
    expect(appels.map((a) => a.destinataire)).toEqual([
      "sabrina@exemple.test",
      "sabrina@exemple.test",
    ]);
  });
});

describe("un échec n’arrête pas les suivants", () => {
  it("chaque type est tenté, et le message remonte entier", async () => {
    const r = await envoyerEmailsDeTest({
      cles: ["paiement", "rappel_veille", "satisfaction_essai"],
      contexte: contexte(),
      envois: doublures(baseSimulee(), ["envoyerEmailRappelVeille"]).fonctions,
      lireResendId: async () => "re_9",
    });
    expect(r.map((x) => x.statut)).toEqual(["envoye", "echec", "envoye"]);
    expect(r[1].message).toBe(
      "Resend: échec complet et non tronqué pour envoyerEmailRappelVeille"
    );
    // Non tronqué : l'écran affiche exactement ce que la route a reçu.
    expect(SOURCE_ENVOI).not.toMatch(/message[^\n]*\.slice\(/);
  });
});

// ── Les garde-fous ─────────────────────────────────────────────────────────

describe("l’adresse", () => {
  it("accepte une adresse ordinaire", () => {
    for (const a of ["sabrina@exemple.ch", "test+lot@mail.example.com", " a@b.io "]) {
      expect(adresseValide(a), a).toBe(true);
    }
  });

  it("refuse le vide, l’espace et l’absence de domaine", () => {
    for (const a of ["", "   ", null, undefined, "sansarobase", "a@b", "a b@c.ch", "a@@b.ch"]) {
      expect(adresseValide(a as string), String(a)).toBe(false);
    }
  });

  it("le refus le dit", () => {
    expect(refusGardeFou({ destinataire: "", cles: ["paiement"], envoisRecents: 0 }))
      .toBe(MESSAGE_ADRESSE_INVALIDE);
  });
});

describe("le plafond de trente envois", () => {
  it("laisse passer tant qu’on reste sous la barre", () => {
    expect(refusGardeFou({ destinataire: "a@b.ch", cles: ["paiement"], envoisRecents: 0 })).toBeNull();
    expect(refusGardeFou({
      destinataire: "a@b.ch",
      cles: Array(5).fill("paiement"),
      envoisRecents: PLAFOND_ENVOIS - 5,
    })).toBeNull();
  });

  it("refuse dès que la demande ferait dépasser", () => {
    expect(refusGardeFou({
      destinataire: "a@b.ch",
      cles: Array(2).fill("paiement"),
      envoisRecents: PLAFOND_ENVOIS - 1,
    })).toBe(MESSAGE_PLAFOND);
    expect(refusGardeFou({
      destinataire: "a@b.ch",
      cles: ["paiement"],
      envoisRecents: PLAFOND_ENVOIS,
    })).toBe(MESSAGE_PLAFOND);
  });

  it("refuse aussi une demande sans aucun type", () => {
    expect(refusGardeFou({ destinataire: "a@b.ch", cles: [], envoisRecents: 0 }))
      .toBe(MESSAGE_AUCUN_TYPE);
  });

  it("la fenêtre remonte de dix minutes", () => {
    const debut = debutFenetre(new Date("2026-09-16T10:00:00.000Z"));
    expect(debut).toBe("2026-09-16T09:50:00.000Z");
  });

  it("la route compte bien les lignes `test:` de la fenêtre", () => {
    expect(SOURCE_ROUTE).toContain('.like("type", `${PREFIXE_TEST}%`)');
    expect(SOURCE_ROUTE).toContain("debutFenetre(");
    expect(SOURCE_ROUTE).toContain("refusGardeFou(");
  });
});

describe("la route est réservée à l’administration", () => {
  it("elle refuse avant toute autre chose", () => {
    const debut = SOURCE_ROUTE.slice(SOURCE_ROUTE.indexOf("export async function POST"));
    const garde = debut.indexOf("exigerAdminApi(supabase)");
    const lecture = debut.indexOf("lireCorpsJson");
    expect(garde).toBeGreaterThan(-1);
    // La garde passe AVANT la lecture du corps : rien n'est fait sans elle.
    expect(garde).toBeLessThan(lecture);
    expect(debut).toContain("if (refusAcces) return refusAcces;");
  });

  it("c’est la même règle que les autres routes d’e-mails", () => {
    // Une seule garde (garde.ts) : les routes d'e-mails exigent l'admin par elle.
    const modeles = lire("app", "api", "emails", "modeles", "route.ts");
    expect(modeles).toContain("exigerAdmin(");
    const permissions = lire("src", "lib", "permissions.ts");
    expect(permissions).toContain("export async function exigerAdminApi");
    expect(permissions).toContain("adminSeul: true");
  });
});

// ── Les valeurs d'exemple ──────────────────────────────────────────────────

describe("les valeurs d’exemple", () => {
  const d = donneesExemple(new Date("2026-09-16T10:00:00Z"));

  it("nomment Sabrina et Pixel", () => {
    expect(d.prenom).toBe("Sabrina");
    expect(d.nomChien).toBe("Pixel");
  });

  it("placent le séjour dans deux semaines, et l’adhésion échue au passé", () => {
    expect(d.dateDebut).toBe("2026-09-30");
    expect(d.dateFin).toBe("2026-10-03");
    expect(d.dateFinAdhesion < d.dateFacture).toBe(true);
  });

  it("donnent des montants en francs, jamais en centimes", () => {
    expect(d.montant).toBe(240);
    expect(d.montantAdhesion).toBe(200);
  });
});

describe("la pièce jointe de démonstration", () => {
  const pdf = pdfDemonstration("Ticket de demonstration TIC-0000-TEST");

  it("est un PDF avec son en-tête et sa fin", () => {
    const texte = pdf.toString("latin1");
    expect(texte.startsWith("%PDF-1.4")).toBe(true);
    expect(texte.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("porte une table xref dont les décalages pointent sur les objets", () => {
    const texte = pdf.toString("latin1");
    const depart = Number(/startxref\n(\d+)/.exec(texte)![1]);
    expect(texte.slice(depart, depart + 4)).toBe("xref");
    for (const m of texte.matchAll(/^(\d{10}) 00000 n $/gm)) {
      const position = Number(m[1]);
      expect(texte.slice(position)).toMatch(/^\d+ 0 obj/);
    }
  });
});
