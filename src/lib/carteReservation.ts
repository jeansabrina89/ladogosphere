import { lireCohabitationChiens } from "@/src/lib/cohabitationDb";
import { estPrivatifPourSelection } from "@/src/lib/cohabitation";
import { categorieCarteJournee } from "@/src/lib/abonnementsTypes";

/**
 * La carte d'abonnement qui règle une journée, pour les chiens de cette
 * réservation (APP 72).
 *
 * Les MÊMES entrées que le calcul du prix (src/lib/prixReservation.ts) : le
 * nombre de chiens, et le « privatif » tiré de leur cohabitation
 * (`estPrivatifPourSelection`) — un chien déclaré « seul », ou un chien
 * « famille uniquement » venu sans compagnon du foyer, occupe le box entier.
 * La carte débitée est donc toujours celle du tarif appliqué.
 */
export async function categorieCartePourChiens(chienIds: string[]): Promise<string | null> {
  const ids = [...new Set(chienIds.filter(Boolean))];
  if (ids.length === 0) return null;
  const cohabitation = await lireCohabitationChiens(ids);
  return categorieCarteJournee({
    nb_chiens: ids.length,
    est_privatif: estPrivatifPourSelection(cohabitation),
  });
}

/**
 * La même chose pour toute une liste de réservations, en UNE lecture de la
 * cohabitation : la liste « Mes réservations » ne relit pas les chiens ligne
 * par ligne. Clé : l'identifiant de la réservation.
 */
export async function categoriesCartesPourReservations(
  reservations: { id: string; chienIds: string[] }[],
): Promise<Map<string, string | null>> {
  const tous = [...new Set(reservations.flatMap((r) => r.chienIds).filter(Boolean))];
  const cohabitation = await lireCohabitationChiens(tous);
  const parId = new Map(cohabitation.map((c) => [c.id as string, c]));
  const res = new Map<string, string | null>();
  for (const r of reservations) {
    const ids = [...new Set(r.chienIds.filter(Boolean))];
    const selection = ids.map((id) => parId.get(id)).filter((c) => !!c) as typeof cohabitation;
    res.set(
      r.id,
      ids.length === 0
        ? null
        : categorieCarteJournee({ nb_chiens: ids.length, est_privatif: estPrivatifPourSelection(selection) }),
    );
  }
  return res;
}
