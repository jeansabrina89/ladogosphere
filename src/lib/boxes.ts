export function formatBoxLabel(box?: { numero?: number | null; nom?: string | null } | null): string {
  if (!box) return "—";
  if (box.nom) return box.nom;
  if (box.numero != null) return `Box ${box.numero}`;
  return "—";
}
