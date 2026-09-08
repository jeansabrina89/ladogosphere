import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { aujourdhuiISO } from "@/src/lib/dates";
import { assujettieALaDate } from "@/src/lib/tva";
import { synchroniserComptaFacture } from "@/src/lib/comptaFacture";
import {
  ligneDepuisArticle,
  changerQuantite,
  totalPanier,
  refusPanier,
  encaissementVente,
  rendreMonnaie,
  lignesEcritureVente,
  construireRetour,
  retourTotal,
  arrondiRetour,
  compteArrondiPour,
  MESSAGE_CLIENT_SANS_FACTURE,
  MESSAGE_FACTURE_EMISE,
  type ArticleVendable,
  type LignePanier,
  type LigneVendue,
  type ModeReglementVente,
} from "@/src/lib/caisseLogique";

/**
 * Caisse — couche base. Elle ne décide rien : les règles viennent de
 * caisseLogique, la transaction vient des RPC finaliser_vente /
 * retourner_vente, et l'écriture vient de passer_ecriture.
 *
 * Le numéro, l'écriture, les lignes figées, les mouvements de stock et le
 * journal partent ensemble : si le stock refuse, rien ne subsiste.
 */

export type Vente = {
  id: string;
  numero: string | null;
  date_vente: string;
  canal: string;
  client_id: string | null;
  montant_total: number | string;
  mode_reglement: ModeReglementVente | null;
  arrondi: number | string;
  montant_recu: number | string | null;
  facture_id: string | null;
  statut: string;
  vendu_par: string | null;
  vente_origine_id: string | null;
  motif: string | null;
  exercice: number | null;
  ecriture_id: string | null;
  created_at: string;
};

export type LigneVente = LigneVendue & { vente_id: string };

const COLONNES_VENTE = `
  id, numero, date_vente, canal, client_id, montant_total, mode_reglement, arrondi,
  montant_recu, facture_id, statut, vendu_par, vente_origine_id, motif, exercice,
  ecriture_id, created_at
`;

const COLONNES_LIGNE = `
  id, vente_id, article_id, libelle, quantite, prix_unitaire, taux_tva, secteur_tdfn, montant
`;

export async function lireVente(id: string): Promise<Vente | null> {
  const { data } = await supabaseAdmin
    .from("ventes").select(COLONNES_VENTE).eq("id", id).maybeSingle();
  return (data as Vente | null) ?? null;
}

export async function lignesDeVente(venteId: string): Promise<LigneVente[]> {
  const { data } = await supabaseAdmin
    .from("ventes_lignes").select(COLONNES_LIGNE).eq("vente_id", venteId).order("created_at");
  return (data ?? []) as unknown as LigneVente[];
}

/** Retours déjà passés sur une vente, avec leurs lignes. */
export async function retoursDeVente(venteId: string): Promise<{ ventes: Vente[]; lignes: LigneVente[] }> {
  const { data: ventes } = await supabaseAdmin
    .from("ventes").select(COLONNES_VENTE).eq("vente_origine_id", venteId).order("date_vente");
  const ids = (ventes ?? []).map((v) => v.id as string);
  if (ids.length === 0) return { ventes: [], lignes: [] };

  const { data: lignes } = await supabaseAdmin
    .from("ventes_lignes").select(COLONNES_LIGNE).in("vente_id", ids);
  return {
    ventes: (ventes ?? []) as unknown as Vente[],
    lignes: (lignes ?? []) as unknown as LigneVente[],
  };
}

export async function listerVentes(filtres?: {
  du?: string | null;
  au?: string | null;
  mode?: string | null;
}): Promise<Vente[]> {
  let requete = supabaseAdmin.from("ventes").select(COLONNES_VENTE);
  if (filtres?.du) requete = requete.gte("date_vente", `${filtres.du}T00:00:00`);
  if (filtres?.au) requete = requete.lte("date_vente", `${filtres.au}T23:59:59`);
  if (filtres?.mode) requete = requete.eq("mode_reglement", filtres.mode);

  const { data } = await requete.order("date_vente", { ascending: false }).limit(500);
  return (data ?? []) as unknown as Vente[];
}

/** Catalogue de la caisse : ce qui est actif, avec son stock du moment. */
export async function articlesVendables(): Promise<ArticleVendable[]> {
  const { data } = await supabaseAdmin
    .from("articles")
    .select("id, nom, reference, code_barres, prix_vente, taux_tva, secteur_tdfn, stock_actuel, unite, photo_path, type_article")
    .eq("actif", true)
    // Une fourniture se stocke mais ne se vend pas seule : elle n'entre pas en caisse.
    .eq("composant", false)
    .order("nom");
  return (data ?? []) as unknown as ArticleVendable[];
}

// ── Facture du client ───────────────────────────────────────────────────────

export type CibleFacture =
  | { factureId: string; creee: boolean }
  | { factureId: null; erreur: string; proposerFactureLibre: boolean };

/**
 * Où porter un achat facturé : la facture en brouillon du client, sinon une
 * facture libre créée pour l'occasion quand un séjour est en cours ou quand on
 * le demande explicitement.
 */
export async function factureCibleClient(
  clientId: string,
  options?: { creerSiAbsente?: boolean; userId?: string | null }
): Promise<CibleFacture> {
  const { data: client } = await supabaseAdmin
    .from("clients").select("id, adresse").eq("id", clientId).maybeSingle();
  if (!client) return { factureId: null, erreur: "Client introuvable.", proposerFactureLibre: false };

  // Une facture en brouillon accepte encore des lignes ; une facture émise, non.
  const { data: brouillon } = await supabaseAdmin
    .from("factures")
    .select("id, numero, statut, type")
    .eq("client_id", clientId)
    .is("numero", null)
    .eq("statut", "brouillon")
    .in("type", ["facture", "libre"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (brouillon) return { factureId: brouillon.id as string, creee: false };

  const sejour = await sejourEnCours(clientId);

  if (!options?.creerSiAbsente && !sejour) {
    return { factureId: null, erreur: MESSAGE_CLIENT_SANS_FACTURE, proposerFactureLibre: true };
  }

  // Une facture porte une adresse : sans elle, elle ne serait pas envoyable.
  if (!String(client.adresse ?? "").trim()) {
    return {
      factureId: null,
      erreur: "Ce client n'a pas d'adresse : complétez sa fiche avant de lui facturer un achat.",
      proposerFactureLibre: false,
    };
  }

  const { data: creee, error } = await supabaseAdmin
    .from("factures")
    .insert({
      client_id: clientId,
      type: "libre",
      type_facture: "service",
      date_facture: new Date().toISOString().slice(0, 10),
      statut: "brouillon",
    })
    .select("id")
    .single();
  if (error || !creee) {
    return { factureId: null, erreur: "Création de la facture impossible.", proposerFactureLibre: false };
  }

  await supabaseAdmin.from("journal_evenements").insert({
    entite: "facture",
    entite_id: creee.id as string,
    evenement: "creation",
    apres: { type: "libre", origine: "caisse" },
    user_id: options?.userId ?? null,
  });

  return { factureId: creee.id as string, creee: true };
}

/** Un séjour en cours : le chien est arrivé et n'est pas reparti. */
export async function sejourEnCours(clientId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("checkin_checkout")
    .select("id, statut, reservations!inner(client_id)")
    .in("statut", ["arrive", "a_recuperer"])
    .eq("reservations.client_id", clientId)
    .limit(1);
  return (data ?? []).length > 0;
}

// ── Finalisation ────────────────────────────────────────────────────────────

export type EntreeVente = {
  cle_idempotence: string;
  lignes: { article_id: string; quantite: number }[];
  mode: ModeReglementVente;
  client_id?: string | null;
  montant_recu?: number | null;
  /** Le geste délibéré qui crée une facture libre quand il n'y en a aucune. */
  creer_facture_libre?: boolean;
  user_id?: string | null;
};

export type ResultatVente = {
  error?: string;
  proposerFactureLibre?: boolean;
  id?: string;
  numero?: string;
  deja?: boolean;
  total?: number;
  aRegler?: number;
  arrondi?: number;
  rendu?: number | null;
};

export async function finaliserVente(entree: EntreeVente): Promise<ResultatVente> {
  if (entree.lignes.length === 0) return { error: "Le panier est vide." };

  const ids = [...new Set(entree.lignes.map((l) => l.article_id))];
  const { data: articles } = await supabaseAdmin
    .from("articles")
    .select("id, nom, reference, code_barres, prix_vente, taux_tva, secteur_tdfn, stock_actuel, unite, photo_path, type_article")
    .in("id", ids)
    .eq("actif", true)
    .eq("composant", false);

  const parId = new Map((articles ?? []).map((a) => [a.id as string, a as unknown as ArticleVendable]));

  // Les libellés, prix et taux sont relus MAINTENANT et figés dans la vente.
  //
  // Le taux figé est celui qui S'APPLIQUE aujourd'hui : zéro tant que
  // l'entreprise n'est pas assujettie. Un ticket d'avant l'assujettissement ne
  // doit garder aucune trace de TVA, pas même dans une colonne.
  const avecTva = await assujettieALaDate(aujourdhuiISO());
  const panier: LignePanier[] = [];
  for (const l of entree.lignes) {
    const article = parId.get(l.article_id);
    if (!article) return { error: "Un article du panier n'existe plus ou a été retiré de la vente." };
    const ligne = changerQuantite(ligneDepuisArticle(article), l.quantite);
    panier.push(avecTva ? ligne : { ...ligne, taux_tva: 0 });
  }

  const refus = refusPanier(panier);
  if (refus) return { error: refus };

  const total = totalPanier(panier);
  const { aRegler, arrondi } = encaissementVente(total, entree.mode);

  let factureId: string | null = null;
  if (entree.mode === "facture_client") {
    if (!entree.client_id) return { error: "Choisissez le client à facturer." };

    const cible = await factureCibleClient(entree.client_id, {
      creerSiAbsente: entree.creer_facture_libre === true,
      userId: entree.user_id,
    });
    if (cible.factureId === null) {
      return { error: cible.erreur, proposerFactureLibre: cible.proposerFactureLibre };
    }
    factureId = cible.factureId;
  }

  const lignesEcriture = lignesEcritureVente({ totalLignes: total, arrondi, mode: entree.mode });

  const { data, error } = await supabaseAdmin.rpc("finaliser_vente", {
    p_cle_idempotence: entree.cle_idempotence,
    p_canal: "comptoir",
    p_client_id: entree.client_id ?? null,
    p_mode: entree.mode,
    p_lignes: panier.map((l) => ({
      article_id: l.article_id,
      libelle: l.libelle,
      quantite: l.quantite,
      prix_unitaire: l.prix_unitaire,
      taux_tva: l.taux_tva,
      secteur_tdfn: l.secteur_tdfn,
      montant: l.montant,
    })),
    p_total: total,
    p_arrondi: arrondi,
    p_ecriture_lignes: lignesEcriture,
    p_facture_id: factureId,
    p_user_id: entree.user_id ?? null,
    p_montant_recu: entree.mode === "especes" ? entree.montant_recu ?? null : null,
  });

  if (error) return { error: messageBase(error.message) };

  const res = data as { id: string; numero: string; deja: boolean };

  // La facture reste un brouillon : la synchronisation ne produit rien
  // aujourd'hui, et c'est l'émission qui portera le produit. On l'appelle
  // quand même, pour que le moteur reste seul maître des écritures.
  if (factureId && !res.deja) await synchroniserComptaFacture(factureId, entree.user_id ?? null);

  return {
    id: res.id,
    numero: res.numero,
    deja: res.deja,
    total,
    aRegler,
    arrondi,
    rendu: entree.mode === "especes" ? rendreMonnaie(aRegler, entree.montant_recu ?? null) : null,
  };
}

// ── Retour ──────────────────────────────────────────────────────────────────

export type EntreeRetour = {
  vente_id: string;
  cle_idempotence: string;
  /** Quantité rendue par identifiant de ligne de vente. */
  quantites: Record<string, number>;
  motif: string;
  user_id?: string | null;
};

export async function retournerVente(entree: EntreeRetour): Promise<ResultatVente> {
  const motif = entree.motif.trim();
  if (!motif) return { error: "Indiquez le motif du retour." };

  const vente = await lireVente(entree.vente_id);
  if (!vente) return { error: "Vente introuvable." };
  if (vente.vente_origine_id) return { error: "On ne rend pas un retour." };
  if (vente.statut !== "finalisee") return { error: "Cette vente est déjà entièrement rendue." };

  // Un achat porté sur une facture déjà émise se corrige par un avoir, pas ici.
  if (vente.facture_id) {
    const { data: facture } = await supabaseAdmin
      .from("factures").select("numero").eq("id", vente.facture_id).maybeSingle();
    if (facture?.numero) {
      return {
        error: `${MESSAGE_FACTURE_EMISE.replace("La facture de ce client est déjà émise", `La facture ${facture.numero} est déjà émise`)} Passez plutôt un avoir sur cette facture.`,
      };
    }
  }

  const lignes = await lignesDeVente(entree.vente_id);
  const precedents = await retoursDeVente(entree.vente_id);
  const dejaRendues = precedents.lignes;

  const retour = construireRetour(lignes, entree.quantites, dejaRendues);
  if (retour.lignes.length === 0) return { error: "Choisissez au moins une ligne à rendre." };

  // Ce que la vente avait encaissé, et ce que les retours ont déjà rendu :
  // le dernier retour rend le solde exact, au centime.
  const arrondiOrigine = Number(vente.arrondi ?? 0);
  const encaisseOrigine = Number(vente.montant_total) + arrondiOrigine;
  const dejaRembourse = precedents.ventes.reduce(
    (s, r) => s + Number(r.montant_total) + Number(r.arrondi ?? 0),
    0
  );

  const arrondi = arrondiRetour({
    totalRetour: retour.total,
    mode: vente.mode_reglement ?? "",
    encaisseOrigine,
    dejaRembourse,
    estTotal: retourTotal(lignes, retour, dejaRendues),
  });

  const lignesEcriture = lignesEcritureVente({
    totalLignes: retour.total,
    arrondi,
    mode: vente.mode_reglement ?? "",
    // Renverser un écart d'arrondi, c'est repasser par son compte d'origine.
    compteArrondi: arrondiOrigine !== 0 ? compteArrondiPour(arrondiOrigine) : null,
  });

  const { data, error } = await supabaseAdmin.rpc("retourner_vente", {
    p_vente_id: entree.vente_id,
    p_cle_idempotence: entree.cle_idempotence,
    p_lignes: retour.lignes,
    p_total: retour.total,
    p_arrondi: arrondi,
    p_ecriture_lignes: lignesEcriture,
    p_motif: motif,
    p_user_id: entree.user_id ?? null,
  });

  if (error) return { error: messageBase(error.message) };

  const res = data as { id: string; numero: string; deja: boolean; vente_annulee: boolean };

  if (vente.facture_id && !res.deja) {
    await synchroniserComptaFacture(vente.facture_id, entree.user_id ?? null);
  }

  return { id: res.id, numero: res.numero, deja: res.deja, total: retour.total, arrondi };
}

// ── Suivi ───────────────────────────────────────────────────────────────────

export type ResumeJour = { nombre: number; total: number; especes: number; surFacture: number };

/** Les chiffres du jour, pour les tuiles et le tableau de bord. */
export async function resumeVentesDuJour(jourISO: string): Promise<ResumeJour> {
  const { data } = await supabaseAdmin
    .from("ventes")
    .select("montant_total, mode_reglement, vente_origine_id")
    .gte("date_vente", `${jourISO}T00:00:00`)
    .lte("date_vente", `${jourISO}T23:59:59`);

  const lignes = (data ?? []) as { montant_total: number | string; mode_reglement: string | null; vente_origine_id: string | null }[];
  const r2 = (n: number) => Math.round(n * 100) / 100;

  return {
    // Les retours comptent dans les montants, pas dans le nombre de ventes.
    nombre: lignes.filter((v) => !v.vente_origine_id).length,
    total: r2(lignes.reduce((s, v) => s + Number(v.montant_total), 0)),
    especes: r2(lignes.filter((v) => v.mode_reglement === "especes")
      .reduce((s, v) => s + Number(v.montant_total), 0)),
    surFacture: r2(lignes.filter((v) => v.mode_reglement === "facture_client")
      .reduce((s, v) => s + Number(v.montant_total), 0)),
  };
}

/** Jamais de texte Postgres à l'écran. */
function messageBase(message: string): string {
  const m = message ?? "";
  if (/Stock insuffisant/.test(m)) return m;
  if (/motif/i.test(m)) return m;
  if (/panier est vide/i.test(m)) return m;
  if (/entièrement rendue|ne rend pas un retour|Vente introuvable/i.test(m)) return m;
  if (/facture emise|facture émise/i.test(m)) {
    return "Cette facture est déjà émise : elle ne reçoit plus de ligne.";
  }
  return "L'enregistrement de la vente a été refusé. Réessayez.";
}
