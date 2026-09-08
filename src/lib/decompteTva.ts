import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { caParSecteur, lireParametresTva } from "@/src/lib/tva";
import { ventilerPanier, type LigneVentilable } from "@/src/lib/tvaLogique";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import {
  calculerDecompteEffectif,
  calculerDecompteTdfn,
  lignesEcritureDecompteEffectif,
  lignesEcritureDecompteTdfn,
  periodesDe,
  refusDecompte,
  type Decompte,
  type PeriodeTva,
} from "@/src/lib/decompteTvaLogique";

/**
 * Le décompte TVA : lecture, calcul et déclaration.
 *
 * Les règles sont dans `decompteTvaLogique`, qui est pur. Ici vivent les
 * lectures, l'écriture par `passer_ecriture` et la trace au journal.
 *
 * Une période déclarée est FIGÉE : un trigger de base le garantit, et le calcul
 * n'est jamais rejoué dessus. On corrige par la période suivante — c'est ce que
 * demande l'AFC, et c'est ce qui rend un décompte opposable.
 */

export const PIECE_TYPE_DECOMPTE = "decompte_tva";

export type DecompteEnregistre = {
  id: string;
  code: string;
  periode_debut: string;
  periode_fin: string;
  methode: string;
  detail: unknown;
  ca_total: number;
  total_du: number;
  statut: string;
  ecriture_id: string | null;
  paye_le: string | null;
  declare_le: string;
};

export async function decomptesDeclares(): Promise<DecompteEnregistre[]> {
  const { data } = await supabaseAdmin
    .from("decomptes_tva")
    .select("id, code, periode_debut, periode_fin, methode, detail, ca_total, total_du, statut, ecriture_id, paye_le, declare_le")
    .order("periode_debut", { ascending: false });
  return (data ?? []) as unknown as DecompteEnregistre[];
}

export async function decomptePourPeriode(code: string): Promise<DecompteEnregistre | null> {
  const { data } = await supabaseAdmin
    .from("decomptes_tva")
    .select("id, code, periode_debut, periode_fin, methode, detail, ca_total, total_du, statut, ecriture_id, paye_le, declare_le")
    .eq("code", code)
    .maybeSingle();
  return (data as unknown as DecompteEnregistre | null) ?? null;
}

/** Les périodes d'une année, avec l'état de chacune. */
export async function periodesAvecEtat(annee: number): Promise<
  (PeriodeTva & { declare: DecompteEnregistre | null })[]
> {
  const regime = await lireParametresTva(`${annee}-12-31`);
  const periodes = periodesDe(annee, regime.periodicite);
  const declares = await decomptesDeclares();
  return periodes.map((p) => ({
    ...p,
    declare: declares.find((d) => d.code === p.code) ?? null,
  }));
}

export type Apercu = {
  periode: PeriodeTva;
  /** Le refus qui empêche de calculer, ou null. */
  refus: string | null;
  decompte: Decompte | null;
  /** Méthode effective : la TVA facturée et l'impôt préalable de la période. */
  effectif: { tvaFacturee: number; impotPrealable: number; totalDu: number } | null;
  dejaDeclare: DecompteEnregistre | null;
};

/**
 * L'aperçu d'une période, AVANT déclaration : ce qu'on doit, et pourquoi.
 * Rien n'est écrit — c'est un calcul, pas un engagement.
 */
export async function apercuDecompte(periode: PeriodeTva): Promise<Apercu> {
  const [regime, deja] = await Promise.all([
    lireParametresTva(periode.fin),
    decomptePourPeriode(periode.code),
  ]);

  const refus = refusDecompte(regime);
  if (refus) {
    return { periode, refus, decompte: null, effectif: null, dejaDeclare: deja };
  }

  const ca = await caParSecteur(periode.debut, periode.fin);

  if (regime.methode === "tdfn") {
    return {
      periode,
      refus: null,
      decompte: calculerDecompteTdfn({ parametres: regime, caParSecteur: ca }),
      effectif: null,
      dejaDeclare: deja,
    };
  }

  // Méthode effective : la TVA facturée se lit sur les lignes de la période,
  // l'impôt préalable sur le solde du compte 1170.
  const ventilation = ventilerPanier({ lignes: await lignesDeLaPeriode(periode) });
  const effectif = calculerDecompteEffectif({
    ventilation,
    impotPrealable: await soldeImpotPrealable(periode),
  });
  return { periode, refus: null, decompte: null, effectif, dejaDeclare: deja };
}

/** Toutes les lignes facturées et vendues de la période, avec leur taux figé. */
async function lignesDeLaPeriode(periode: PeriodeTva): Promise<LigneVentilable[]> {
  const lignes: LigneVentilable[] = [];

  const { data: facturees } = await supabaseAdmin
    .from("facture_lignes")
    .select("montant, taux_tva, factures!inner(type, statut, date_facture, emise_le)")
    .gte("factures.date_facture", periode.debut)
    .lte("factures.date_facture", periode.fin)
    .not("factures.emise_le", "is", null);

  for (const l of (facturees ?? []) as unknown as {
    montant: number | string; taux_tva: number | string;
    factures: { type: string | null; statut: string | null };
  }[]) {
    if (l.factures?.statut === "annulee") continue;
    const signe = l.factures?.type === "avoir" ? -1 : 1;
    lignes.push({ montant: signe * Number(l.montant ?? 0), taux_tva: l.taux_tva });
  }

  const { data: vendues } = await supabaseAdmin
    .from("ventes_lignes")
    .select("montant, taux_tva, ventes!inner(date_vente, facture_id)")
    .gte("ventes.date_vente", `${periode.debut}T00:00:00`)
    .lte("ventes.date_vente", `${periode.fin}T23:59:59`)
    .is("ventes.facture_id", null);

  for (const l of (vendues ?? []) as unknown as {
    montant: number | string; taux_tva: number | string;
  }[]) {
    lignes.push({ montant: l.montant, taux_tva: l.taux_tva });
  }

  return lignes;
}

/** Le solde débiteur de 1170 sur la période — l'impôt préalable à récupérer. */
async function soldeImpotPrealable(periode: PeriodeTva): Promise<number> {
  const { data } = await supabaseAdmin
    .from("ecritures_lignes")
    .select("debit, credit, ecritures!inner(date_ecriture)")
    .eq("compte_numero", "1170")
    .gte("ecritures.date_ecriture", periode.debut)
    .lte("ecritures.date_ecriture", periode.fin);

  const solde = ((data ?? []) as unknown as { debit: number | string; credit: number | string }[])
    .reduce((s, l) => s + Number(l.debit ?? 0) - Number(l.credit ?? 0), 0);
  return Math.round(Math.max(solde, 0) * 100) / 100;
}

export type RetourDeclaration = { error?: string; message?: string; code?: string };

/**
 * Déclarer une période : l'écriture part, et la période se ferme.
 *
 * En dette fiscale nette, c'est ICI et seulement ici que la TVA entre en
 * comptabilité : D 3806 / C 2200, une fois par période. Rien n'a été passé au
 * fil des factures — sans quoi on la compterait deux fois.
 */
export async function declarerDecompte(
  code: string,
  userId: string | null
): Promise<RetourDeclaration> {
  const annee = Number(code.slice(0, 4));
  const regime = await lireParametresTva(`${annee}-12-31`);
  const periode = periodesDe(annee, regime.periodicite).find((p) => p.code === code);
  if (!periode) return { error: "Cette période n'existe pas." };

  // Une période déjà déclarée ne se rejoue pas, même par erreur de double clic.
  const deja = await decomptePourPeriode(code);
  if (deja) {
    return { error: `Le décompte ${periode.libelle} est déjà déclaré : corrigez par la période suivante.` };
  }

  const apercu = await apercuDecompte(periode);
  if (apercu.refus) return { error: apercu.refus };

  const detail = apercu.decompte
    ? apercu.decompte.lignes
    : [{
        secteur: "pension",
        libelle: "TVA facturée moins impôt préalable",
        ca: apercu.effectif?.tvaFacturee ?? 0,
        taux: 0,
        du: apercu.effectif?.totalDu ?? 0,
      }];
  const caTotal = apercu.decompte?.caTotal ?? 0;
  const totalDu = apercu.decompte?.totalDu ?? apercu.effectif?.totalDu ?? 0;

  const lignesEcriture = apercu.decompte
    ? lignesEcritureDecompteTdfn(totalDu)
    : lignesEcritureDecompteEffectif(apercu.effectif!);

  // L'identifiant est tiré ICI : l'écriture doit pointer sur la pièce, et le
  // décompte devient figé dès son insertion — on ne pourrait plus y revenir
  // pour y coller l'écriture après coup.
  const decompteId = crypto.randomUUID();

  let ecritureId: string | null = null;
  if (lignesEcriture.length > 0) {
    const { data, error } = await supabaseAdmin.rpc("passer_ecriture", {
      p_date: periode.fin,
      p_libelle: `Décompte TVA ${periode.libelle}`,
      p_piece_type: PIECE_TYPE_DECOMPTE,
      p_piece_id: decompteId,
      p_lignes: lignesEcriture,
      p_created_by: userId,
    });
    if (error) return { error: "L'écriture du décompte n'a pas pu être passée." };
    ecritureId = (data as string) ?? null;
  }

  const { error: erreurInsert } = await supabaseAdmin.from("decomptes_tva").insert({
    id: decompteId,
    code: periode.code,
    periode_debut: periode.debut,
    periode_fin: periode.fin,
    methode: regime.methode,
    periodicite: regime.periodicite,
    detail,
    ca_total: caTotal,
    total_du: totalDu,
    statut: "declare",
    ecriture_id: ecritureId,
    declare_par: userId,
  });
  if (erreurInsert) {
    return { error: "Le décompte n'a pas pu être enregistré." };
  }

  await tracerEvenement({
    entite: "decompte_tva",
    entiteId: decompteId,
    evenement: "decompte_tva",
    apres: { code: periode.code, methode: regime.methode, ca_total: caTotal, total_du: totalDu, detail },
    userId,
  });

  return { code: periode.code, message: `Décompte ${periode.libelle} déclaré.` };
}

/** Le versement à l'AFC : 2200 se solde par la banque. */
export async function marquerPaye(
  code: string,
  dateISO: string,
  userId: string | null
): Promise<RetourDeclaration> {
  const d = await decomptePourPeriode(code);
  if (!d) return { error: "Décompte introuvable." };
  if (d.statut === "paye") return { error: "Ce décompte est déjà marqué payé." };
  if (Number(d.total_du) <= 0) return { error: "Ce décompte ne doit rien : il n'y a rien à payer." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return { error: "La date de paiement est illisible." };

  const { data, error } = await supabaseAdmin.rpc("passer_ecriture", {
    p_date: dateISO,
    p_libelle: `Paiement TVA ${d.code}`,
    p_piece_type: PIECE_TYPE_DECOMPTE,
    p_piece_id: d.id,
    p_lignes: [
      { compte: "2200", debit: Number(d.total_du), credit: 0 },
      { compte: "1020", debit: 0, credit: Number(d.total_du) },
    ],
    p_created_by: userId,
  });
  if (error) return { error: "L'écriture de paiement n'a pas pu être passée." };

  // Seuls le paiement et son écriture peuvent encore bouger : le trigger de
  // base refuse tout le reste.
  await supabaseAdmin
    .from("decomptes_tva")
    .update({ statut: "paye", paye_le: dateISO, ecriture_paiement_id: (data as string) ?? null })
    .eq("id", d.id);

  await tracerEvenement({
    entite: "decompte_tva", entiteId: d.id, evenement: "decompte_tva_paye",
    apres: { code: d.code, montant: Number(d.total_du), date: dateISO }, userId,
  });

  return { code: d.code, message: `Paiement du décompte ${d.code} enregistré.` };
}

/** Le solde du compte 2200 : ce qui reste dû à l'AFC. */
export async function soldeTvaDue(): Promise<number> {
  const { data } = await supabaseAdmin
    .from("ecritures_lignes")
    .select("debit, credit")
    .eq("compte_numero", "2200");

  const solde = ((data ?? []) as unknown as { debit: number | string; credit: number | string }[])
    .reduce((s, l) => s + Number(l.credit ?? 0) - Number(l.debit ?? 0), 0);
  return Math.round(solde * 100) / 100;
}
