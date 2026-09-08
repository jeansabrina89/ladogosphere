import { formatDateFR, formatHeure } from "@/src/lib/dates";

/**
 * « Aujourd'hui » — l'écran du matin.
 *
 * Ce n'est pas un tableau de chiffres : c'est une liste d'actions dans l'ordre
 * de la journée. Arrivées, départs, puis ce qu'il ne faut pas oublier cette
 * semaine.
 *
 * Fonction PURE : aucune base, aucune horloge. La date lui est donnée, les
 * lignes lui sont données, et elle rend ce qu'il y a à faire. C'est elle que
 * les tests couvrent, pas la page.
 *
 * Aucune table, aucune colonne n'a été créée pour cet écran : tout ce qu'il
 * montre existait déjà, éparpillé sur cinq écrans.
 */

// ── Ce qu'on lui donne ──────────────────────────────────────────────────────

export type ClientJournee = { id: string | null; prenom: string | null; nom: string | null };

export type ReservationJournee = {
  id: string | null;
  type_reservation: string | null;
  heure_arrivee: string | null;
  heure_depart: string | null;
  statut: string | null;
  offerte: boolean | null;
  montant_final: number | string | null;
  montant_calcule: number | string | null;
  montant_paye: number | string | null;
  box: string | null;
  client: ClientJournee | null;
};

export type ChienJournee = {
  id: string | null;
  nom: string | null;
  /** Source de vérité de l'essai : voir journeeEssai.ts. */
  statut_essai: string | null;
};

export type LigneCheckin = {
  id: string;
  statut: string;
  date_arrivee_prevue: string | null;
  date_depart_prevu: string | null;
  reservation: ReservationJournee | null;
  chien: ChienJournee | null;
};

/** Ce que la personne connectée a le droit de voir. Rien de plus. */
export type DroitsJournee = {
  isAdmin: boolean;
  perm_encaissements: boolean;
  perm_boutique_vente: boolean;
};

export type EntreeJournee = {
  /** Le jour regardé, en ISO. Jamais lu de l'horloge ici. */
  jourISO: string;
  arrivees: LigneCheckin[];
  departs: LigneCheckin[];
  /** Les chiens déjà venus au moins une fois — pour la mention « 1re fois ». */
  chiensDejaVenus: string[];
  /** Combien de colis attendent, par client. */
  colisParClient: Record<string, number>;
  adhesions: AdhesionEcheance[];
  commandes: CommandePromise[];
  depensesSansJustificatif: DepenseSansJustificatif[];
  facturesEnRetard: FactureEnRetard[];
  droits: DroitsJournee;
};

export type AdhesionEcheance = {
  id: string;
  date_fin: string | null;
  client: ClientJournee | null;
};

export type CommandePromise = {
  id: string;
  numero: string | null;
  date_promise: string | null;
  statut: string | null;
  client: ClientJournee | null;
};

export type DepenseSansJustificatif = {
  id: string;
  numero: string | null;
  libelle: string | null;
  date_depense: string | null;
  montant: number | string | null;
};

export type FactureEnRetard = {
  id: string;
  numero: string | null;
  date_echeance: string | null;
  montant_restant: number | string | null;
  client: ClientJournee | null;
};

// ── Ce qu'elle rend ─────────────────────────────────────────────────────────

export type SignauxDepart = {
  /** Une commande en ligne prête, qu'on ne doit pas oublier de remettre. */
  colis: number;
  /** Ce qui reste dû sur le séjour, ou null si on n'a pas à le voir. */
  resteAEncaisser: number | null;
  /** Une journée d'essai dont le résultat n'a pas encore été saisi. */
  resultatEssai: boolean;
};

export type LigneJournee = {
  checkinId: string;
  heure: string;
  chien: { id: string | null; nom: string };
  client: { id: string | null; nom: string };
  box: string | null;
  statut: string;
  reservationId: string | null;
  essai: boolean;
  /** Ce chien n'est jamais venu. */
  premiereFois: boolean;
  signaux: SignauxDepart;
};

export type Rappel = {
  /** Identité stable — deux rappels ne se confondent jamais. */
  cle: string;
  categorie: "adhesion" | "commande" | "depense" | "facture";
  libelle: string;
  detail: string;
  href: string;
  /** L'échéance est dépassée : ce n'est plus « bientôt », c'est « en retard ». */
  urgent: boolean;
};

export type Journee = {
  jourISO: string;
  dateEnClair: string;
  arrivees: LigneJournee[];
  departs: LigneJournee[];
  rappels: Rappel[];
};

// ── Outils ──────────────────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;

function nomClient(c: ClientJournee | null): string {
  const nom = [c?.prenom, c?.nom].filter(Boolean).join(" ").trim();
  return nom || "Client inconnu";
}

/** Le jour d'un horodatage, quel que soit le fuseau qui y est écrit. */
export function jourDe(valeur: string | null | undefined): string {
  return String(valeur ?? "").slice(0, 10);
}

/** Une date ISO décalée de n jours — sans passer par le fuseau local. */
export function decalerJours(jourISO: string, n: number): string {
  const d = new Date(`${jourISO.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** La date en clair, telle qu'on la lit à voix haute. */
export function dateEnClair(jourISO: string): string {
  return new Date(`${jourISO.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-CH", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

/**
 * Ce qui reste dû sur une réservation. Une réservation offerte, annulée ou
 * refusée ne doit rien : afficher « 0.00 à encaisser » serait un faux signal.
 */
export function resteDu(r: ReservationJournee | null): number {
  if (!r) return 0;
  if (r.offerte) return 0;
  if (r.statut === "annulee" || r.statut === "refusee") return 0;
  const du = Number(r.montant_final ?? r.montant_calcule ?? 0);
  const paye = Number(r.montant_paye ?? 0);
  const solde = r2(du - paye);
  return solde > 0.005 ? solde : 0;
}

/**
 * Le résultat d'une journée d'essai reste à saisir tant que le chien est encore
 * « programme » : c'est le départ qui doit le rappeler, pas un écran qu'on
 * pense à ouvrir trois jours plus tard.
 */
export function resultatEssaiASaisir(l: LigneCheckin): boolean {
  return l.reservation?.type_reservation === "essai" && l.chien?.statut_essai === "programme";
}

function ligne(
  l: LigneCheckin,
  sens: "arrivee" | "depart",
  entree: EntreeJournee,
  dejaVenus: Set<string>
): LigneJournee {
  const r = l.reservation;
  const clientId = r?.client?.id ?? null;
  const brute = sens === "arrivee" ? r?.heure_arrivee : r?.heure_depart;
  const solde = resteDu(r);

  return {
    checkinId: l.id,
    heure: formatHeure(brute) || "—",
    chien: { id: l.chien?.id ?? null, nom: l.chien?.nom ?? "Chien" },
    client: { id: clientId, nom: nomClient(r?.client ?? null) },
    box: r?.box ?? null,
    statut: l.statut,
    reservationId: r?.id ?? null,
    essai: r?.type_reservation === "essai",
    premiereFois: sens === "arrivee" && !!l.chien?.id && !dejaVenus.has(l.chien.id),
    signaux: {
      colis: sens === "depart" && clientId ? (entree.colisParClient[clientId] ?? 0) : 0,
      // Un montant qu'on n'a pas le droit d'encaisser ne s'affiche pas : ce
      // n'est pas un signal pour cette personne-là.
      resteAEncaisser:
        sens === "depart" && entree.droits.perm_encaissements && solde > 0 ? solde : null,
      resultatEssai: sens === "depart" && resultatEssaiASaisir(l),
    },
  };
}

/** L'heure d'abord, le nom du chien ensuite : c'est l'ordre de la journée. */
function parHeure(a: LigneJournee, b: LigneJournee): number {
  const ha = a.heure === "—" ? "99:99" : a.heure;
  const hb = b.heure === "—" ? "99:99" : b.heure;
  if (ha !== hb) return ha < hb ? -1 : 1;
  return a.chien.nom.localeCompare(b.chien.nom, "fr");
}

// ── Le calcul ───────────────────────────────────────────────────────────────

/** Combien de jours à l'avance on regarde les échéances. Une semaine. */
export const HORIZON_RAPPELS_JOURS = 7;

export function rappelsDeLaSemaine(entree: EntreeJournee): Rappel[] {
  const jour = entree.jourISO.slice(0, 10);
  const limite = decalerJours(jour, HORIZON_RAPPELS_JOURS);
  const rappels: Rappel[] = [];

  // Adhésions arrivant à terme — le renouvellement se propose au comptoir,
  // pas par courrier trois semaines plus tard.
  if (entree.droits.isAdmin || entree.droits.perm_encaissements) {
    for (const a of entree.adhesions) {
      const fin = jourDe(a.date_fin);
      if (!fin || fin > limite) continue;
      rappels.push({
        cle: `adhesion-${a.id}`,
        categorie: "adhesion",
        libelle: `Adhésion de ${nomClient(a.client)}`,
        detail: fin < jour
          ? `échue depuis le ${formatDateFR(fin)}`
          : `échoit le ${formatDateFR(fin)}`,
        href: "/adhesions",
        urgent: fin < jour,
      });
    }
  }

  // Commandes sur mesure promises et pas encore commencées : « à faire »
  // veut dire que personne n'y a touché.
  if (entree.droits.perm_boutique_vente) {
    for (const c of entree.commandes) {
      if (c.statut !== "a_faire") continue;
      const promise = jourDe(c.date_promise);
      if (!promise || promise > limite) continue;
      rappels.push({
        cle: `commande-${c.id}`,
        categorie: "commande",
        libelle: `${c.numero ?? "Commande"} — ${nomClient(c.client)}`,
        detail: promise < jour
          ? `promise le ${formatDateFR(promise)}, toujours pas commencée`
          : `promise le ${formatDateFR(promise)}, pas encore commencée`,
        href: "/boutique/commandes",
        urgent: promise < jour,
      });
    }
  }

  // Les échéances comptables ne concernent que l'administratrice.
  if (entree.droits.isAdmin) {
    for (const d of entree.depensesSansJustificatif) {
      rappels.push({
        cle: `depense-${d.id}`,
        categorie: "depense",
        libelle: `${d.numero ?? "Dépense"} — ${d.libelle ?? "sans libellé"}`,
        detail: `sans justificatif · ${Number(d.montant ?? 0).toFixed(2)} CHF`,
        href: `/comptabilite/depenses/${d.id}`,
        urgent: true,
      });
    }

    for (const f of entree.facturesEnRetard) {
      const echeance = jourDe(f.date_echeance);
      rappels.push({
        cle: `facture-${f.id}`,
        categorie: "facture",
        libelle: `${f.numero ?? "Facture"} — ${nomClient(f.client)}`,
        detail: echeance
          ? `échue le ${formatDateFR(echeance)} · ${Number(f.montant_restant ?? 0).toFixed(2)} CHF dus`
          : `${Number(f.montant_restant ?? 0).toFixed(2)} CHF dus`,
        href: `/factures/${f.id}`,
        urgent: true,
      });
    }
  }

  // Ce qui est déjà en retard passe devant ce qui arrive.
  return rappels.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    return a.libelle.localeCompare(b.libelle, "fr");
  });
}

export function calculerJournee(entree: EntreeJournee): Journee {
  const dejaVenus = new Set(entree.chiensDejaVenus);

  return {
    jourISO: entree.jourISO.slice(0, 10),
    dateEnClair: dateEnClair(entree.jourISO),
    arrivees: entree.arrivees.map((l) => ligne(l, "arrivee", entree, dejaVenus)).sort(parHeure),
    departs: entree.departs.map((l) => ligne(l, "depart", entree, dejaVenus)).sort(parHeure),
    rappels: rappelsDeLaSemaine(entree),
  };
}
