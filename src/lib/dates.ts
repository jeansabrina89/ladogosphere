export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function formatDateLong(date: string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("fr-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function aujourdhuiISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/**
 * Un horodatage qui dit son fuseau : « …Z » ou « …+00:00 », ce que renvoie la
 * base pour une colonne timestamptz. Sa date du jour se lit À SION, pas à
 * Greenwich : une commande passée le 22 à 00 h 31 est du 22, même si elle est
 * enregistrée le 21 à 22 h 31 UTC.
 */
const AVEC_FUSEAU = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$/;

/**
 * « 2026-09-22 », la date du jour à Sion d'un instant ou d'un horodatage.
 * Une date seule (« 2026-09-22 ») est rendue telle quelle.
 */
export function dateLocaleISO(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (typeof value === "string" && !AVEC_FUSEAU.test(value) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    // Un horodatage SANS fuseau : on ne devine pas son fuseau, on garde son jour.
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export function formatDateFR(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string" && value === "") return "";
  // Une date seule, ou un horodatage SANS fuseau : on reformate son jour tel
  // quel. Un horodatage AVEC fuseau prend d'abord son jour à Sion — sans quoi
  // minuit et demi tomberait la veille. Même présentation « jj/mm/aaaa » dans
  // les deux cas.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const jour = AVEC_FUSEAU.test(value) ? dateLocaleISO(value) : value.slice(0, 10);
    const [y, m, d] = jour.split("-");
    return `${d}/${m}/${y}`;
  }
  // Date objet ou autre string (ISO avec heure, timestamp…)
  const d = value instanceof Date ? value : new Date(value as string);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Zurich",
  }).format(d);
}

export function formatHeure(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string" && value === "") return "";
  // Chaîne "HH:MM[:SS]" → troncature directe
  if (typeof value === "string" && /^\d{2}:\d{2}/.test(value)) {
    return value.slice(0, 5);
  }
  // Date objet ou ISO timestamp
  const d = value instanceof Date ? value : new Date(value as string);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("fr-CH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Zurich",
  }).format(d);
}

/**
 * « 14.09.2026 17:32 », à l'heure de Sion : la forme d'une ligne d'historique.
 *
 * Construite pièce par pièce plutôt que confiée au format de la locale, qui
 * change de séparateur d'un moteur à l'autre (« 14.9.2026, 17:32 »).
 */
export function formatHorodatage(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  const parties = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Zurich",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((p) => [p.type, p.value])
  );
  return `${parties.day}.${parties.month}.${parties.year} ${parties.hour}:${parties.minute}`;
}

/**
 * Un horodatage lu dans une colonne SANS fuseau (« timestamp without time zone »)
 * que l'application remplit en UTC (`new Date().toISOString()`) : c'est le cas
 * des heures réelles d'arrivée et de départ. Sans le « Z », le moteur le lirait
 * comme une heure locale, avec une ou deux heures d'écart.
 */
export function instantUtc(value: string | null | undefined): string | null {
  if (!value) return null;
  return /(Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
}
