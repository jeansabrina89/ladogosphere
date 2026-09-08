"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { aujourdhuiISO } from "@/src/lib/dates";
import { estMembreActif } from "@/src/lib/membre";
import { synchroniserComptaFacture } from "@/src/lib/comptaFacture";
import { finaliserEmission } from "@/src/lib/factureDocument";
import { envoyerEmailCommandeConfirmee } from "@/src/lib/email";
import {
  articleEnLigne,
  lignesPanier,
  lireCommande,
  lireParametresEnLigne,
  panierDuClient,
  reservationsAVenir,
} from "@/src/lib/venteEnLigne";
import {
  adresseComplete,
  estCommandable,
  optionRemise,
  refusConfirmation,
  totalCommande,
  type Adresse,
  type ModePaiement,
  type ModeRemise,
} from "@/src/lib/venteEnLigneLogique";
import {
  figerChoix,
  prixTotal,
  delaiTotal,
  datePromise,
  refusConfigurationAvecDependances,
  type ChoixParGroupe,
} from "@/src/lib/personnalisationLogique";
import { lireCatalogueOptions } from "@/src/lib/personnalisation";
import { articlesVendables } from "@/src/lib/vitrine";
import { contextePrix, prixDe } from "@/src/lib/prix";
import { remiseLigne as remiseLigneFigee } from "@/src/lib/prixLogique";
import { etiquetteLigneTva, ventilerPanier } from "@/src/lib/tvaLogique";
import { assujettieALaDate } from "@/src/lib/tva";
import {
  messageRecalcul,
  recalculerPanier,
  type LigneAValider,
} from "@/src/lib/panierLocalLogique";

/**
 * Le panier et la commande, côté client.
 *
 * Tout part de la SESSION : le client_id n'est jamais fourni par le
 * formulaire. Tout renvoie son refus plutôt que de le lancer — une exception
 * d'action serveur est masquée en production.
 *
 * Aucune écriture comptable ici : la vente n'est créée qu'à la remise, par le
 * moteur d'APP 11.
 */

export type Retour = {
  error?: string;
  message?: string;
  id?: string;
  numero?: string;
  /** Vrai quand le panier a changé sous les yeux du client : il faut le relire. */
  recalcule?: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** La fiche client de la session. Sans elle, on ne fait rien. */
async function moi(): Promise<{ id: string; email: string | null; prenom: string | null } | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("clients").select("id, email, prenom").eq("auth_user_id", user.id).maybeSingle();
  return (data as { id: string; email: string | null; prenom: string | null } | null) ?? null;
}

function rafraichir() {
  revalidatePath("/catalogue");
  revalidatePath("/catalogue/panier");
  revalidatePath("/mon-compte/commandes");
}

// ── Le panier ──────────────────────────────────────────────────────────────

export async function ajouterAuPanier(articleId: string, quantite = 1): Promise<Retour> {
  const client = await moi();
  if (!client) return { error: "Connectez-vous pour commander." };

  const article = await articleEnLigne(articleId);
  if (!article) return { error: "Cet article n'est plus proposé." };
  if (article.type_article === "personnalisable") {
    return { error: "Cet article se configure avant d'être ajouté." };
  }

  const q = Math.max(Math.round(Number(quantite) || 1), 1);
  const panier = await panierDuClient(client.id, true);
  if (!panier) return { error: "Le panier n'a pas pu être ouvert." };

  const { data: existante } = await supabaseAdmin
    .from("commandes_lignes")
    .select("id, quantite")
    .eq("commande_id", panier.id)
    .eq("article_id", articleId)
    .is("commande_personnalisee_id", null)
    .is("configuration", null)
    .maybeSingle();

  const voulue = Number(existante?.quantite ?? 0) + q;
  if (!estCommandable(article.stock_disponible, article.type_article)) {
    return { error: `« ${article.nom} » est épuisé.` };
  }
  if (voulue > article.stock_disponible) {
    return {
      error: `Il ne reste que ${article.stock_disponible} « ${article.nom} » : impossible d'en mettre ${voulue} au panier.`,
    };
  }

  // Le prix vient de la fonction unique : rubriques en cours et remise membre
  // y sont arbitrées d'un seul endroit. Il sera relu à la validation — un
  // panier peut dormir trois semaines — mais il est juste dès maintenant.
  const ctx = await contextePrix();
  const membre = await estMembreActif(supabaseAdmin, client.id);
  const applicable = prixDe(ctx, article, { estMembre: membre });
  const remise = remiseLigneFigee(applicable);
  const prix = applicable.prixFinal;

  if (existante) {
    await supabaseAdmin
      .from("commandes_lignes")
      .update({
        quantite: voulue,
        prix_unitaire: prix,
        montant: r2(voulue * prix),
        prix_base: remise?.prix_base ?? null,
        remise_pourcentage: remise?.remise_pourcentage ?? null,
        remise_origine: remise?.remise_origine ?? null,
        remise_libelle: remise?.remise_libelle ?? null,
      })
      .eq("id", existante.id);
  } else {
    await supabaseAdmin.from("commandes_lignes").insert({
      commande_id: panier.id,
      article_id: articleId,
      libelle: article.nom,
      quantite: q,
      prix_unitaire: prix,
      taux_tva: Number(article.taux_tva),
      secteur_tdfn: article.secteur_tdfn ?? "commerce",
      montant: r2(q * prix),
      prix_base: remise?.prix_base ?? null,
      remise_pourcentage: remise?.remise_pourcentage ?? null,
      remise_origine: remise?.remise_origine ?? null,
      remise_libelle: remise?.remise_libelle ?? null,
    });
  }

  rafraichir();
  return { message: `« ${article.nom} » ajouté au panier.` };
}

/**
 * Un article configuré rejoint le panier avec ses choix figés. La commande
 * d'atelier, elle, n'est créée qu'à la confirmation : rien ne doit apparaître
 * en fabrication tant que le client n'a pas validé.
 */
export async function ajouterConfigurationAuPanier(
  articleId: string,
  choix: ChoixParGroupe
): Promise<Retour> {
  const client = await moi();
  if (!client) return { error: "Connectez-vous pour commander." };

  const article = await articleEnLigne(articleId);
  if (!article || article.type_article !== "personnalisable") {
    return { error: "Cet article ne se configure pas." };
  }

  const { groupes, dependances } = await lireCatalogueOptions(articleId);
  const refus = refusConfigurationAvecDependances(groupes, choix, dependances);
  if (refus) return { error: refus };

  const prix = prixTotal(article.prix_vente, groupes, choix, dependances);
  const figes = figerChoix(groupes, choix, dependances);

  const panier = await panierDuClient(client.id, true);
  if (!panier) return { error: "Le panier n'a pas pu être ouvert." };

  const { error } = await supabaseAdmin.from("commandes_lignes").insert({
    commande_id: panier.id,
    article_id: articleId,
    libelle: `${article.nom} — sur mesure`,
    quantite: 1,
    prix_unitaire: prix,
    taux_tva: Number(article.taux_tva),
    secteur_tdfn: article.secteur_tdfn ?? "commerce",
    montant: prix,
    configuration: figes,
  });
  if (error) return { error: "Votre configuration n'a pas pu être ajoutée au panier." };

  rafraichir();
  return { message: "Votre configuration est dans le panier." };
}

export async function changerQuantite(ligneId: string, quantite: number): Promise<Retour> {
  const client = await moi();
  if (!client) return { error: "Connectez-vous pour commander." };

  const ligne = await ligneDeMonPanier(client.id, ligneId);
  if (!ligne) return { error: "Cette ligne n'est plus dans votre panier." };

  const q = Math.round(Number(quantite) || 0);
  if (q <= 0) return retirerDuPanier(ligneId);

  // Une configuration est unique : elle ne se multiplie pas, elle se refait.
  if (ligne.configuration || ligne.commande_personnalisee_id) {
    return { error: "Un article sur mesure se commande à l'unité : configurez-en un second." };
  }

  const article = await articleEnLigne(ligne.article_id);
  if (!article) return { error: "Cet article n'est plus proposé." };
  if (q > article.stock_disponible) {
    return { error: `Il ne reste que ${article.stock_disponible} « ${article.nom} ».` };
  }

  await supabaseAdmin
    .from("commandes_lignes")
    .update({ quantite: q, montant: r2(q * Number(ligne.prix_unitaire)) })
    .eq("id", ligneId);

  rafraichir();
  return {};
}

export async function retirerDuPanier(ligneId: string): Promise<Retour> {
  const client = await moi();
  if (!client) return { error: "Connectez-vous pour commander." };

  const ligne = await ligneDeMonPanier(client.id, ligneId);
  if (!ligne) return { error: "Cette ligne n'est plus dans votre panier." };

  await supabaseAdmin.from("commandes_lignes").delete().eq("id", ligneId);
  rafraichir();
  return { message: "Article retiré du panier." };
}

/** Une ligne du panier DE CE CLIENT — jamais celle d'un autre. */
async function ligneDeMonPanier(clientId: string, ligneId: string) {
  const panier = await panierDuClient(clientId);
  if (!panier) return null;
  const { data } = await supabaseAdmin
    .from("commandes_lignes")
    .select("id, article_id, prix_unitaire, quantite, configuration, commande_personnalisee_id")
    .eq("id", ligneId)
    .eq("commande_id", panier.id)
    .maybeSingle();
  return data as {
    id: string; article_id: string; prix_unitaire: number | string; quantite: number | string;
    configuration: unknown; commande_personnalisee_id: string | null;
  } | null;
}

// ── La confirmation ────────────────────────────────────────────────────────

export type EntreeConfirmation = {
  mode_remise: ModeRemise;
  reservation_id?: string | null;
  adresse?: Partial<Adresse> | null;
  mode_paiement: ModePaiement;
  cle_idempotence: string;
};

/**
 * Confirmation de la commande.
 *
 * Le stock est REVÉRIFIÉ dans la transaction par confirmer_commande : entre la
 * mise au panier et ce clic, quelqu'un a pu acheter le dernier au comptoir.
 * L'idempotence est portée par la même RPC : un double clic ne crée pas deux
 * commandes.
 */
export async function confirmerCommande(entree: EntreeConfirmation): Promise<Retour> {
  const client = await moi();
  if (!client) return { error: "Connectez-vous pour commander." };

  const panier = await panierDuClient(client.id);
  if (!panier) return { error: "Votre panier est vide." };

  // Un panier peut dormir trois semaines. On relit les prix D'AUJOURD'HUI
  // avant tout le reste : jamais de validation silencieuse à un autre prix.
  const bouge = await recalculerAvantValidation(panier.id, client.id);
  if (bouge) {
    rafraichir();
    return { error: bouge, recalcule: true };
  }

  // Les lignes portent déjà leur prix remisé et l'origine de leur remise : le
  // recalcul ci-dessus vient de les y écrire.
  const [lignes, params, resas] = await Promise.all([
    lignesPanier(panier.id),
    lireParametresEnLigne(),
    reservationsAVenir(client.id, aujourdhuiISO()),
  ]);

  const contexte = {
    lignes,
    reservationAVenir: resas.length > 0,
    grillePort: params.grillePort,
    poidsMaxGrammes: params.poidsMaxGrammes,
  };

  const refus = refusConfirmation({
    lignes,
    mode: entree.mode_remise,
    contexte,
    modePaiement: entree.mode_paiement,
    adresseComplete: entree.mode_remise === "postal" ? adresseComplete(entree.adresse) : true,
  });
  if (refus) return { error: refus };

  if (entree.mode_paiement === "en_ligne") {
    return { error: "Le paiement en ligne n'est pas encore disponible." };
  }

  // Le séjour rattaché doit être un des siens : on ne prend pas l'identifiant
  // du formulaire pour argent comptant.
  let reservationId: string | null = null;
  if (entree.mode_remise === "depart_chien") {
    const voulue = resas.find((r) => r.id === entree.reservation_id) ?? resas[0];
    if (!voulue) return { error: "Aucun séjour à venir : choisissez le retrait à la pension." };
    reservationId = voulue.id;
  }

  const option = optionRemise(contexte, entree.mode_remise);
  const total = totalCommande({ lignes, fraisPort: option.frais });

  // Les articles configurés deviennent des commandes d'atelier, maintenant.
  const erreurAtelier = await creerCommandesAtelier(panier.id, client.id);
  if (erreurAtelier) return { error: erreurAtelier };

  const { data, error } = await supabaseAdmin.rpc("confirmer_commande", {
    p_commande_id: panier.id,
    p_mode_remise: entree.mode_remise,
    p_reservation_id: reservationId,
    p_adresse: entree.mode_remise === "postal" ? entree.adresse ?? null : null,
    p_frais_port: total.port,
    p_remise_membre: total.remise,
    p_montant_total: total.aPayer,
    p_mode_paiement: entree.mode_paiement,
    p_cle_idempotence: entree.cle_idempotence,
    p_user_id: null,
  });
  if (error) return { error: messageConfirmation(error.message) };

  const res = data as { id: string; numero: string; deja: boolean };
  if (res.deja) {
    rafraichir();
    return { id: res.id, numero: res.numero, message: "Cette commande était déjà enregistrée." };
  }

  if (entree.mode_paiement === "facture") {
    const facture = await emettreFactureCommande(res.id, client.id, total.aPayer);
    if (facture.error) {
      // La commande tient : c'est la facture qui a manqué, et on le dit.
      rafraichir();
      return {
        id: res.id, numero: res.numero,
        message: `Commande ${res.numero} enregistrée. ${facture.error}`,
      };
    }
  }

  await envoyerEmailCommandeConfirmee(res.id).catch(() => {});

  rafraichir();
  return { id: res.id, numero: res.numero, message: `Commande ${res.numero} confirmée.` };
}

/**
 * Relire les prix du panier, juste avant de valider.
 *
 * Le prix facturé est celui de la BASE, aujourd'hui. Si un article a changé de
 * tarif ou n'est plus proposé, on corrige le panier et on renvoie la phrase à
 * montrer : le client revalide en connaissance de cause. Un article devenu
 * indisponible ne bloque pas la commande — il en sort, le reste passe.
 *
 * Le sur-mesure garde le prix figé de sa configuration : il dépend des choix
 * faits, pas du seul tarif de base.
 *
 * Retourne null quand rien n'a bougé — le cas ordinaire.
 */
async function recalculerAvantValidation(
  panierId: string,
  clientId: string
): Promise<string | null> {
  const { data: brutes } = await supabaseAdmin
    .from("commandes_lignes")
    .select("id, article_id, libelle, quantite, prix_unitaire, configuration")
    .eq("commande_id", panierId);

  const lignes: LigneAValider[] = ((brutes ?? []) as unknown as {
    id: string; article_id: string; libelle: string;
    quantite: number | string; prix_unitaire: number | string; configuration: unknown[] | null;
  }[]).map((l) => ({
    id: l.id,
    article_id: l.article_id,
    libelle: l.libelle,
    quantite: Number(l.quantite),
    prix_unitaire: Number(l.prix_unitaire),
    configuration: l.configuration,
  }));
  if (lignes.length === 0) return null;

  // La vitrine décide de ce qui est encore proposé : ce qui n'y est plus n'est
  // plus vendable, quelle qu'en soit la raison.
  const vendables = await articlesVendables(lignes.map((l) => l.article_id));
  const parId = new Map(vendables.map((a) => [a.id, a]));

  // Le prix D'AUJOURD'HUI, c'est celui de la fonction unique : une action qui a
  // commencé ou pris fin pendant que le panier dormait s'applique ici, et se
  // fige à la confirmation.
  const [ctx, membre] = await Promise.all([
    contextePrix(),
    estMembreActif(supabaseAdmin, clientId),
  ]);

  const recalcul = recalculerPanier(
    lignes,
    lignes.map((l) => {
      const a = parId.get(l.article_id);
      if (!a) return { id: l.article_id, nom: l.libelle, prix_vente: 0, disponible: false };
      const applicable = prixDe(ctx, a, { estMembre: membre });
      return {
        id: l.article_id,
        nom: a.nom,
        prix_vente: applicable.prixFinal,
        disponible: true,
        remise: remiseLigneFigee(applicable),
      };
    })
  );

  // Le panier est mis à jour AVANT de répondre : la page qui se rafraîchit
  // montre déjà les prix corrigés et le panier allégé. La remise se réécrit
  // même quand le prix ne bouge pas — son origine a pu changer.
  for (const l of recalcul.lignes) {
    await supabaseAdmin
      .from("commandes_lignes")
      .update({
        prix_unitaire: l.prix_actuel,
        montant: r2(l.quantite * l.prix_actuel),
        prix_base: l.remise?.prix_base ?? null,
        remise_pourcentage: l.remise?.remise_pourcentage ?? null,
        remise_origine: l.remise?.remise_origine ?? null,
        remise_libelle: l.remise?.remise_libelle ?? null,
      })
      .eq("id", l.id);
  }
  if (!recalcul.aSignaler) return null;

  const sortis = lignes
    .filter((l) => !recalcul.lignes.some((r) => r.id === l.id))
    .map((l) => l.id);
  if (sortis.length > 0) {
    await supabaseAdmin.from("commandes_lignes").delete().in("id", sortis);
  }

  return messageRecalcul(recalcul);
}

/** Le refus du RPC est déjà écrit en français : on le laisse passer. */
function messageConfirmation(message: string): string {
  const m = message ?? "";
  if (/n'est plus disponible|panier est vide|déjà été enregistrée/.test(m)) return m;
  return "Votre commande n'a pas pu être confirmée. Réessayez dans un instant.";
}

/**
 * Chaque ligne configurée devient une commande d'atelier d'APP 12, sans vente :
 * l'encaissement viendra à la remise, ou par la facture.
 */
async function creerCommandesAtelier(panierId: string, clientId: string): Promise<string | null> {
  const { data: lignes } = await supabaseAdmin
    .from("commandes_lignes")
    .select("id, article_id, prix_unitaire, configuration")
    .eq("commande_id", panierId)
    .not("configuration", "is", null)
    .is("commande_personnalisee_id", null);

  const aFaire = (lignes ?? []) as unknown as {
    id: string; article_id: string; prix_unitaire: number | string; configuration: unknown[];
  }[];
  if (aFaire.length === 0) return null;

  for (const l of aFaire) {
    const { groupes } = await lireCatalogueOptions(l.article_id);
    const { data: article } = await supabaseAdmin
      .from("articles").select("delai_fabrication_jours").eq("id", l.article_id).maybeSingle();

    const delai = delaiTotal(article?.delai_fabrication_jours ?? 0, groupes, {});
    const { data, error } = await supabaseAdmin.rpc("creer_commande_sur_mesure", {
      p_cle_idempotence: `web-${l.id}`,
      p_client_id: clientId,
      p_article_id: l.article_id,
      p_choix: l.configuration,
      p_prix: Number(l.prix_unitaire),
      p_delai: delai,
      p_date_promise: datePromise(aujourdhuiISO(), delai),
      p_notes: "Commande passée en ligne.",
      p_user_id: null,
      p_vente: null,
    });
    if (error) return "Votre article sur mesure n'a pas pu être enregistré en fabrication.";

    const res = data as { id: string };
    await supabaseAdmin
      .from("commandes_lignes")
      .update({ commande_personnalisee_id: res.id, configuration: null })
      .eq("id", l.id);
  }
  return null;
}

/**
 * Facture d'une commande en ligne : le moteur de factures fait tout, y compris
 * le bulletin QR et l'envoi. On ne fabrique rien à côté.
 */
async function emettreFactureCommande(
  commandeId: string,
  clientId: string,
  total: number
): Promise<{ error?: string }> {
  const { data: client } = await supabaseAdmin
    .from("clients").select("adresse").eq("id", clientId).maybeSingle();
  if (!(client?.adresse ?? "").trim()) {
    return { error: "Votre adresse manque à votre fiche : la facture vous sera envoyée dès qu'elle sera complétée." };
  }

  const commande = await lireCommande(commandeId);
  const { data: lignes } = await supabaseAdmin
    .from("commandes_lignes")
    .select(
      "libelle, quantite, prix_unitaire, taux_tva, secteur_tdfn, montant, " +
      "prix_base, remise_pourcentage, remise_origine, remise_libelle"
    )
    .eq("commande_id", commandeId)
    .order("created_at");

  const { data: facture, error } = await supabaseAdmin
    .from("factures")
    .insert({
      client_id: clientId,
      type: "libre",
      type_facture: "service",
      date_facture: aujourdhuiISO(),
      statut: "brouillon",
    })
    .select("id").single();
  if (error || !facture) return { error: "La facture n'a pas pu être créée." };

  const lignesBrutes = ((lignes ?? []) as unknown as {
    libelle: string; quantite: number | string; prix_unitaire: number | string;
    taux_tva: number | string; secteur_tdfn: string | null; montant: number | string;
    prix_base: number | string | null; remise_pourcentage: number | string | null;
    remise_origine: string | null; remise_libelle: string | null;
  }[]);

  // Une entreprise NON assujettie n'émet aucune trace de taux : ni en pied de
  // facture, ni dans un libellé, ni dans la colonne. Le taux tombe à zéro ici,
  // une fois pour toutes — c'est le taux qui s'appliquait vraiment ce jour-là.
  const dateFacture = aujourdhuiISO();
  const avecTva = await assujettieALaDate(dateFacture);
  const lignesCommande = lignesBrutes.map((l) => ({
    ...l,
    taux_tva: avecTva ? Number(l.taux_tva ?? 0) : 0,
  }));

  let ordre = 0;
  const aInserer: Record<string, unknown>[] = lignesCommande.map((l) => ({
    facture_id: facture.id, ordre: ++ordre, libelle: l.libelle,
    quantite: Number(l.quantite), prix_unitaire: Number(l.prix_unitaire),
    compte_produit: "3200",
    taux_tva: l.taux_tva,
    secteur_tdfn: l.secteur_tdfn ?? "commerce",
    // La remise de ligne voyage avec sa ligne : elle a déjà diminué la base au
    // taux de CETTE ligne, elle ne passe pas par le prorata du panier.
    prix_base: l.prix_base,
    remise_pourcentage: l.remise_pourcentage,
    remise_origine: l.remise_origine,
    remise_libelle: l.remise_libelle,
  }));

  const port = Number(commande?.frais_port ?? 0);

  /*
   * Le PORT se répartit par taux, au prorata des montants hors taxe, par la
   * fonction unique de ventilation : il suit les marchandises qu'il transporte.
   *
   * Les REMISES, elles, ne passent plus par là depuis APP 16 : chacune a
   * diminué la base de sa propre ligne, au taux de cette ligne. Les deux
   * mécanismes cohabitent dans la même facture sans se marcher dessus — la
   * ventilation de pied reste juste parce qu'elle part des montants nets.
   */
  if (port > 0) {
    const ventilation = ventilerPanier({
      lignes: lignesCommande.map((l) => ({ montant: l.montant, taux_tva: l.taux_tva })),
      port,
      remise: 0,
    });

    // Le taux ne s'affiche dans le libellé que s'il y en a plusieurs à
    // distinguer, et jamais quand l'entreprise n'est pas assujettie : sur une
    // facture sans TVA, « Frais de port (TVA 8,1 %) » ressemblerait à une taxe
    // facturée. C'est précisément ce qu'il ne faut pas laisser croire.
    const nommerLeTaux = avecTva && ventilation.parts.filter((p) => p.ttc !== 0).length > 1;
    const suffixe = (taux: number) => (nommerLeTaux ? ` (${etiquetteLigneTva(taux)})` : "");

    for (const part of ventilation.parts) {
      if (part.port > 0) {
        aInserer.push({
          facture_id: facture.id, ordre: ++ordre,
          libelle: `Frais de port${suffixe(part.taux)}`,
          quantite: 1, prix_unitaire: part.port, compte_produit: "3200",
          taux_tva: part.taux, secteur_tdfn: "commerce",
        });
      }
    }
  }

  await supabaseAdmin.from("facture_lignes").insert(aInserer);
  await supabaseAdmin.from("factures").update({
    montant_total: total, montant_ttc: total, montant_ht: total, montant_restant: total,
  }).eq("id", facture.id);

  const { error: erreurEmission } = await supabaseAdmin.rpc("emettre_facture", {
    p_facture_id: facture.id, p_user_id: null,
  });
  if (erreurEmission) return { error: "La facture n'a pas pu être émise." };

  await synchroniserComptaFacture(facture.id, null);
  await supabaseAdmin.from("commandes").update({ facture_id: facture.id }).eq("id", commandeId);
  await finaliserEmission(facture.id, null);

  return {};
}
