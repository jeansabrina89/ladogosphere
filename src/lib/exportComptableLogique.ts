/**
 * L'inventaire d'un exercice : ce qu'il pèse, et où la base et le stockage
 * cessent de se répondre.
 *
 * Tout ici est pur — aucune lecture, aucun appel. L'agrégation se teste sur un
 * jeu de données écrit à la main, y compris les cas qu'on ne sait pas
 * fabriquer en production : un fichier disparu, un orphelin, un original
 * manquant.
 *
 * Deux dates coexistent dans le modèle et NE SE CONFONDENT PAS :
 *   • la date COMPTABLE — celle de la facture, de la dépense, du paiement ;
 *   • la date de DÉPÔT du fichier (`pieces.created_at`).
 * Un ticket de décembre photographié en janvier appartient à l'exercice de
 * décembre. C'est la date comptable qui décide, toujours.
 */

/** Une pièce référencée en base, avec la date qui décide de son exercice. */
export type FichierReference = {
  /** Le chemin dans le bucket. */
  chemin: string;
  /** La date comptable, au format ISO `AAAA-MM-JJ`. */
  dateComptable: string;
  /** Ce que la pièce désigne, pour le décompte par catégorie. */
  categorie: "facture" | "piece" | "piece_origine";
};

/** Ce que le stockage contient réellement : chemin → taille en octets. */
export type TaillesStockage = Map<string, number>;

export type LigneMois = {
  mois: number;
  nbFactures: number;
  nbPieces: number;
  nbOriginaux: number;
  octetsFactures: number;
  octetsPieces: number;
  octetsOriginaux: number;
  octets: number;
};

export type Anomalies = {
  /** Référencé en base, absent du stockage. */
  manquants: { chemin: string; categorie: string; dateComptable: string }[];
  /** Présent dans le stockage, référencé par aucune ligne. */
  orphelins: { chemin: string; octets: number }[];
  /** `origine_path` renseigné, mais le fichier d'origine n'est pas là. */
  originauxManquants: { chemin: string; dateComptable: string }[];
  /**
   * Facture émise — numérotée — dont aucun document n'est conservé. Ce n'est
   * pas un défaut d'affichage : la pièce existe comptablement et n'existe pas
   * documentairement, alors que la loi demande dix ans de conservation.
   */
  facturesSansDocument: { numero: string; statut: string; dateComptable: string }[];
  /**
   * Pièce dont le document parent est introuvable : sans lui, aucune date
   * comptable, donc aucun exercice, donc jamais exportée. Elle n'appartient à
   * rien — et c'est justement pour ça qu'il faut la nommer.
   */
  sansExercice: { chemin: string; entite: string; entiteId: string }[];
};

export type Inventaire = {
  exercice: number;
  mois: LigneMois[];
  total: LigneMois;
  anomalies: Anomalies;
  /** Combien d'appels au stockage l'inventaire a coûté. */
  appelsStockage: number;
};

const moisVide = (mois: number): LigneMois => ({
  mois,
  nbFactures: 0, nbPieces: 0, nbOriginaux: 0,
  octetsFactures: 0, octetsPieces: 0, octetsOriginaux: 0, octets: 0,
});

/** Le mois d'une date comptable ISO. 0 si la date est illisible. */
export function moisDe(dateIso: string): number {
  const m = /^(\d{4})-(\d{2})/.exec(dateIso ?? "");
  return m ? Number(m[2]) : 0;
}

/** L'année d'une date comptable ISO. 0 si la date est illisible. */
export function anneeDe(dateIso: string): number {
  const m = /^(\d{4})-(\d{2})/.exec(dateIso ?? "");
  return m ? Number(m[1]) : 0;
}

/**
 * L'inventaire lui-même.
 *
 * @param references  tout ce que la base désigne, toutes années confondues :
 *                    l'appartenance à l'exercice se décide ici, sur la date
 *                    comptable, et les orphelins se jugent sur l'ensemble.
 * @param tailles     ce que le stockage contient, pour les dossiers parcourus.
 * @param dansLePerimetre  un chemin du stockage est-il couvert par ce que nous
 *                    avons listé ? Un fichier hors périmètre n'est pas un
 *                    orphelin : il n'a simplement pas été regardé.
 */
export function inventorier(input: {
  exercice: number;
  references: FichierReference[];
  tailles: TaillesStockage;
  dansLePerimetre: (chemin: string) => boolean;
  appelsStockage: number;
  /** Factures emises sans document conserve, toutes annees confondues. */
  facturesSansDocument?: { numero: string; statut: string; dateComptable: string }[];
  /** Pieces dont le parent est introuvable : sans exercice, jamais exportees. */
  sansExercice?: { chemin: string; entite: string; entiteId: string }[];
}): Inventaire {
  const { exercice, references, tailles } = input;

  const mois = Array.from({ length: 12 }, (_, i) => moisVide(i + 1));
  const total = moisVide(0);
  const anomalies: Anomalies = {
    manquants: [], orphelins: [], originauxManquants: [],
    // Les factures sans document se filtrent sur l exercice inventorie ; les
    // pieces sans exercice, elles, ne peuvent se ranger nulle part : on les
    // montre toutes, sur tous les exercices, sinon personne ne les verrait.
    facturesSansDocument: (input.facturesSansDocument ?? [])
      .filter((f) => anneeDe(f.dateComptable) === input.exercice),
    sansExercice: input.sansExercice ?? [],
  };

  for (const ref of references) {
    const presente = tailles.has(ref.chemin);

    // Les anomalies se relèvent sur l'exercice inventorié seulement : un
    // fichier manquant de 2024 n'est pas le sujet de l'export de 2026.
    const deLExercice = anneeDe(ref.dateComptable) === exercice;
    if (!deLExercice) continue;

    if (!presente) {
      if (ref.categorie === "piece_origine") {
        anomalies.originauxManquants.push({ chemin: ref.chemin, dateComptable: ref.dateComptable });
      } else {
        anomalies.manquants.push({
          chemin: ref.chemin, categorie: ref.categorie, dateComptable: ref.dateComptable,
        });
      }
      // Un fichier absent ne pèse rien : le compter ferait annoncer un export
      // plus lourd que ce qu'on saura fabriquer.
      continue;
    }

    const octets = tailles.get(ref.chemin) ?? 0;
    const ligne = mois[moisDe(ref.dateComptable) - 1];
    if (!ligne) continue; // date illisible : elle est déjà hors exercice

    if (ref.categorie === "facture") {
      ligne.nbFactures += 1; ligne.octetsFactures += octets;
      total.nbFactures += 1; total.octetsFactures += octets;
    } else if (ref.categorie === "piece") {
      ligne.nbPieces += 1; ligne.octetsPieces += octets;
      total.nbPieces += 1; total.octetsPieces += octets;
    } else {
      ligne.nbOriginaux += 1; ligne.octetsOriginaux += octets;
      total.nbOriginaux += 1; total.octetsOriginaux += octets;
    }
    ligne.octets += octets;
    total.octets += octets;
  }

  // Les orphelins : ce que le stockage porte et que plus rien ne désigne.
  const referencesConnues = new Set(references.map((r) => r.chemin));
  for (const [chemin, octets] of tailles) {
    if (referencesConnues.has(chemin)) continue;
    if (!input.dansLePerimetre(chemin)) continue;
    anomalies.orphelins.push({ chemin, octets });
  }

  return { exercice, mois, total, anomalies, appelsStockage: input.appelsStockage };
}

/** « 12,4 Mo », pour une phrase lisible. Jamais pour un calcul. */
export function poidsLisible(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} ko`;
  return `${(octets / 1024 / 1024).toFixed(1)} Mo`;
}
