export function calculerStatut(montantPaye: number, total: number): string {
  if (montantPaye <= 0) return "impaye";
  if (total > 0 && montantPaye >= total) return "paye";
  return "partiel";
}
