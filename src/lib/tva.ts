import { supabaseAdmin } from "@/src/lib/supabase-admin";
import {
  ventilerPanier,
  type LigneVentilable,
  type Ventilation,
  type ParametresTvaAffichage,
  tauxApplicable,
  type Secteur,
} from "@/src/lib/tvaLogique";
import type { MethodeTva, ParametresTva, Periodicite, CaSecteur } from "@/src/lib/decompteTvaLogique";

/**
 * L'accès à la TVA : les paramètres du régime, la ventilation d'une pièce et
 * le chiffre d'affaires par secteur.
 *
 * Les règles sont dans `tvaLogique` et `decompteTvaLogique`, qui sont purs.
 * Ici, il n'y a que des lectures.
 */

type LigneParametres = {
  date_debut: string;
  assujettie: boolean;
  date_assujettissement: string | null;
  numero_tva: string | null;
  methode: string;
  periodicite: string;
  taux_tdfn_1: number | string;
  libelle_secteur_1: string | null;
  taux_tdfn_2: number | string | null;
  libelle_secteur_2: string | null;
};

/** Le régime quand la table est vide : rien n'est assujetti, rien ne s'affiche. */
export const REGIME_VIERGE: ParametresTva = {
  assujettie: false,
  dateAssujettissement: null,
  numero: null,
  methode: "tdfn",
  periodicite: "semestrielle",
  tauxTdfn1: 0,
  libelleSecteur1: "",
  tauxTdfn2: null,
  libelleSecteur2: null,
};

function depuisLigne(l: LigneParametres): ParametresTva {
  const taux2 = l.taux_tdfn_2 === null || l.taux_tdfn_2 === undefined ? null : Number(l.taux_tdfn_2);
  return {
    assujettie: l.assujettie === true,
    dateAssujettissement: l.date_assujettissement,
    numero: (l.numero_tva ?? "").trim() || null,
    methode: (l.methode as MethodeTva) ?? "tdfn",
    periodicite: (l.periodicite as Periodicite) ?? "semestrielle",
    tauxTdfn1: Number(l.taux_tdfn_1 ?? 0),
    libelleSecteur1: (l.libelle_secteur_1 ?? "").trim(),
    tauxTdfn2: taux2,
    libelleSecteur2: (l.libelle_secteur_2 ?? "").trim() || null,
  };
}

/**
 * Le régime EN VIGUEUR à une date : la ligne la plus récente dont la date de
 * début est déjà passée. Sans date, c'est le régime d'aujourd'hui.
 *
 * L'historisation compte : un décompte de l'an dernier doit se relire avec les
 * taux de l'an dernier, pas avec ceux d'aujourd'hui.
 */
export async function lireParametresTva(dateISO?: string | null): Promise<ParametresTva> {
  const date = dateISO ?? new Date().toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("parametres_tva")
    .select("date_debut, assujettie, date_assujettissement, numero_tva, methode, periodicite, taux_tdfn_1, libelle_secteur_1, taux_tdfn_2, libelle_secteur_2")
    .lte("date_debut", date)
    .order("date_debut", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? depuisLigne(data as unknown as LigneParametres) : REGIME_VIERGE;
}

/** Toutes les versions du régime, de la plus récente à la plus ancienne. */
export async function historiqueParametresTva(): Promise<(ParametresTva & { dateDebut: string })[]> {
  const { data } = await supabaseAdmin
    .from("parametres_tva")
    .select("date_debut, assujettie, date_assujettissement, numero_tva, methode, periodicite, taux_tdfn_1, libelle_secteur_1, taux_tdfn_2, libelle_secteur_2")
    .order("date_debut", { ascending: false });

  return ((data ?? []) as unknown as LigneParametres[]).map((l) => ({
    ...depuisLigne(l),
    dateDebut: l.date_debut,
  }));
}

/** Ce que la facture et le ticket ont besoin de savoir, et rien de plus. */
export function affichage(p: ParametresTva): ParametresTvaAffichage {
  return {
    assujettie: p.assujettie,
    numero: p.numero,
    dateAssujettissement: p.dateAssujettissement,
  };
}

/**
 * Le taux à FIGER sur une ligne qu'on écrit maintenant.
 *
 * Zéro tant que l'entreprise n'est pas assujettie, et zéro avant la date
 * d'assujettissement. Une pièce émise hors assujettissement ne doit garder
 * aucune trace de taux : ni sur son pied, ni dans son libellé, ni dans la
 * colonne. Mentionner une TVA qu'on ne verse pas est une faute lourde, et un
 * chiffre qui dort dans une colonne finit toujours par ressortir dans un
 * tableau.
 */
export async function tauxAFiger(
  dateISO: string | null,
  tauxLigne: number | string | null | undefined
): Promise<number> {
  const regime = await lireParametresTva(dateISO);
  return tauxApplicable(affichage(regime), dateISO, tauxLigne ?? 0);
}

/** Vrai si la pièce de cette date porte de la TVA. */
export async function assujettieALaDate(dateISO: string | null): Promise<boolean> {
  const regime = await lireParametresTva(dateISO);
  if (!regime.assujettie) return false;
  if (regime.dateAssujettissement && dateISO && dateISO < regime.dateAssujettissement) return false;
  return true;
}

// ── La ventilation d'une pièce ─────────────────────────────────────────────

/**
 * Ventiler une facture d'après SES LIGNES.
 *
 * Le port et la remise d'une commande en ligne sont eux-mêmes des lignes de
 * facture, déjà ventilées à l'émission : ici, chaque ligne porte son taux et
 * il n'y a plus rien à répartir. C'est ce qui garantit qu'une pièce émise ne
 * se recalcule jamais — on relit, on n'invente pas.
 */
export async function ventilationFacture(factureId: string): Promise<Ventilation> {
  const { data } = await supabaseAdmin
    .from("facture_lignes")
    .select("montant, taux_tva")
    .eq("facture_id", factureId);

  return ventilerPanier({ lignes: (data ?? []) as unknown as LigneVentilable[] });
}

/** Ventiler une vente au comptoir d'après ses lignes figées. */
export async function ventilationVente(venteId: string): Promise<Ventilation> {
  const { data } = await supabaseAdmin
    .from("ventes_lignes")
    .select("montant, taux_tva")
    .eq("vente_id", venteId);

  return ventilerPanier({ lignes: (data ?? []) as unknown as LigneVentilable[] });
}

// ── Le chiffre d'affaires par secteur ──────────────────────────────────────

/**
 * Le chiffre d'affaires TTC d'une période, par secteur de dette fiscale nette.
 *
 * Deux sources, sans recoupement possible :
 *
 *   • les lignes des FACTURES ÉMISES dans la période — un avoir y compte en
 *     négatif, puisqu'il reprend du produit ;
 *   • les lignes des VENTES au comptoir qui n'ont PAS été portées sur une
 *     facture. Celles qui l'ont été sont déjà comptées ci-dessus, et les
 *     compter deux fois gonflerait le décompte.
 *
 * Un secteur absent de la ligne (pièce antérieure à APP 14) retombe sur la
 * pension : c'est le secteur principal, et on ne réécrit pas l'histoire.
 */
export async function caParSecteur(debut: string, fin: string): Promise<CaSecteur[]> {
  const total = new Map<Secteur, number>([["pension", 0], ["commerce", 0]]);
  const ajouter = (secteur: string | null, montant: number) => {
    const s: Secteur = secteur === "commerce" ? "commerce" : "pension";
    total.set(s, Math.round((total.get(s)! + montant) * 100) / 100);
  };

  const { data: facturees } = await supabaseAdmin
    .from("facture_lignes")
    .select("montant, secteur_tdfn, factures!inner(type, statut, date_facture, emise_le)")
    .gte("factures.date_facture", debut)
    .lte("factures.date_facture", fin)
    .not("factures.emise_le", "is", null);

  for (const l of (facturees ?? []) as unknown as {
    montant: number | string; secteur_tdfn: string | null;
    factures: { type: string | null; statut: string | null };
  }[]) {
    if (l.factures?.statut === "annulee") continue;
    const signe = l.factures?.type === "avoir" ? -1 : 1;
    ajouter(l.secteur_tdfn, signe * Number(l.montant ?? 0));
  }

  const { data: vendues } = await supabaseAdmin
    .from("ventes_lignes")
    .select("montant, secteur_tdfn, ventes!inner(date_vente, mode_reglement, facture_id)")
    .gte("ventes.date_vente", `${debut}T00:00:00`)
    .lte("ventes.date_vente", `${fin}T23:59:59`)
    .is("ventes.facture_id", null);

  for (const l of (vendues ?? []) as unknown as {
    montant: number | string; secteur_tdfn: string | null;
  }[]) {
    ajouter(l.secteur_tdfn, Number(l.montant ?? 0));
  }

  return [...total.entries()].map(([secteur, ttc]) => ({ secteur, ttc }));
}

/** Les douze derniers mois, pour l'alerte du seuil des 10 %. */
export async function caDouzeMoisGlissants(finISO?: string): Promise<CaSecteur[]> {
  const fin = finISO ?? new Date().toISOString().slice(0, 10);
  const d = new Date(`${fin}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  d.setUTCDate(d.getUTCDate() + 1);
  return caParSecteur(d.toISOString().slice(0, 10), fin);
}
