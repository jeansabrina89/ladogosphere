import {
  ibanDeVersement,
  lignesAdresse,
  raisonSocialeAffichee,
  type EntiteJuridique,
} from "@/src/lib/entiteJuridiqueLogique";

export type AdresseCreancier = {
  rue: string;
  numero: string;
  npa: string;
  ville: string;
  pays: string;
};

export type CoordonneesPaiement = {
  iban: string;
  titulaire: string;
  ibanConfigure: boolean;
  adresse: AdresseCreancier;
  /** L'identité complète, pour ce qui a besoin de l'IDE ou du numéro de TVA. */
  entite: EntiteJuridique;
};

/**
 * Les coordonnées du créancier, À UNE DATE.
 *
 * Elles ne viennent plus de `parametres` : elles viennent de l'entité
 * juridique en vigueur à la date demandée. C'est la même source que la raison
 * sociale imprimée en tête du document — deux sources pour un même créancier
 * finiraient par écrire deux titulaires sur la même facture.
 *
 * Le paramètre `supabaseAdmin` est conservé pour ne pas toucher aux neuf
 * appelants : il n'est plus utilisé, la lecture passe par `entiteA`.
 */
export async function getCoordonneesPaiement(
  _supabaseAdmin: unknown,
  dateISO?: string | null
): Promise<CoordonneesPaiement> {
  const { entiteA } = await import("@/src/lib/entiteJuridique");
  const entite = await entiteA(dateISO);
  const iban = ibanDeVersement(entite);

  return {
    iban,
    // Tant que la raison sociale n'est pas choisie, le document porte le nom
    // commercial seul. Mieux vaut un en-tête au nom d'enseigne qu'un en-tête vide.
    titulaire: raisonSocialeAffichee(entite),
    ibanConfigure: iban !== "",
    adresse: {
      rue: entite.adresse.rue ?? "",
      numero: entite.adresse.numero ?? "",
      npa: entite.adresse.npa ?? "",
      ville: entite.adresse.ville ?? "",
      pays: entite.adresse.pays,
    },
    entite,
  };
}

/** Une adresse d'entité en une ligne, pour un e-mail ou un pied de page. */
export function adresseEnUneLigne(entite: EntiteJuridique): string {
  return lignesAdresse(entite).join(", ");
}
