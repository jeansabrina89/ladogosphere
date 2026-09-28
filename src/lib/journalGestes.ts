import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { lireAuteurs } from "@/src/lib/auteursDb";
import { auteurAffiche, type AuteurAffiche } from "@/src/lib/auteur";
import { libelleEvenement } from "@/src/lib/journalEvenements";
import {
  PAR_PAGE,
  entitesDeLaFamille,
  nomDepuisTrace,
  type FiltresJournal,
} from "@/src/lib/journalGestesLogique";

/**
 * La lecture du journal pour l'écran des Réglages (APP 33).
 *
 * ── PAGINATION CÔTÉ SERVEUR, ET CE N'EST PAS UN DÉTAIL ────────────────────
 *
 * `journal_evenements` ne se vide jamais : il grossit d'un geste par geste, et
 * pour toujours. Charger la table pour en montrer cinquante lignes marcherait
 * ce mois-ci et ferait tomber l'écran dans deux ans, au moment précis où l'on
 * en aurait besoin. Le `range()` et le `count` sont donc posés dès le premier
 * jour.
 *
 * ── LECTURE SEULE ─────────────────────────────────────────────────────────
 *
 * Ce module n'expose AUCUNE écriture, et la base non plus : deux triggers
 * (`trg_journal_evenements_append_only`, `trg_journal_evenements_sans_vidage`)
 * refusent UPDATE, DELETE et TRUNCATE — la clé de service comprise. L'écran ne
 * peut donc rien abîmer même si quelqu'un s'y employait.
 */

export type LigneJournal = {
  id: string;
  createdAt: string;
  entite: string;
  entiteId: string;
  evenement: string;
  libelle: string;
  motif: string | null;
  auteur: AuteurAffiche;
  /** Ce que la ligne concerne, en toutes lettres. Null : rien à en dire. */
  concerne: string | null;
  /** La fiche de l'objet, ou null s'il n'existe plus (ou n'a pas de fiche). */
  lien: string | null;
  avant: Record<string, unknown> | null;
  apres: Record<string, unknown> | null;
};

type LigneBrute = {
  id: string; entite: string; entite_id: string; evenement: string;
  motif: string | null; created_at: string; user_id: string | null;
  avant: Record<string, unknown> | null; apres: Record<string, unknown> | null;
};

const COLONNES = "id, entite, entite_id, evenement, motif, created_at, user_id, avant, apres";

/**
 * Où mène une ligne, et sous quel nom.
 *
 * Une entité par requête, et une seule requête par entité présente dans la page
 * — jamais une par ligne. Cinquante lignes de factures font UNE lecture.
 *
 * Les entités absentes de cette table n'ont pas de fiche à elles (un paramètre,
 * un refus d'accès, un décompte de TVA) : leur ligne s'affiche sans lien, ce
 * qui est juste — il n'y a nulle part où aller.
 */
type ConfigFiche = {
  table: string;
  colonnes: string;
  /**
   * L'adresse de la fiche — ABSENTE quand l'objet n'en a pas.
   *
   * Une commande en ligne, par exemple : `/boutique/commandes-en-ligne/[id]` ne
   * porte qu'un bon de préparation, pas une fiche. Y renvoyer donnerait un lien
   * qui tombe en 404, et un lien mort dans un journal fait douter du journal
   * entier. Son numéro s'affiche quand même — c'est lui qu'on cherchait.
   */
  fiche?: (r: Record<string, unknown>) => string;
  nom: (r: Record<string, unknown>) => string;
};

const FICHES: Record<string, ConfigFiche> = {
  facture: {
    table: "factures", colonnes: "id, numero",
    fiche: (r) => `/factures/${r.id}`,
    nom: (r) => `Facture ${r.numero ?? "—"}`,
  },
  avoir: {
    table: "factures", colonnes: "id, numero",
    fiche: (r) => `/factures/${r.id}`,
    nom: (r) => `Avoir ${r.numero ?? "—"}`,
  },
  vente: {
    table: "ventes", colonnes: "id, numero",
    fiche: (r) => `/boutique/ventes/${r.id}`,
    nom: (r) => `Vente ${r.numero ?? "—"}`,
  },
  article: {
    table: "articles", colonnes: "id, reference, nom",
    fiche: (r) => `/boutique/articles/${r.id}`,
    nom: (r) => `${r.reference ?? ""} ${r.nom ?? ""}`.trim(),
  },
  reservation: {
    table: "reservations", colonnes: "id, numero",
    fiche: (r) => `/reservations/${r.id}`,
    nom: (r) => `Réservation N°${r.numero ?? "—"}`,
  },
  depense: {
    table: "depenses", colonnes: "id, numero",
    fiche: (r) => `/comptabilite/depenses/${r.id}`,
    nom: (r) => `Dépense ${r.numero ?? "—"}`,
  },
  client: {
    table: "clients", colonnes: "id, prenom, nom",
    fiche: (r) => `/clients/${r.id}`,
    nom: (r) => `${r.prenom ?? ""} ${r.nom ?? ""}`.trim(),
  },
  chien: {
    table: "chiens", colonnes: "id, nom",
    fiche: (r) => `/chiens/${r.id}`,
    nom: (r) => String(r.nom ?? ""),
  },
  // Pas de `fiche` : ces commandes n'en ont pas (voir ConfigFiche).
  commande_en_ligne: {
    table: "commandes", colonnes: "id, numero",
    nom: (r) => `Commande ${r.numero ?? "—"}`,
  },
  commande: {
    table: "commandes", colonnes: "id, numero",
    nom: (r) => `Commande ${r.numero ?? "—"}`,
  },
};

/** Les objets encore existants, par entité puis par identifiant. */
async function resoudreObjets(
  lignes: LigneBrute[],
): Promise<Map<string, { nom: string; lien: string | null }>> {
  const parEntite = new Map<string, Set<string>>();
  for (const l of lignes) {
    if (!FICHES[l.entite]) continue;
    const deja = parEntite.get(l.entite) ?? new Set<string>();
    deja.add(l.entite_id);
    parEntite.set(l.entite, deja);
  }

  const trouves = new Map<string, { nom: string; lien: string | null }>();
  await Promise.all(
    [...parEntite.entries()].map(async ([entite, ids]) => {
      const config = FICHES[entite];
      const { data } = await supabaseAdmin
        .from(config.table)
        .select(config.colonnes)
        .in("id", [...ids]);
      for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
        const nom = config.nom(r).trim();
        trouves.set(`${entite}:${r.id}`, {
          nom: nom === "" ? String(r.id) : nom,
          lien: config.fiche ? config.fiche(r) : null,
        });
      }
    }),
  );
  return trouves;
}

export type PageJournal = { lignes: LigneJournal[]; total: number };

export async function lireJournal(f: FiltresJournal): Promise<PageJournal> {
  let requete = supabaseAdmin
    .from("journal_evenements")
    .select(COLONNES, { count: "exact" })
    .order("created_at", { ascending: false })
    // `id` départage deux gestes de la même milliseconde : sans lui, l'ordre
    // varie d'une page à l'autre et une ligne peut se montrer deux fois — ou
    // pas du tout.
    .order("id", { ascending: false });

  const entites = entitesDeLaFamille(f.famille);
  if (entites) requete = requete.in("entite", entites);
  if (f.personne) requete = requete.eq("user_id", f.personne);
  // Bornes INCLUSIVES : « du 1er au 30 » contient le 30 en entier, pas
  // jusqu'à minuit pile. Une journée manquante ne se remarquerait pas.
  if (f.du) requete = requete.gte("created_at", `${f.du}T00:00:00`);
  if (f.au) requete = requete.lte("created_at", `${f.au}T23:59:59.999`);

  const debut = (f.page - 1) * PAR_PAGE;
  const { data, count } = await requete.range(debut, debut + PAR_PAGE - 1);

  const brutes = (data ?? []) as unknown as LigneBrute[];
  const [auteurs, objets] = await Promise.all([
    lireAuteurs(brutes.map((l) => l.user_id)),
    resoudreObjets(brutes),
  ]);

  const lignes = brutes.map((l): LigneJournal => {
    const objet = objets.get(`${l.entite}:${l.entite_id}`);
    return {
      id: String(l.id),
      createdAt: String(l.created_at),
      entite: String(l.entite),
      entiteId: String(l.entite_id),
      evenement: String(l.evenement),
      libelle: libelleEvenement(String(l.evenement), String(l.entite)),
      motif: l.motif ?? null,
      auteur: auteurAffiche(l.user_id ? auteurs.get(l.user_id) ?? null : null, {
        parClientSansCompte: l.apres?.par === "client",
      }),
      /*
       * L'OBJET D'ABORD, SA TRACE ENSUITE.
       *
       * Un article supprimé (APP 32) n'a plus de fiche : le nom vient alors de
       * « avant », qui porte sa référence et son nom. Sans ce repli, le journal
       * dirait « Article supprimé » sans dire lequel — c'est-à-dire rien, et
       * c'est précisément la ligne qu'on vient relire.
       */
      concerne: objet?.nom ?? nomDepuisTrace(l.avant, l.apres),
      lien: objet?.lien ?? null,
      avant: l.avant ?? null,
      apres: l.apres ?? null,
    };
  });

  return { lignes, total: count ?? 0 };
}

/** Les personnes qui ont laissé au moins un geste, pour le filtre. */
export async function auteursDuJournal(): Promise<{ id: string; nom: string }[]> {
  /*
   * On lit les identifiants distincts sur une fenêtre RÉCENTE plutôt que sur
   * toute la table : le filtre sert à retrouver qui travaille aujourd'hui, et
   * une liste qui grandit sans fin finirait par coûter plus que l'écran.
   */
  const { data } = await supabaseAdmin
    .from("journal_evenements")
    .select("user_id")
    .not("user_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(2000);

  const ids = [...new Set(((data ?? []) as { user_id: string }[]).map((l) => l.user_id))];
  const profils = await lireAuteurs(ids);
  return ids
    .map((id) => {
      const a = auteurAffiche(profils.get(id) ?? null, {});
      return { id, nom: a.titre ?? a.texte };
    })
    .sort((x, y) => x.nom.localeCompare(y.nom, "fr"));
}
