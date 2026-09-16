/**
 * Quelles factures partent par e-mail ce matin ?
 *
 * Une facture ne part plus à son émission. Elle part le LENDEMAIN MATIN, et
 * seulement si elle est encore impayée : c'est le délai qui laisse au client le
 * temps de régler au comptoir sans recevoir, le soir même, une facture qu'il
 * vient de payer.
 *
 * La même règle rattrape les envois manqués. Une facture dont l'envoi manuel a
 * échoué garde `email_envoye_le` à null ; si elle est encore impayée le
 * lendemain, elle part. Une facture ne part donc qu'une fois : c'est
 * l'envoi réussi qui pose la date, et la date qui la retire de la liste.
 *
 * Module pur : la route lit la base, cette fonction décide.
 */

/** Statuts d'une facture émise qui n'est pas soldée (valeurs historiques). */
export const STATUTS_EMISE_OUVERTE = ["envoyee", "partiellement_reglee"] as const;

export type FactureCandidate = {
  id: string;
  /** « facture », « libre », « acompte » ou « avoir ». */
  type: string | null;
  numero: string | null;
  statut: string | null;
  montant_restant: number | string | null;
  email_envoye_le: string | null;
  envoi_auto_exclu: boolean | null;
  /** Horodatage réel de l'émission, s'il est connu. */
  emise_le: string | null;
  date_facture: string | null;
  /** Adresse du client, telle que la fiche la porte. */
  email_client: string | null;
};

const FORMAT_ZURICH = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Zurich",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Le jour où la facture a été émise, à l'heure de Sion.
 *
 * `emise_le` fait foi quand il existe : `date_facture` peut dater une facture
 * de réservation au jour du séjour, bien avant ou bien après son émission.
 * Les factures anciennes qui n'ont pas `emise_le` retombent sur leur date.
 */
export function jourEmission(f: Pick<FactureCandidate, "emise_le" | "date_facture">): string | null {
  if (f.emise_le) {
    const instant = new Date(f.emise_le);
    if (!Number.isNaN(instant.getTime())) return FORMAT_ZURICH.format(instant);
  }
  const date = (f.date_facture ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/** Pourquoi une facture ne part pas ce matin, ou null si elle part. */
export function raisonDeNePasEnvoyer(f: FactureCandidate, aujourdhui: string): string | null {
  // Un avoir ne réclame rien : il ne part jamais par ce chemin.
  if (f.type === "avoir") return "avoir";
  if (!f.numero) return "non émise";
  if (!(STATUTS_EMISE_OUVERTE as readonly string[]).includes(f.statut ?? "")) return "pas ouverte";
  if (!(Number(f.montant_restant ?? 0) > 0)) return "payée";
  if (f.email_envoye_le) return "déjà envoyée";
  if (f.envoi_auto_exclu) return "exclue de l'envoi du matin";
  if (!(f.email_client ?? "").trim()) return "client sans adresse";

  const jour = jourEmission(f);
  if (!jour) return "date d'émission inconnue";
  // Strictement AVANT aujourd'hui : une facture émise ce matin attend demain.
  if (jour >= aujourdhui.slice(0, 10)) return "émise aujourd'hui";

  return null;
}

export function factureAEnvoyerCeMatin(f: FactureCandidate, aujourdhui: string): boolean {
  return raisonDeNePasEnvoyer(f, aujourdhui) === null;
}

export function facturesAEnvoyerCeMatin(
  factures: readonly FactureCandidate[],
  aujourdhui: string
): FactureCandidate[] {
  return factures.filter((f) => factureAEnvoyerCeMatin(f, aujourdhui));
}
