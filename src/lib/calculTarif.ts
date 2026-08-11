type Tarif = {
  categorie: string;
  membre: boolean;
  prix: string;
};

/**
 * Résout le prix unitaire (CHF) pour une catégorie de tarif donnée
 * (type_reservation "sejour" ou "journee", urgence/privatif/nb_chiens).
 *
 * IMPORTANT : `est_membre` n'influence PLUS le prix. Toute réservation est
 * facturée au TARIF MEMBRE (les tarifs non-membres sont désactivés en base).
 * L'adhésion reste requise pour réserver (cf. src/lib/membre.ts), mais elle
 * est découplée du prix. Le paramètre est conservé pour compatibilité d'appel.
 */
export function resoudrePrixUnitaire({
  tarifs,
  type_reservation,
  nb_chiens,
  est_urgence,
  est_privatif,
}: {
  tarifs: Tarif[];
  type_reservation: string;
  nb_chiens: number;
  est_membre: boolean;
  est_urgence: boolean;
  est_privatif: boolean;
}): number {
  let cle = "";

  if (est_urgence) {
    cle = est_privatif
      ? "urgence_privatif"
      : `urgence_partage_${Math.min(nb_chiens, 3)}`;
  } else if (est_privatif) {
    cle = `${type_reservation}_privatif`;
  } else {
    cle = `${type_reservation}_partage_${Math.min(nb_chiens, 3)}`;
  }

  // Toujours le tarif membre ; repli sur n'importe quel tarif de la catégorie
  // si le tarif membre venait à manquer.
  const tarif = tarifs.find(
    (t) => t.categorie === cle && t.membre === true
  ) || tarifs.find(
    (t) => t.categorie === cle
  );

  return tarif ? parseFloat(tarif.prix) : 0;
}

/**
 * Comptage d'un séjour par tranche horaire (matin = avant midi, soir = midi
 * et après) :
 * - nb_nuits = nombre de séjours de 24h = (date_fin - date_debut) en jours.
 * - supplement_journee = 1 SI ET SEULEMENT SI arrivée le matin ET départ le
 *   soir (les deux heures renseignées) ; sinon 0 (jamais plus que les nuits,
 *   jamais de remboursement pour un départ tôt).
 */
export function compterSejour({
  date_debut,
  date_fin,
  heure_arrivee,
  heure_depart,
}: {
  date_debut: string;
  date_fin: string;
  heure_arrivee?: string | null;
  heure_depart?: string | null;
}): { nb_nuits: number; supplement_journee: 0 | 1 } {
  const debut = new Date(date_debut);
  const fin = new Date(date_fin);
  const nb_nuits = Math.max(
    0,
    Math.round((fin.getTime() - debut.getTime()) / (1000 * 60 * 60 * 24))
  );

  const tranche = (heure?: string | null): "matin" | "soir" | null => {
    if (!heure) return null;
    return heure.slice(0, 5) < "12:00" ? "matin" : "soir";
  };

  const supplement_journee: 0 | 1 =
    tranche(heure_arrivee) === "matin" && tranche(heure_depart) === "soir" ? 1 : 0;

  return { nb_nuits, supplement_journee };
}

export function calculerMontant({
  tarifs,
  type_reservation,
  nb_chiens,
  est_membre,
  est_urgence,
  est_privatif,
  date_debut,
  date_fin,
  heure_arrivee,
  heure_depart,
}: {
  tarifs: Tarif[];
  type_reservation: string;
  nb_chiens: number;
  est_membre: boolean;
  est_urgence: boolean;
  est_privatif: boolean;
  date_debut: string;
  date_fin: string;
  heure_arrivee?: string | null;
  heure_depart?: string | null;
}): number {
  if (type_reservation === "sejour") {
    const { nb_nuits, supplement_journee } = compterSejour({
      date_debut, date_fin, heure_arrivee, heure_depart
    });
    const prixSejour = resoudrePrixUnitaire({
      tarifs, type_reservation: "sejour", nb_chiens, est_membre, est_urgence, est_privatif
    });
    const prixJournee = resoudrePrixUnitaire({
      tarifs, type_reservation: "journee", nb_chiens, est_membre, est_urgence, est_privatif
    });
    return nb_nuits * prixSejour + supplement_journee * prixJournee;
  }

  if (type_reservation === "essai") {
    // Tarif = une journée membre, quel que soit le statut réel du client
    return resoudrePrixUnitaire({
      tarifs, type_reservation: "journee", nb_chiens,
      est_membre: true, est_urgence, est_privatif,
    });
  }

  const debut = new Date(date_debut);
  const fin = new Date(date_fin);
  const nb_jours = Math.max(
    1,
    Math.round((fin.getTime() - debut.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );

  const prix_unitaire = resoudrePrixUnitaire({
    tarifs, type_reservation, nb_chiens, est_membre, est_urgence, est_privatif
  });

  if (type_reservation === "journee") return prix_unitaire;

  return prix_unitaire * nb_jours;
}
