import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  avertissementFermeturePersonnel,
  fermetureAVenir,
  fermetureQuiEmpeche,
  jourFerme,
  joursDeFermeture,
  joursFermes,
  messageFermeture,
  refusFermeture,
  reservationsAContacter,
  type Fermeture,
} from "@/src/lib/fermeturesPensionLogique";

/**
 * APP 59 — les fermetures de la pension.
 *
 * ── LA NUANCE QUI FAIT TOUT ───────────────────────────────────────────────
 *
 * Pendant une fermeture, aucune ARRIVÉE et aucun DÉPART. Les chiens déjà en
 * séjour restent. Un séjour qui ENJAMBE la fermeture — arrivée avant, départ
 * après — est donc parfaitement possible.
 *
 * Traiter la fermeture comme « ces jours-là sont interdits » aurait refusé le
 * séjour de Noël de quelqu'un parti le 20 et revenu le 30 : celui-là même que
 * la fermeture est censée permettre. C'est le premier test de ce fichier, et
 * c'est le seul qui distingue cette règle d'un simple calendrier barré.
 */

const NOEL: Fermeture = { date_debut: "2027-12-24", date_fin: "2027-12-26", motif: "Vacances annuelles" };
const SANS_MOTIF: Fermeture = { date_debut: "2027-07-01", date_fin: "2027-07-02", motif: null };

// ── La règle ──────────────────────────────────────────────────────────────

describe("ni arrivée ni départ pendant une fermeture", () => {
  it("UN SÉJOUR QUI ENJAMBE LA FERMETURE EST ACCEPTÉ", () => {
    // Arrivée le 20, départ le 30 : le chien est là pendant la fermeture, et
    // c'est exactement ce qu'une fermeture de Noël doit permettre.
    expect(fermetureQuiEmpeche("2027-12-20", "2027-12-30", [NOEL])).toBeNull();
  });

  it("une arrivée DANS la fermeture est refusée", () => {
    expect(fermetureQuiEmpeche("2027-12-25", "2027-12-30", [NOEL])).toEqual(NOEL);
  });

  it("un départ DANS la fermeture est refusé", () => {
    expect(fermetureQuiEmpeche("2027-12-20", "2027-12-25", [NOEL])).toEqual(NOEL);
  });

  it("les deux bornes sont INCLUSIVES", () => {
    expect(fermetureQuiEmpeche("2027-12-24", "2027-12-24", [NOEL])).toEqual(NOEL);
    expect(fermetureQuiEmpeche("2027-12-26", "2027-12-26", [NOEL])).toEqual(NOEL);
    // La veille et le lendemain passent.
    expect(fermetureQuiEmpeche("2027-12-23", "2027-12-23", [NOEL])).toBeNull();
    expect(fermetureQuiEmpeche("2027-12-27", "2027-12-27", [NOEL])).toBeNull();
  });

  it("une garderie ou un essai un jour fermé : refusés", () => {
    /**
     * Ils tiennent dans la journée : arrivée ET départ tombent le jour fermé.
     * La règle se replie d'elle-même, sans qu'on ait à distinguer les types de
     * réservation — une distinction de plus aurait été une occasion d'oublier
     * l'un des trois.
     */
    expect(fermetureQuiEmpeche("2027-12-25", "2027-12-25", [NOEL])).toEqual(NOEL);
    // Un seul jour passé en argument, sans date de fin : même résultat.
    expect(fermetureQuiEmpeche("2027-12-25", "", [NOEL])).toEqual(NOEL);
  });

  it("aucune fermeture enregistrée : rien n’empêche rien", () => {
    expect(fermetureQuiEmpeche("2027-12-25", "2027-12-26", [])).toBeNull();
  });

  it("plusieurs fermetures : c’est celle qui touche qui est rendue", () => {
    const f = fermetureQuiEmpeche("2027-07-01", "2027-07-05", [NOEL, SANS_MOTIF]);
    expect(f).toEqual(SANS_MOTIF);
  });
});

describe("les jours d’une fermeture", () => {
  it("les trois jours de Noël, bornes comprises", () => {
    expect(joursDeFermeture(NOEL)).toEqual(["2027-12-24", "2027-12-25", "2027-12-26"]);
  });

  it("un seul jour", () => {
    expect(joursDeFermeture({ date_debut: "2027-05-01", date_fin: "2027-05-01" })).toEqual(["2027-05-01"]);
  });

  it("le passage de mois et d’année tient", () => {
    expect(joursDeFermeture({ date_debut: "2027-12-31", date_fin: "2028-01-01" }))
      .toEqual(["2027-12-31", "2028-01-01"]);
  });

  it("plusieurs fermetures : sans doublon, et triées", () => {
    expect(joursFermes([SANS_MOTIF, NOEL])).toEqual([
      "2027-07-01", "2027-07-02", "2027-12-24", "2027-12-25", "2027-12-26",
    ]);
    expect(joursFermes([NOEL, NOEL])).toHaveLength(3);
  });

  it("jourFerme, aux bornes", () => {
    expect(jourFerme("2027-12-24", NOEL)).toBe(true);
    expect(jourFerme("2027-12-26", NOEL)).toBe(true);
    expect(jourFerme("2027-12-23", NOEL)).toBe(false);
    expect(jourFerme("", NOEL)).toBe(false);
  });
});

// ── Les phrases ───────────────────────────────────────────────────────────

describe("ce que lisent le client et le personnel", () => {
  it("LE REFUS CLIENT, mot pour mot", () => {
    expect(messageFermeture(NOEL)).toBe(
      "La pension est fermée du 24.12.2027 au 26.12.2027 — Vacances annuelles. Choisissez d'autres dates.",
    );
  });

  it("sans motif : pas de tiret orphelin", () => {
    expect(messageFermeture(SANS_MOTIF)).toBe(
      "La pension est fermée du 01.07.2027 au 02.07.2027. Choisissez d'autres dates.",
    );
  });

  it("L’AVERTISSEMENT DU PERSONNEL, mot pour mot", () => {
    expect(avertissementFermeturePersonnel(NOEL)).toBe(
      "Attention : la pension est fermée ce jour-là (Vacances annuelles).",
    );
  });

  it("sans motif : pas de parenthèse vide", () => {
    // « fermée ce jour-là () » se lirait comme un bogue.
    expect(avertissementFermeturePersonnel(SANS_MOTIF)).toBe(
      "Attention : la pension est fermée ce jour-là.",
    );
  });
});

describe("la saisie d’une période", () => {
  it("deux dates cohérentes passent", () => {
    expect(refusFermeture("2027-12-24", "2027-12-26")).toBeNull();
    expect(refusFermeture("2027-12-24", "2027-12-24")).toBeNull();
  });

  it("dates manquantes ou mal écrites", () => {
    for (const [d, f] of [["", "2027-12-26"], ["2027-12-24", ""], ["24.12.2027", "26.12.2027"]]) {
      expect(refusFermeture(d, f), `${d}/${f}`).toBe("Indiquez les deux dates.");
    }
  });

  it("la fin ne précède pas le début", () => {
    expect(refusFermeture("2027-12-26", "2027-12-24"))
      .toBe("La date de fin ne peut pas précéder la date de début.");
  });
});

describe("à venir ou passée", () => {
  it("le jour même compte comme à venir", () => {
    expect(fermetureAVenir(NOEL, "2027-12-26")).toBe(true);
    expect(fermetureAVenir(NOEL, "2027-12-27")).toBe(false);
    expect(fermetureAVenir(NOEL, "2026-01-01")).toBe(true);
  });
});

// ── « À contacter » ───────────────────────────────────────────────────────

describe("les réservations déjà posées sont NOMMÉES, pas annulées", () => {
  const RESAS = [
    { id: "r1", date_debut: "2027-12-25", date_fin: "2027-12-28" },  // arrive dedans
    { id: "r2", date_debut: "2027-12-20", date_fin: "2027-12-30" },  // enjambe
    { id: "r3", date_debut: "2027-12-20", date_fin: "2027-12-24" },  // part dedans
    { id: "r4", date_debut: "2028-02-01", date_fin: "2028-02-05" },  // sans rapport
  ];

  it("celles qui arrivent ou partent dans la période, et elles seules", () => {
    /**
     * Celle qui ENJAMBE n'est pas à contacter : elle reste parfaitement
     * possible. La lister aurait fait passer un appel inutile, et
     * décrédibilisé la liste.
     */
    expect(reservationsAContacter(RESAS, NOEL).map((r) => r.id)).toEqual(["r1", "r3"]);
  });

  it("aucune réservation touchée : liste vide", () => {
    expect(reservationsAContacter(RESAS, SANS_MOTIF)).toEqual([]);
  });
});

// ── L’écriture, et la permission ──────────────────────────────────────────

const H = vi.hoisted(() => ({
  estAdmin: true,
  inserts: [] as Record<string, unknown>[],
  deletes: [] as string[],
  traces: [] as string[],
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

vi.mock("@/src/lib/accesAdmin", () => ({
  exigerAdminPage: async () => {
    // La vraie garde redirige : une redirection lève, et l'action s'arrête.
    if (!H.estAdmin) throw new Error("REDIRECTION_ACCES_REFUSE");
    return { userId: "u1", email: "a@b.ch", role: "admin", isAdmin: true, permissions: {} };
  },
}));

vi.mock("@/src/lib/journalEvenements", () => ({
  tracerEvenement: async (e: { evenement: string }) => { H.traces.push(e.evenement); },
}));

vi.mock("@/src/lib/supabase-admin", () => {
  function from(table: string) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      insert: (vals: Record<string, unknown>) => {
        if (table === "fermetures_pension") H.inserts.push(vals);
        return chain;
      },
      delete: () => ({
        eq: (_col: string, id: string) => {
          H.deletes.push(id);
          return Promise.resolve({ error: null });
        },
      }),
      maybeSingle: async () => ({
        data: { date_debut: "2027-12-24", date_fin: "2027-12-26", motif: "Vacances" },
        error: null,
      }),
      single: async () => ({ data: { id: "f1" }, error: null }),
    };
    return chain;
  }
  return { supabaseAdmin: { from } };
});

import { fermerPension, rouvrirPension } from "@/app/(admin)/(espace-pension)/fermetures-pension/actions";

function formulaire(debut: string, fin: string, motif = "") {
  const fd = new FormData();
  fd.set("date_debut", debut);
  fd.set("date_fin", fin);
  fd.set("motif", motif);
  return fd;
}

beforeEach(() => {
  H.estAdmin = true;
  H.inserts = [];
  H.deletes = [];
  H.traces = [];
});

describe("seule l’administration ferme la pension", () => {
  it("UNE EMPLOYÉE EST REFUSÉE, et rien n’est écrit", async () => {
    /**
     * La garde passe AVANT toute écriture. Une garde posée après rendrait bien
     * un refus — et la pension serait fermée quand même.
     */
    H.estAdmin = false;
    await expect(fermerPension(formulaire("2027-12-24", "2027-12-26"))).rejects.toThrow();
    expect(H.inserts, "aucune écriture").toEqual([]);
    expect(H.traces, "aucune trace").toEqual([]);
  });

  it("une employée ne peut pas rouvrir non plus", async () => {
    H.estAdmin = false;
    await expect(rouvrirPension("f1")).rejects.toThrow();
    expect(H.deletes).toEqual([]);
  });

  it("l’administratrice ferme, et le geste est tracé", async () => {
    const res = await fermerPension(formulaire("2027-12-24", "2027-12-26", "Vacances annuelles"));
    expect(res.error).toBeUndefined();
    expect(H.inserts[0]).toMatchObject({
      date_debut: "2027-12-24", date_fin: "2027-12-26", motif: "Vacances annuelles", cree_par: "u1",
    });
    expect(H.traces).toEqual(["fermeture_ajoutee"]);
  });

  it("une saisie invalide est refusée AVANT l’écriture", async () => {
    const res = await fermerPension(formulaire("2027-12-26", "2027-12-24"));
    expect(res.error).toBe("La date de fin ne peut pas précéder la date de début.");
    expect(H.inserts).toEqual([]);
  });

  it("un motif vide est enregistré NULL, pas vide", async () => {
    // Une chaîne vide se lirait comme un motif — « sans motif » est un état.
    await fermerPension(formulaire("2027-12-24", "2027-12-26", "   "));
    expect(H.inserts[0].motif).toBeNull();
  });

  it("retirer une période la trace aussi", async () => {
    const res = await rouvrirPension("f1");
    expect(res.error).toBeUndefined();
    expect(H.deletes).toEqual(["f1"]);
    expect(H.traces).toEqual(["fermeture_retiree"]);
  });
});

// ── Le câblage ────────────────────────────────────────────────────────────

const lire = (relatif: string) => readFileSync(join(__dirname, "..", relatif), "utf8");

describe("la règle est posée partout où une date se choisit", () => {
  it("l’action client refuse CHAQUE occurrence", () => {
    const src = lire("app/(client)/mon-compte/reservations/actions.ts");
    expect(src).toContain("const fermetures = await fermeturesPourClient();");
    expect(src).toMatch(/for \(const occ of input\.occurrences\)[\s\S]{0,200}fermetureQuiEmpeche\(occ\.date_debut, occ\.date_fin, fermetures\)/);
    expect(src).toContain("messageFermeture(f)");
  });

  it("la route client aussi", () => {
    const src = lire("app/api/reservations/client/route.ts");
    expect(src).toContain("fermetureQuiEmpeche(date_debut, date_fin, await fermeturesPourClient())");
    expect(src).toContain("messageFermeture(fermeture)");
  });

  it("les jours fermés GRISENT les calendriers du client", () => {
    /**
     * Ils rejoignent `dates_fermees`, que le calendrier grise déjà. Un second
     * tableau aurait demandé de retoucher chaque écran — dont un aurait été
     * oublié. Effet voulu : un essai tombant un jour de fermeture est fermé
     * d'office, sans avoir à le fermer aussi dans « Essais fermés ».
     */
    const src = lire("app/api/dates-indisponibles/route.ts");
    expect(src).toContain("joursFermes(await fermeturesPourClient())");
    expect(src).toContain("dates_fermees: Array.from(new Set([...datesFermees, ...joursFermeture]))");
  });

  it("LE PERSONNEL EST AVERTI, JAMAIS BLOQUÉ", () => {
    const src = lire("app/(admin)/(espace-clients)/reservations/nouvelle/FormReservation.tsx");
    const debut = src.indexOf("{fermetureTouchee && (");
    expect(debut, "le bloc est rendu sous la condition").toBeGreaterThan(0);
    expect(src.slice(debut, debut + 500)).toContain("avertissementFermeturePersonnel(fermetureTouchee)");
    // Rien n'est désactivé, et aucun refus n'est posé.
    expect(src).not.toMatch(/disabled=\{[^}]*fermetureTouchee/);
    expect(src).not.toContain("messageFermeture");
  });

  it("le client lit la VUE, jamais la table", () => {
    const src = lire("src/lib/fermeturesPension.ts");
    expect(src).toContain('from("fermetures_pension_publiques")');
    expect(src).toContain('select("date_debut, date_fin, motif")');
  });

  it("l’écran a sa porte, à côté d’« Essais fermés »", () => {
    const src = lire("app/(admin)/(espace-pension)/pension/page.tsx");
    expect(src).toContain('href="/fermetures-pension"');
    expect(src.indexOf('href="/calendrier-essais"'))
      .toBeLessThan(src.indexOf('href="/fermetures-pension"'));
  });

  it("les deux gestes ont leur libellé au journal", () => {
    const src = lire("src/lib/journalEvenements.ts");
    expect(src).toContain("fermeture_ajoutee:");
    expect(src).toContain("fermeture_retiree:");
  });
});

describe("la migration dit les droits, et la leçon d’APP 26", () => {
  const sql = () => lire("supabase/migrations/20260929222124_app59_fermetures_pension.sql");

  it("le personnel lit, seule l’admin écrit", () => {
    expect(sql()).toMatch(/for select[\s\S]{0,80}using \(public\.is_personnel\(\)\)/);
    expect(sql()).toMatch(/for all[\s\S]{0,120}using \(public\.is_admin\(\)\)/);
    expect(sql()).toContain("enable row level security");
  });

  it("la vue n’expose que trois colonnes, et AUCUNE fonction", () => {
    const s = sql();
    expect(s).toContain("select date_debut, date_fin, motif");
    expect(s).toContain("security_invoker = false");
    // La leçon d'APP 26 est écrite, et les droits sont redits (APP 34).
    expect(s).toContain("TABLES");
    expect(s).toContain("SECURITY DEFINER");
    expect(s).toContain("rpc");
    expect(s).toMatch(/grant select on public\.fermetures_pension_publiques to authenticated/);
  });

  it("les bornes sont inclusives, et la fin ne précède pas le début", () => {
    expect(sql()).toContain("check (date_fin >= date_debut)");
  });
});
