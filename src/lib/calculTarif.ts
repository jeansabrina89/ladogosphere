type Tarif = {
  categorie: string;
  membre: boolean;
  prix: string;
};

export function calculerMontant({
  tarifs,
  type_reservation,
  nb_chiens,
  est_membre,
  est_urgence,
  est_privatif,
  date_debut,
  date_fin,
}: {
  tarifs: Tarif[];
  type_reservation: string;
  nb_chiens: number;
  est_membre: boolean;
  est_urgence: boolean;
  est_privatif: boolean;
  date_debut: string;
  date_fin: string;
}): number {
  const debut = new Date(date_debut);
  const fin = new Date(date_fin);
  const nb_jours = Math.max(
    1,
    Math.round((fin.getTime() - debut.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );

  let cle = "";

  if (est_urgence && est_membre) {
    cle = est_privatif
      ? "urgence_privatif"
      : `urgence_partage_${Math.min(nb_chiens, 3)}`;
  } else if (est_privatif) {
    cle = `${type_reservation}_privatif`;
  } else {
    cle = `${type_reservation}_partage_${Math.min(nb_chiens, 3)}`;
  }

  const tarif = tarifs.find(
    (t) => t.categorie === cle && t.membre === est_membre
  ) || tarifs.find(
    (t) => t.categorie === cle
  );

  if (!tarif) return 0;

  const prix_unitaire = parseFloat(tarif.prix);

  if (type_reservation === "journee") return prix_unitaire;

  return prix_unitaire * nb_jours;
}