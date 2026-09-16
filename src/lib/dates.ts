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

export function formatDateFR(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string" && value === "") return "";
  // Chaîne "YYYY-MM-DD[...]" → reformatage direct sans passer par Date
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split("-");
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
