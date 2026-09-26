import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { tracerEvenement } from "@/src/lib/journalEvenements";

/**
 * Ce qu'il faut commander chez les fournisseurs.
 *
 * Une cliente a payé un article que la pension n'avait pas : la ligne attend.
 * Cet écran est le seul endroit d'où part la commande au fournisseur, et c'est
 * lui qui fait tenir la promesse du délai.
 *
 * ── LA QUANTITÉ AFFICHÉE EST CELLE DE LA LIGNE ENTIÈRE ────────────────────
 *
 * Et non le manque. C'est la condition du risque accepté le 26.09.2026 (voir
 * `docs/SUIVI-AUDIT-2026-09-22.md`) : une ligne passée sur commande ne réserve
 * rien, donc l'unité déjà en rayon peut partir au comptoir avant la réception.
 * Sans conséquence — à condition que la commande au fournisseur couvre TOUTE la
 * ligne.
 *
 * Afficher « il en manque 2 » ferait commander 2 sacs, et c'est alors que la
 * vente au comptoir coûterait cher : la cliente qui attend depuis trois
 * semaines repartirait avec deux sacs sur trois. La quantité totale n'est donc
 * pas un arrondi de confort, c'est ce qui rend la décision sûre.
 */

export type LigneACommander = {
  ligneId: string;
  commandeId: string;
  /** Le numéro de la commande, pour retrouver la cliente. */
  numero: string | null;
  confirmeeLe: string | null;
  articleId: string;
  articleNom: string;
  reference: string | null;
  unite: string | null;
  /** La quantité de la LIGNE ENTIÈRE. Voir l'en-tête : jamais le manque. */
  quantite: number;
  delaiMinJours: number | null;
  delaiMaxJours: number | null;
  /** Ce qui est en rayon aujourd'hui, à titre d'information seulement. */
  stockActuel: number;
};

export type GroupeFournisseur = {
  fournisseurId: string | null;
  fournisseurNom: string;
  lignes: LigneACommander[];
};

type Brut = {
  id: string;
  commande_id: string;
  article_id: string;
  quantite: number | string;
  delai_commande_min_jours: number | null;
  delai_commande_max_jours: number | null;
  commandes: { numero: string | null; confirmee_le: string | null; statut: string } | null;
  articles: {
    nom: string; reference: string | null; unite: string | null;
    stock_actuel: number | string; fournisseur_id: string | null;
  } | null;
};

/**
 * Les lignes qui attendent, groupées par fournisseur.
 *
 * Le groupement est celui du GESTE : on passe une commande par fournisseur, pas
 * une par ligne. Les articles sans fournisseur au carnet forment leur propre
 * groupe plutôt que de disparaître — ce sont justement ceux qu'on risque
 * d'oublier.
 *
 * L'ordre, dans chaque groupe, est celui des dates de commande : la première
 * cliente qui a commandé est la première servie, et c'est le même ordre que
 * celui de `recevoir_marchandise` en base.
 */
export async function lignesACommander(): Promise<GroupeFournisseur[]> {
  const { data } = await supabaseAdmin
    .from("commandes_lignes")
    .select(`
      id, commande_id, article_id, quantite,
      delai_commande_min_jours, delai_commande_max_jours,
      commandes!inner ( numero, confirmee_le, statut ),
      articles!inner ( nom, reference, unite, stock_actuel, fournisseur_id )
    `)
    .eq("sur_commande", true)
    .is("commandee_au_fournisseur_le", null)
    .eq("commandes.statut", "confirmee");

  const lignes = (data ?? []) as unknown as Brut[];

  const fournisseurIds = [
    ...new Set(lignes.map((l) => l.articles?.fournisseur_id).filter((v): v is string => !!v)),
  ];
  const noms = new Map<string, string>();
  if (fournisseurIds.length > 0) {
    const { data: fs } = await supabaseAdmin
      .from("fournisseurs")
      .select("id, nom")
      .in("id", fournisseurIds);
    for (const f of fs ?? []) noms.set(f.id as string, f.nom as string);
  }

  const groupes = new Map<string, GroupeFournisseur>();
  for (const l of lignes) {
    const fid = l.articles?.fournisseur_id ?? null;
    const cle = fid ?? "";
    if (!groupes.has(cle)) {
      groupes.set(cle, {
        fournisseurId: fid,
        fournisseurNom: fid ? (noms.get(fid) ?? "Fournisseur inconnu") : "Sans fournisseur au carnet",
        lignes: [],
      });
    }
    groupes.get(cle)!.lignes.push({
      ligneId: l.id,
      commandeId: l.commande_id,
      numero: l.commandes?.numero ?? null,
      confirmeeLe: l.commandes?.confirmee_le ?? null,
      articleId: l.article_id,
      articleNom: l.articles?.nom ?? "—",
      reference: l.articles?.reference ?? null,
      unite: l.articles?.unite ?? null,
      quantite: Number(l.quantite),
      delaiMinJours: l.delai_commande_min_jours,
      delaiMaxJours: l.delai_commande_max_jours,
      stockActuel: Number(l.articles?.stock_actuel ?? 0),
    });
  }

  for (const g of groupes.values()) {
    g.lignes.sort((a, b) => String(a.confirmeeLe ?? "").localeCompare(String(b.confirmeeLe ?? "")));
  }

  // Sans fournisseur en dernier : c'est ce qui reste à régler, pas ce qu'on
  // commande aujourd'hui.
  return [...groupes.values()].sort((a, b) => {
    if (!a.fournisseurId) return 1;
    if (!b.fournisseurId) return -1;
    return a.fournisseurNom.localeCompare(b.fournisseurNom, "fr");
  });
}

/**
 * Marquer des lignes comme commandées chez le fournisseur.
 *
 * Le geste est daté et journalisé : dans trois semaines, quand une cliente
 * demandera où en est sa commande, la réponse ne doit pas dépendre du souvenir
 * de quelqu'un.
 *
 * Le nombre de lignes touchées est RELU. Un UPDATE que RLS filtre ne renvoie
 * pas d'erreur : il touche zéro ligne et dit que tout va bien — la leçon des
 * lots 23-bis et 23-ter. Ici l'écriture passe par la clé de service, mais la
 * relecture reste la seule preuve que le geste a eu lieu, et elle empêche de
 * journaliser une commande qui n'a pas été enregistrée.
 */
export async function marquerCommandeAuFournisseur(
  ligneIds: readonly string[],
  userId: string | null
): Promise<{ touchees: number; error?: string }> {
  if (ligneIds.length === 0) return { touchees: 0, error: "Aucune ligne à marquer." };

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("commandes_lignes")
    .update({ commandee_au_fournisseur_le: aujourdhui })
    .in("id", ligneIds as string[])
    .eq("sur_commande", true)
    .is("commandee_au_fournisseur_le", null)
    .select("id, article_id, quantite, commande_id");

  if (error) return { touchees: 0, error: error.message };

  const touchees = (data ?? []).length;
  if (touchees === 0) {
    return { touchees: 0, error: "Ces lignes étaient déjà marquées, ou n'attendent plus." };
  }

  for (const l of data ?? []) {
    await tracerEvenement({
      entite: "article",
      entiteId: l.article_id as string,
      evenement: "commande_au_fournisseur",
      apres: {
        commande_id: l.commande_id,
        ligne_id: l.id,
        // La quantité commandée : celle de la LIGNE ENTIÈRE, comme l'écran l'affiche.
        quantite: Number(l.quantite),
        le: aujourdhui,
      },
      userId,
    });
  }

  return { touchees };
}
