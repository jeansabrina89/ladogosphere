import { supabaseAdmin } from "@/src/lib/supabase-admin";
import {
  ventilerPanier,
  type LigneVentilable,
  type Ventilation,
  type ParametresTvaAffichage,
  tauxApplicable,
  TAUX_LEGAUX,
  TAUX_NORMAL,
  type CodePrestation,
  type Secteur,
} from "@/src/lib/tvaLogique";
import { BASE_DECOMPTE_PAR_DEFAUT, REGIME_VIERGE } from "@/src/lib/decompteTvaLogique";
import type { BaseDecompte, MethodeTva, ParametresTva, Periodicite, CaSecteur } from "@/src/lib/decompteTvaLogique";

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
  base_decompte: string;
  taux_tdfn_1: number | string;
  libelle_secteur_1: string | null;
  taux_tdfn_2: number | string | null;
  libelle_secteur_2: string | null;
};

// Le régime vierge vit dans le module PUR, avec le reste des règles.
export { REGIME_VIERGE } from "@/src/lib/decompteTvaLogique";

function depuisLigne(l: LigneParametres): ParametresTva {
  const taux2 = l.taux_tdfn_2 === null || l.taux_tdfn_2 === undefined ? null : Number(l.taux_tdfn_2);
  return {
    assujettie: l.assujettie === true,
    dateAssujettissement: l.date_assujettissement,
    numero: (l.numero_tva ?? "").trim() || null,
    methode: (l.methode as MethodeTva) ?? "tdfn",
    periodicite: (l.periodicite as Periodicite) ?? "semestrielle",
    baseDecompte: (l.base_decompte as BaseDecompte) ?? BASE_DECOMPTE_PAR_DEFAUT,
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
    .select("date_debut, assujettie, date_assujettissement, numero_tva, methode, periodicite, base_decompte, taux_tdfn_1, libelle_secteur_1, taux_tdfn_2, libelle_secteur_2")
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
    .select("date_debut, assujettie, date_assujettissement, numero_tva, methode, periodicite, base_decompte, taux_tdfn_1, libelle_secteur_1, taux_tdfn_2, libelle_secteur_2")
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

// ── Les taux légaux en vigueur, et ceux des prestations ────────────────────

/**
 * La liste FERMÉE des taux qu'on a le droit de choisir à une date donnée.
 *
 * Elle vient de la table `taux_tva`, filtrée sur la validité : 7,7 % et 2,5 %
 * restent lisibles sur les pièces d'avant 2024 sans pouvoir être ressaisis
 * aujourd'hui. Les écrans en font une liste déroulante, les actions y
 * confrontent la saisie — un taux ne se tape jamais.
 */
export async function tauxLegauxEnVigueur(dateISO?: string | null): Promise<number[]> {
  const date = dateISO ?? new Date().toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("taux_tva")
    .select("taux, date_debut, date_fin")
    .lte("date_debut", date);

  const valides = ((data ?? []) as unknown as {
    taux: number | string; date_fin: string | null;
  }[])
    .filter((t) => !t.date_fin || t.date_fin >= date)
    .map((t) => Number(t.taux));

  const uniques = [...new Set(valides)].sort((a, b) => b - a);
  // Une base vide ne doit pas ouvrir la porte : on retombe sur les taux du code.
  return uniques.length > 0 ? uniques : [...TAUX_LEGAUX];
}

export type TauxPrestation = { taux: number; motif: string | null; dateDebut: string | null };

/**
 * Le taux d'une prestation, EN VIGUEUR à la date de la pièce.
 *
 * Un changement de taux ne vaut que pour les pièces suivantes : c'est la date
 * d'effet qui décide, et une facture émise garde le taux qu'elle a figé.
 */
export async function tauxPrestation(
  code: CodePrestation,
  dateISO?: string | null
): Promise<TauxPrestation> {
  const date = dateISO ?? new Date().toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("taux_prestation")
    .select("taux, motif_exonere, date_debut")
    .eq("code", code)
    .lte("date_debut", date)
    .order("date_debut", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { taux: TAUX_NORMAL, motif: null, dateDebut: null };
  const l = data as unknown as { taux: number | string; motif_exonere: string | null; date_debut: string };
  return {
    taux: Number(l.taux),
    motif: (l.motif_exonere ?? "").trim() || null,
    dateDebut: l.date_debut,
  };
}

/** Les six prestations et leur taux en vigueur, pour l'écran des réglages. */
export async function tauxDesPrestations(
  dateISO?: string | null
): Promise<Record<string, TauxPrestation>> {
  const date = dateISO ?? new Date().toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("taux_prestation")
    .select("code, taux, motif_exonere, date_debut")
    .lte("date_debut", date)
    .order("date_debut", { ascending: true });

  const parCode: Record<string, TauxPrestation> = {};
  for (const l of (data ?? []) as unknown as {
    code: string; taux: number | string; motif_exonere: string | null; date_debut: string;
  }[]) {
    // Trié par date croissante : la dernière écrasée est la plus récente.
    parCode[l.code] = {
      taux: Number(l.taux),
      motif: (l.motif_exonere ?? "").trim() || null,
      dateDebut: l.date_debut,
    };
  }
  return parCode;
}

/**
 * Le taux ET le motif à figer sur une ligne de prestation.
 *
 * Zéro sans motif ne peut pas sortir d'ici : la contrainte de base l'interdit
 * à la saisie, et le motif suit la ligne jusqu'à la facture.
 */
export async function tvaDeLaPrestation(
  code: CodePrestation,
  dateISO: string | null
): Promise<{ taux: number; motif: string | null }> {
  const p = await tauxPrestation(code, dateISO);
  const taux = await tauxAFiger(dateISO, p.taux);
  return { taux, motif: taux === 0 ? p.motif : null };
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
