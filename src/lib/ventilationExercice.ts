import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { lireParametresTva } from "@/src/lib/tva";
import {
  etiquetteLigneTva,
  libelleSecteur,
  tauxValide,
  TAUX_NORMAL,
  type Secteur,
} from "@/src/lib/tvaLogique";

/**
 * La ventilation d'un exercice, par taux et par secteur.
 *
 * Elle se lit sur les LIGNES des pièces émises — chacune porte son taux et son
 * secteur, figés à l'émission. Aucune écriture n'est touchée, aucun montant
 * n'est recalculé : c'est une lecture, et c'est tout ce qu'elle doit être.
 *
 * Les pièces antérieures à APP 14 portent un taux à zéro et pas de secteur :
 * elles apparaissent en « hors champ », rattachées à la pension. On ne réécrit
 * pas l'histoire pour faire joli dans un tableau.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

export type LigneVentilationExercice = {
  cle: string;
  libelle: string;
  ttc: number;
  ht: number;
  tva: number;
};

export type VentilationExercice = {
  /** Null quand l'entreprise n'était pas assujettie : rien à montrer. */
  assujettie: boolean;
  parTaux: LigneVentilationExercice[];
  parSecteur: LigneVentilationExercice[];
  totalTtc: number;
  totalHt: number;
  totalTva: number;
};

type LigneBrute = { montant: number; taux: number; secteur: Secteur };

export async function ventilationExercice(annee: number): Promise<VentilationExercice> {
  const debut = `${annee}-01-01`;
  const fin = `${annee}-12-31`;
  const regime = await lireParametresTva(fin);

  const brutes: LigneBrute[] = [];

  const { data: facturees } = await supabaseAdmin
    .from("facture_lignes")
    .select("montant, taux_tva, secteur_tdfn, factures!inner(type, statut, date_facture, emise_le)")
    .gte("factures.date_facture", debut)
    .lte("factures.date_facture", fin)
    .not("factures.emise_le", "is", null);

  for (const l of (facturees ?? []) as unknown as {
    montant: number | string; taux_tva: number | string; secteur_tdfn: string | null;
    factures: { type: string | null; statut: string | null };
  }[]) {
    if (l.factures?.statut === "annulee") continue;
    const signe = l.factures?.type === "avoir" ? -1 : 1;
    brutes.push({
      montant: signe * Number(l.montant ?? 0),
      taux: tauxValide(l.taux_tva) ?? 0,
      secteur: l.secteur_tdfn === "commerce" ? "commerce" : "pension",
    });
  }

  // Les ventes au comptoir NON portées sur une facture : celles qui le sont
  // ont déjà été comptées ci-dessus.
  const { data: vendues } = await supabaseAdmin
    .from("ventes_lignes")
    .select("montant, taux_tva, secteur_tdfn, ventes!inner(date_vente, facture_id)")
    .gte("ventes.date_vente", `${debut}T00:00:00`)
    .lte("ventes.date_vente", `${fin}T23:59:59`)
    .is("ventes.facture_id", null);

  for (const l of (vendues ?? []) as unknown as {
    montant: number | string; taux_tva: number | string; secteur_tdfn: string | null;
  }[]) {
    brutes.push({
      montant: Number(l.montant ?? 0),
      taux: tauxValide(l.taux_tva) ?? 0,
      secteur: l.secteur_tdfn === "pension" ? "pension" : "commerce",
    });
  }

  const parTaux = new Map<number, number>();
  const parSecteur = new Map<Secteur, number>();
  for (const b of brutes) {
    parTaux.set(b.taux, r2((parTaux.get(b.taux) ?? 0) + b.montant));
    parSecteur.set(b.secteur, r2((parSecteur.get(b.secteur) ?? 0) + b.montant));
  }

  const extraire = (ttc: number, taux: number) => {
    if (taux <= 0) return { ht: ttc, tva: 0 };
    const ht = r2(ttc / (1 + taux / 100));
    return { ht, tva: r2(ttc - ht) };
  };

  const lignesTaux: LigneVentilationExercice[] = [...parTaux.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([taux, ttc]) => {
      const { ht, tva } = extraire(ttc, taux);
      return {
        cle: String(taux),
        libelle: taux > 0 ? etiquetteLigneTva(taux) : "Hors champ ou non assujetti",
        ttc, ht, tva,
      };
    });

  // Le secteur ne dit rien de la TVA facturée : il sert au décompte. On y
  // montre le chiffre d'affaires TTC, qui est la base de la dette fiscale nette.
  const lignesSecteur: LigneVentilationExercice[] = [...parSecteur.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([secteur, ttc]) => ({
      cle: secteur,
      libelle: libelleSecteur(secteur),
      ttc, ht: ttc, tva: 0,
    }));

  return {
    assujettie: regime.assujettie,
    parTaux: lignesTaux,
    parSecteur: lignesSecteur,
    totalTtc: r2(lignesTaux.reduce((s, l) => s + l.ttc, 0)),
    totalHt: r2(lignesTaux.reduce((s, l) => s + l.ht, 0)),
    totalTva: r2(lignesTaux.reduce((s, l) => s + l.tva, 0)),
  };
}

/** Le taux le plus haut rencontré, pour trier un affichage. */
export const TAUX_PAR_DEFAUT_AFFICHAGE = TAUX_NORMAL;
