import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { compterSejour } from "@/src/lib/calculTarif";
import { montantDuReservation } from "@/src/lib/montants";
import { ventilerParTypeSejour, type VentilationSejours } from "@/src/lib/typeSejour";

/**
 * Ce que l'exercice a accueilli, type de séjour par type de séjour.
 *
 * Lecture seule, comme la ventilation TVA à côté de laquelle elle se lit :
 * aucune écriture n'en découle, aucun montant n'est recalculé. Un séjour
 * gratuit ne produit toujours aucun produit ; le tableau le montre, il ne le
 * change pas.
 *
 * Le rattachement à l'exercice suit celui du chiffre d'affaires facturé de
 * l'écran Comptabilité : la date de début du séjour.
 */
export async function ventilationSejoursExercice(
  annee: number
): Promise<VentilationSejours> {
  const { data } = await supabaseAdmin
    .from("reservations")
    .select(
      "type_sejour, date_debut, date_fin, heure_arrivee, heure_depart, " +
        "montant_final, montant_calcule, ajustement_manuel"
    )
    .neq("statut", "annulee")
    .gte("date_debut", `${annee}-01-01`)
    .lte("date_debut", `${annee}-12-31`);

  type LigneLue = {
    type_sejour: string | null;
    date_debut: string;
    date_fin: string;
    heure_arrivee: string | null;
    heure_depart: string | null;
    montant_final: number | string | null;
    montant_calcule: number | string | null;
    ajustement_manuel: number | string | null;
  };

  return ventilerParTypeSejour(
    ((data ?? []) as unknown as LigneLue[]).map((r) => ({
      type_sejour: r.type_sejour,
      nuitees: compterSejour({
        date_debut: r.date_debut,
        date_fin: r.date_fin,
        heure_arrivee: r.heure_arrivee,
        heure_depart: r.heure_depart,
      }).nb_nuits,
      montant: montantDuReservation(r),
    }))
  );
}
