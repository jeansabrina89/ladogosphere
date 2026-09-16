/**
 * Les lignes libres d'une facture de locataire de box.
 *
 * Sous les lignes que l'application propose (forfait, actes, loyer), Sabrina
 * ajoute ce qu'elle a avancé pour le chien : sa nourriture, une consultation.
 * Une ligne libre, c'est un libellé, un montant TTC et un compte choisi dans
 * une liste COURTE : trois possibilités, pas le plan comptable entier.
 *
 * La ligne suit ensuite exactement le chemin des lignes libres de la
 * comptabilité (`figerLigneLibre`) : même compte de produit, même taux figé.
 *
 * Module pur : l'écran et l'action le lisent, la base ne le connaît pas.
 */

export const COMPTE_ALIMENTATION_REFACTUREE = "3022";
export const COMPTE_VETERINAIRE_REFACTURE = "3023";
export const COMPTE_AUTRE_PRESTATION = "3020";

/**
 * Jamais 3200 : c'est la vente de marchandises de la boutique, tirée du stock.
 * Ce qu'on refacture ici ne sort d'aucun stock — cela transite.
 */
export const COMPTES_LIGNE_LIBRE_LOCATAIRE = [
  { numero: COMPTE_ALIMENTATION_REFACTUREE, libelle: "Alimentation refacturée" },
  { numero: COMPTE_VETERINAIRE_REFACTURE, libelle: "Frais vétérinaires refacturés" },
  { numero: COMPTE_AUTRE_PRESTATION, libelle: "Autre prestation" },
] as const;

export type LigneLibreSaisie = {
  libelle: string;
  /** Montant TTC, en francs. */
  montant: number;
  compte_produit: string;
};

const COMPTES_PERMIS = COMPTES_LIGNE_LIBRE_LOCATAIRE.map((c) => c.numero) as readonly string[];

function lireMontant(brut: unknown): number {
  if (typeof brut === "number") return brut;
  return Number(String(brut ?? "").trim().replace(/\s/g, "").replace(",", "."));
}

/**
 * Relit ce que l'écran envoie. Une ligne sans libellé est ignorée — c'est une
 * ligne ajoutée puis laissée vide ; une ligne AVEC libellé doit être juste,
 * sinon tout est refusé et l'erreur nomme la ligne fautive.
 */
export function validerLignesLibresLocataire(brut: unknown): {
  lignes: LigneLibreSaisie[];
  error?: string;
} {
  let liste: unknown = brut;
  if (typeof brut === "string") {
    if (brut.trim() === "") return { lignes: [] };
    try {
      liste = JSON.parse(brut);
    } catch {
      return { lignes: [], error: "Lignes ajoutées illisibles." };
    }
  }
  if (liste === null || liste === undefined) return { lignes: [] };
  if (!Array.isArray(liste)) return { lignes: [], error: "Lignes ajoutées illisibles." };

  const lignes: LigneLibreSaisie[] = [];
  for (const brute of liste as Record<string, unknown>[]) {
    const libelle = String(brute?.libelle ?? "").trim();
    if (libelle === "") continue;

    const montant = lireMontant(brute?.montant);
    if (!Number.isFinite(montant) || montant <= 0) {
      return { lignes: [], error: `Montant invalide sur « ${libelle} ».` };
    }
    const compte = String(brute?.compte_produit ?? "").trim();
    if (!COMPTES_PERMIS.includes(compte)) {
      return { lignes: [], error: `Choisissez le type de « ${libelle} » dans la liste.` };
    }
    lignes.push({ libelle, montant: Math.round(montant * 100) / 100, compte_produit: compte });
  }
  return { lignes };
}

export function libelleCompteLigneLibre(numero: string): string {
  return COMPTES_LIGNE_LIBRE_LOCATAIRE.find((c) => c.numero === numero)?.libelle ?? numero;
}
