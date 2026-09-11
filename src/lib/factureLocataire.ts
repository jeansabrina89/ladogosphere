import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { synchroniserComptaFacture } from "@/src/lib/comptaFacture";
import { finaliserEmission } from "@/src/lib/factureDocument";
import { tvaDeLaPrestation, tauxAFiger } from "@/src/lib/tva";
import { secteurParDefautCompte } from "@/src/lib/tvaLogique";
import { catalogueVisible } from "@/src/lib/prestationsLogique";
import {
  CODE_TVA_LOYER,
  bornesDuMois,
  factureMensuelleLocataire,
  libelleMois,
  type FactureMensuelle,
  type TacheAFacturer,
} from "@/src/lib/factureLocataireLogique";

/**
 * La facture mensuelle d'un locataire de box.
 *
 * Rien de neuf côté comptable : c'est le moteur existant qui numérote, produit
 * le PDF, le bulletin QR et l'e-mail, et c'est `synchroniserComptaFacture` qui
 * passe l'écriture. On se contente de composer les bonnes lignes — forfait,
 * actes, loyer refacturé — et de les lui donner.
 */

export type PropositionFacture = {
  clientId: string;
  client: string;
  mois: string;
  facture: FactureMensuelle;
  /** Ce qui manque pour pouvoir émettre. */
  blocage: string | null;
};

/**
 * Ce qu'un locataire doit pour un mois, sans rien écrire.
 *
 * C'est une PROPOSITION : l'écran la montre, Sabrina la relit, et rien ne part
 * tant qu'elle n'a pas cliqué.
 */
export async function proposerFactureMois(
  clientId: string,
  mois: string
): Promise<PropositionFacture | null> {
  const { debut, fin } = bornesDuMois(mois);

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, prenom, nom, adresse, locataire_box, loyer_refacture, locataire_depuis, locataire_jusqu_au, dernier_mois_loyer_facture")
    .eq("id", clientId)
    .maybeSingle();
  if (!client || !catalogueVisible(client)) return null;

  const [{ data: abo }, { data: taches }] = await Promise.all([
    supabaseAdmin
      .from("abonnements_prestations")
      .select("id, prix_mensuel_fige, statut, date_debut, date_fin, dernier_mois_facture, formules (nom)")
      .eq("client_id", clientId)
      .eq("statut", "actif")
      .lte("date_debut", fin)
      .order("date_debut", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("taches_prestations")
      .select("id, date, prestation_id, statut, facturable, prix_fige, taux_tva, motif_tva, motif_annulation, prestations (nom)")
      .eq("client_id", clientId)
      .is("facture_id", null)
      .gte("date", debut)
      .lte("date", fin),
  ]);

  // Le taux porté par la prestation passe par le MÊME filtre que tout le
  // reste : zéro tant que l’entreprise n’est pas assujettie. Mentionner une
  // TVA qu’on ne verse pas est une faute lourde, et un chiffre qui dort dans
  // une colonne finit toujours par ressortir dans un tableau.
  const aFacturer: TacheAFacturer[] = await Promise.all(
    ((taches ?? []) as unknown as (Record<string, unknown> & {
      prestations?: { nom?: string } | null;
    })[]).map(async (t) => ({
      id: String(t.id),
      prestation_id: String(t.prestation_id),
      nom: t.prestations?.nom ?? "Prestation",
      statut: String(t.statut),
      facturable: t.facturable === true,
      prix_fige: Number(t.prix_fige ?? 0),
      taux_tva: await tauxAFiger(fin, Number(t.taux_tva ?? 0)),
      motif_tva: (t.motif_tva as string | null) ?? null,
      motif_annulation: (t.motif_annulation as string | null) ?? null,
      date: String(t.date),
    }))
  );

  // Le taux du loyer refacturé vient de la catégorie « Loyer de box refacturé »,
  // 8,1 % par défaut. Il est à confirmer auprès de l'AFC : on ne le tranche pas
  // ici, on le rend modifiable là où se règlent tous les autres taux.
  const tvaLoyer = await tvaDeLaPrestation(CODE_TVA_LOYER, fin);
  const formule = (abo?.formules as unknown as { nom?: string } | null) ?? null;

  // Un forfait déjà facturé pour ce mois ne revient pas : il ne s’appuie sur
  // aucune tâche, donc rien d’autre ne l’en empêcherait.
  const forfaitDejaFacture = String(abo?.dernier_mois_facture ?? "") === mois;

  const facture = factureMensuelleLocataire({
    mois,
    forfait: abo && !forfaitDejaFacture
      ? {
          nom: formule?.nom ?? "Forfait",
          prix: Number(abo.prix_mensuel_fige ?? 0),
          // Le forfait suit la catégorie des prestations annexes.
          taux_tva: await tauxAFiger(fin, 8.1),
          motif_tva: null,
        }
      : null,
    taches: aFacturer,
    // Le loyer non plus ne s’appuie sur aucune tâche : son marqueur à lui.
    loyer: client.loyer_refacture && String(client.dernier_mois_loyer_facture ?? "") !== mois
      ? {
          montant: Number(client.loyer_refacture),
          taux_tva: tvaLoyer.taux,
          motif_tva: tvaLoyer.motif,
          depuis: (client.locataire_depuis as string | null) ?? null,
          jusquAu: (client.locataire_jusqu_au as string | null) ?? null,
        }
      : null,
  });

  const nom = `${client.prenom ?? ""} ${client.nom ?? ""}`.trim() || "—";
  let blocage: string | null = null;
  if (facture.lignes.length === 0) blocage = "Rien à facturer ce mois-ci.";
  else if (!(client.adresse ?? "").trim()) {
    blocage = "Ce locataire n'a pas d'adresse : complétez sa fiche avant de facturer.";
  }

  return { clientId, client: nom, mois, facture, blocage };
}

/**
 * Émet la facture du mois. Le moteur existant fait tout le reste.
 *
 * Les tâches reprises portent désormais l'identifiant de la facture : elles ne
 * repartiront pas le mois suivant, et c'est cette marque — pas une date — qui
 * empêche de facturer deux fois.
 */
export async function emettreFactureMois({
  clientId,
  mois,
  dateFacture,
  userId,
  avecNotes,
}: {
  clientId: string;
  mois: string;
  dateFacture: string;
  userId?: string | null;
  avecNotes?: boolean;
}): Promise<{ error?: string; factureId?: string }> {
  const proposition = await proposerFactureMois(clientId, mois);
  if (!proposition) return { error: "Ce client n'est pas locataire de box." };
  if (proposition.blocage) return { error: proposition.blocage };

  const { data: facture, error } = await supabaseAdmin
    .from("factures")
    .insert({
      client_id: clientId,
      type: "libre",
      type_facture: "service",
      date_facture: dateFacture,
      statut: "brouillon",
      motif: avecNotes && proposition.facture.notes.length > 0
        ? proposition.facture.notes.join(" ")
        : null,
    })
    .select("id")
    .single();
  if (error || !facture) return { error: error?.message ?? "Création impossible." };

  let ordre = 0;
  await supabaseAdmin.from("facture_lignes").insert(
    proposition.facture.lignes.map((l) => ({
      facture_id: facture.id,
      ordre: ++ordre,
      libelle: l.libelle,
      quantite: l.quantite,
      prix_unitaire: l.prix_unitaire,
      compte_produit: l.compte_produit,
      taux_tva: l.taux_tva,
      motif_tva: l.motif_tva,
      secteur_tdfn: secteurParDefautCompte(l.compte_produit),
    }))
  );

  const { data: posees } = await supabaseAdmin
    .from("facture_lignes").select("montant").eq("facture_id", facture.id);
  const total = Math.round(
    (posees ?? []).reduce((s: number, l: { montant: number | string }) => s + Number(l.montant), 0) * 100
  ) / 100;
  await supabaseAdmin.from("factures").update({
    montant_total: total, montant_ttc: total, montant_ht: total, montant_restant: total,
  }).eq("id", facture.id);

  // Le forfait ne s'appuie sur aucune tâche : c'est cette marque, et elle
  // seule, qui l'empêche de repartir sur la facture du mois suivant.
  if (proposition.facture.lignes.some((l) => l.taches.length === 0 && l.compte_produit === "3020")) {
    await supabaseAdmin
      .from("abonnements_prestations")
      .update({ dernier_mois_facture: mois })
      .eq("client_id", clientId)
      .eq("statut", "actif");
  }

  if (proposition.facture.lignes.some((l) => l.compte_produit === "3021")) {
    await supabaseAdmin
      .from("clients")
      .update({ dernier_mois_loyer_facture: mois })
      .eq("id", clientId);
  }

  const idsTaches = proposition.facture.lignes.flatMap((l) => l.taches);
  if (idsTaches.length > 0) {
    await supabaseAdmin
      .from("taches_prestations")
      .update({ facture_id: facture.id })
      .in("id", idsTaches);
  }

  await tracerEvenement({
    entite: "facture",
    entiteId: facture.id,
    evenement: "creation",
    apres: { type: "prestations_locataire", mois, total, taches: idsTaches.length },
    userId: userId ?? null,
  });

  const { error: errEmission } = await supabaseAdmin.rpc("emettre_facture", {
    p_facture_id: facture.id, p_user_id: userId ?? null,
  });
  if (errEmission) return { error: errEmission.message };

  await synchroniserComptaFacture(facture.id, userId ?? null);
  await finaliserEmission(facture.id, userId ?? null);

  return { factureId: facture.id };
}

export { libelleMois };
