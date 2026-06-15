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
