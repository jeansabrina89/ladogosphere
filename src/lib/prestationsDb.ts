import { supabaseAdmin } from "@/src/lib/supabase-admin";
import {
  fenetreGlissante,
  planRegeneration,
  tachesAttendues,
  type JoursPersonnalises,
  type LigneFormule,
  type TacheExistante,
} from "@/src/lib/generationTaches";
import {
  CLES_REGLAGES,
  catalogueVisible,
  reglagesDepuisParametres,
  type ReglagesPrestations,
} from "@/src/lib/prestationsLogique";

/**
 * Ce que les prestations lisent et écrivent en base.
 *
 * Toute la DÉCISION vit dans les modules purs (`prestationsLogique`,
 * `generationTaches`, `factureLocataireLogique`). Ici, on ne fait qu'aller
 * chercher et poser — c'est ce partage qui rend la règle testable sans base.
 */

export type TacheDuJour = {
  id: string;
  date: string;
  heure_prevue: string | null;
  statut: string;
  origine: string;
  garde: boolean;
  facturable: boolean;
  prix_fige: number;
  commentaire: string | null;
  motif_annulation: string | null;
  box: string | null;
  client_id: string;
  client: string;
  chien: string | null;
  prestation: string;
  unite: string;
  duree_minutes: number | null;
  fait_le: string | null;
  fait_par: string | null;
};

const SELECT_TACHE = `
  id, date, heure_prevue, statut, origine, garde, facturable, prix_fige,
  commentaire, motif_annulation, box, client_id, fait_le, fait_par,
  clients (prenom, nom, box_loue),
  chiens (nom),
  prestations (nom, unite, duree_minutes)
`;

type LigneBrute = Record<string, unknown> & {
  clients?: { prenom?: string; nom?: string; box_loue?: string | null } | null;
  chiens?: { nom?: string } | null;
  prestations?: { nom?: string; unite?: string; duree_minutes?: number | null } | null;
};

function versTache(l: LigneBrute): TacheDuJour {
  const c = l.clients ?? null;
  return {
    id: String(l.id),
    date: String(l.date),
    heure_prevue: (l.heure_prevue as string | null) ?? null,
    statut: String(l.statut),
    origine: String(l.origine),
    garde: l.garde === true,
    facturable: l.facturable === true,
    prix_fige: Number(l.prix_fige ?? 0),
    commentaire: (l.commentaire as string | null) ?? null,
    motif_annulation: (l.motif_annulation as string | null) ?? null,
    // Le box de la tâche fait foi ; à défaut, celui que le locataire loue.
    box: (l.box as string | null) ?? c?.box_loue ?? null,
    client_id: String(l.client_id),
    client: `${c?.prenom ?? ""} ${c?.nom ?? ""}`.trim() || "—",
    chien: l.chiens?.nom ?? null,
    prestation: l.prestations?.nom ?? "—",
    unite: l.prestations?.unite ?? "autre",
    duree_minutes: l.prestations?.duree_minutes ?? null,
    fait_le: (l.fait_le as string | null) ?? null,
    fait_par: (l.fait_par as string | null) ?? null,
  };
}

// ── Les réglages ──────────────────────────────────────────────────────────

export async function lireReglagesPrestations(): Promise<ReglagesPrestations> {
  const { data } = await supabaseAdmin
    .from("parametres")
    .select("cle, valeur")
    .in("cle", Object.values(CLES_REGLAGES));
  return reglagesDepuisParametres((data ?? []) as { cle: string; valeur: string }[]);
}

// ── La génération, sur sa fenêtre glissante ───────────────────────────────

export type ResultatGeneration = { crees: number; supprimees: number; preservees: number };

/**
 * Régénère les tâches d'UN abonnement sur les quatorze jours à venir.
 *
 * Idempotente : la relancer ne duplique rien, ne touche à aucune tâche déjà
 * faite, et ne ressuscite aucune tâche annulée. C'est la contrainte unique en
 * base qui le garantit en dernier ressort, pas la prudence de ce code.
 */
export async function regenererAbonnement(
  abonnementId: string,
  jour: string
): Promise<ResultatGeneration> {
  const { debut, fin } = fenetreGlissante(jour);

  const { data: abo } = await supabaseAdmin
    .from("abonnements_prestations")
    .select("id, client_id, formule_id, date_debut, date_fin, statut, jours_personnalises")
    .eq("id", abonnementId)
    .maybeSingle();
  if (!abo) return { crees: 0, supprimees: 0, preservees: 0 };

  const [{ data: lignes }, { data: fiche }, { data: existantes }] = await Promise.all([
    supabaseAdmin
      .from("formules_lignes")
      .select("prestation_id, quantite_par_semaine, jours, prestations (prix, taux_tva, motif_tva, unite)")
      .eq("formule_id", abo.formule_id)
      .order("ordre"),
    supabaseAdmin
      .from("clients")
      .select("id, box_loue, chiens (id, actif)")
      .eq("id", abo.client_id)
      .maybeSingle(),
    supabaseAdmin
      .from("taches_prestations")
      .select("id, date, prestation_id, rang, statut")
      .eq("abonnement_id", abonnementId)
      .gte("date", debut)
      .lte("date", fin),
  ]);

  const attendues = tachesAttendues({
    lignes: ((lignes ?? []) as unknown as LigneFormule[]),
    joursPersonnalises: (abo.jours_personnalises ?? null) as JoursPersonnalises | null,
    debut,
    fin,
    abonnementDebut: String(abo.date_debut),
    abonnementFin: (abo.date_fin as string | null) ?? null,
    statut: String(abo.statut),
  });

  const plan = planRegeneration({
    attendues,
    existantes: ((existantes ?? []) as unknown as TacheExistante[]),
  });

  if (plan.aSupprimer.length > 0) {
    await supabaseAdmin.from("taches_prestations").delete().in("id", plan.aSupprimer);
  }

  if (plan.aCreer.length > 0) {
    // Une tâche de forfait n'est PAS facturée séparément : elle est déjà
    // comprise dans le prix mensuel. Son prix figé reste à zéro.
    const parPrestation = new Map(
      ((lignes ?? []) as unknown as {
        prestation_id: string;
        prestations?: { taux_tva?: number; motif_tva?: string | null } | null;
      }[]).map((l) => [l.prestation_id, l.prestations ?? null])
    );
    // Le chien du locataire, quand il n'en a qu'un : l'écran des tâches le
    // nomme, et « — » n'aide personne devant un box. À plusieurs chiens, on
    // n'en désigne aucun plutôt que d'en désigner un au hasard.
    const chiensActifs = ((fiche?.chiens ?? []) as unknown as {
      id: string;
      actif?: boolean | null;
    }[]).filter((c) => c.actif !== false);
    const chienUnique = chiensActifs.length === 1 ? chiensActifs[0].id : null;

    await supabaseAdmin.from("taches_prestations").insert(
      plan.aCreer.map((t) => ({
        date: t.date,
        client_id: abo.client_id,
        chien_id: chienUnique,
        box: fiche?.box_loue ?? null,
        prestation_id: t.prestation_id,
        rang: t.rang,
        origine: "forfait",
        abonnement_id: abonnementId,
        facturable: false,
        prix_fige: 0,
        taux_tva: Number(parPrestation.get(t.prestation_id)?.taux_tva ?? 8.1),
        motif_tva: parPrestation.get(t.prestation_id)?.motif_tva ?? null,
      }))
    );
  }

  return {
    crees: plan.aCreer.length,
    supprimees: plan.aSupprimer.length,
    preservees: plan.preservees.length,
  };
}

/** Régénère tous les abonnements actifs. Appelée à l'ouverture des écrans. */
export async function regenererTous(jour: string): Promise<ResultatGeneration> {
  const { data: actifs } = await supabaseAdmin
    .from("abonnements_prestations")
    .select("id")
    .eq("statut", "actif");

  const total = { crees: 0, supprimees: 0, preservees: 0 };
  for (const a of (actifs ?? []) as { id: string }[]) {
    const r = await regenererAbonnement(a.id, jour);
    total.crees += r.crees;
    total.supprimees += r.supprimees;
    total.preservees += r.preservees;
  }
  return total;
}

// ── Les lectures ──────────────────────────────────────────────────────────

export async function tachesEntre(debut: string, fin: string): Promise<TacheDuJour[]> {
  const { data } = await supabaseAdmin
    .from("taches_prestations")
    .select(SELECT_TACHE)
    .gte("date", debut)
    .lte("date", fin)
    .order("date")
    .order("heure_prevue", { ascending: true, nullsFirst: false });
  return ((data ?? []) as unknown as LigneBrute[]).map(versTache);
}

export async function tachesDuJour(jour: string): Promise<TacheDuJour[]> {
  return tachesEntre(jour, jour);
}

export async function tachesDuClient(
  clientId: string,
  debut: string,
  fin: string
): Promise<TacheDuJour[]> {
  const { data } = await supabaseAdmin
    .from("taches_prestations")
    .select(SELECT_TACHE)
    .eq("client_id", clientId)
    .gte("date", debut)
    .lte("date", fin)
    .order("date")
    .order("heure_prevue", { ascending: true, nullsFirst: false });
  return ((data ?? []) as unknown as LigneBrute[]).map(versTache);
}

export type Locataire = {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  box_loue: string | null;
  loyer_refacture: number | null;
  locataire_depuis: string | null;
  locataire_jusqu_au: string | null;
};

export async function listeLocataires(): Promise<Locataire[]> {
  const { data } = await supabaseAdmin
    .from("clients")
    .select("id, prenom, nom, email, box_loue, loyer_refacture, locataire_depuis, locataire_jusqu_au")
    .eq("locataire_box", true)
    .order("nom");
  return ((data ?? []) as unknown as Locataire[]).map((l) => ({
    ...l,
    loyer_refacture: l.loyer_refacture === null ? null : Number(l.loyer_refacture),
  }));
}

/**
 * La fiche d'un locataire, ou null s'il n'en est pas un.
 *
 * Le null n'est pas une commodité d'affichage : c'est la porte. L'appelant
 * s'arrête là, et rien du catalogue ne part dans sa réponse.
 */
export async function ficheLocataire(clientId: string) {
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, prenom, nom, email, adresse, locataire_box, box_loue, loyer_refacture, locataire_depuis, locataire_jusqu_au")
    .eq("id", clientId)
    .maybeSingle();
  if (!client || !catalogueVisible(client)) return null;

  const { data: abo } = await supabaseAdmin
    .from("abonnements_prestations")
    .select("id, formule_id, date_debut, date_fin, statut, prix_mensuel_fige, jours_personnalises, formules (nom, prix_mensuel)")
    .eq("client_id", clientId)
    .eq("statut", "actif")
    .order("date_debut", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { client, abonnement: abo ?? null };
}

/**
 * Le loyer réellement payé à la propriétaire sur un mois, lu dans les dépenses.
 *
 * Il s'affiche À CÔTÉ du montant refacturé, jamais à sa place : les deux
 * peuvent différer — frais, arrondi, décision commerciale — et c'est justement
 * l'écart qu'il faut pouvoir voir sans le chercher.
 */
export async function loyerPayeDuMois(
  boxLoue: string | null,
  debut: string,
  fin: string
): Promise<number> {
  if (!boxLoue) return 0;
  const { data } = await supabaseAdmin
    .from("depenses")
    .select("montant, libelle, compte_charge, date_depense")
    .eq("compte_charge", "6000")
    .gte("date_depense", debut)
    .lte("date_depense", fin);
  const cible = boxLoue.trim().toLowerCase();
  return ((data ?? []) as { montant: number | string; libelle?: string | null }[])
    .filter((d) => String(d.libelle ?? "").toLowerCase().includes(cible))
    .reduce((s, d) => s + Number(d.montant ?? 0), 0);
}

/**
 * Une garde en cours sur ce chien, s'il y en a une.
 *
 * Elle BLOQUE les demandes concurrentes : on ne prend pas deux fois en charge
 * le même chien sur les mêmes jours, et surtout on ne laisse pas croire à
 * l'équipe qu'un chien est libre quand il est sous sa responsabilité.
 */
export async function gardeQuiChevauche(
  chienId: string,
  debut: string,
  fin: string
): Promise<{ groupe_id: string | null; date: string } | null> {
  const { data } = await supabaseAdmin
    .from("taches_prestations")
    .select("groupe_id, date")
    .eq("chien_id", chienId)
    .eq("garde", true)
    .neq("statut", "annulee")
    .gte("date", debut)
    .lte("date", fin)
    .order("date")
    .limit(1);
  const l = (data ?? [])[0] as { groupe_id: string | null; date: string } | undefined;
  return l ?? null;
}
