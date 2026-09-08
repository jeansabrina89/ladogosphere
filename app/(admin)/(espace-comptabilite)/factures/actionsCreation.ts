"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { synchroniserComptaFacture } from "@/src/lib/comptaFacture";
import { synchroniserComptaResa } from "@/src/lib/comptaResa";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import { genererPdfFacture, finaliserEmission } from "@/src/lib/factureDocument";
import { lignesDepuisReservation } from "@/src/lib/factureResa";
import { COMPTES_PRODUIT } from "@/src/lib/factureStatut";

const r2 = (n: number) => Math.round(n * 100) / 100;
const COMPTES = COMPTES_PRODUIT.map((c) => c.numero) as readonly string[];

export type LigneSaisie = {
  libelle: string;
  quantite: number;
  prix_unitaire: number;
  compte_produit: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// C — Avoir (note de crédit)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crée et émet un avoir sur une facture émise. Total ou partiel : les lignes
 * reprises portent la quantité choisie. Le motif est obligatoire — un avoir
 * sans raison n'a pas de valeur probante.
 */
export async function creerAvoir(formData: FormData): Promise<{ error?: string; avoirId?: string; numero?: string }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return { error: verif.error };

  const factureId = ((formData.get("facture_id") as string) || "").trim();
  const motif = ((formData.get("motif") as string) || "").trim();
  const destination = ((formData.get("destination") as string) || "credit").trim();
  let lignes: { ligne_id: string; quantite: number }[] = [];
  try {
    lignes = JSON.parse((formData.get("lignes") as string) || "[]");
  } catch {
    return { error: "Lignes illisibles." };
  }

  if (!factureId) return { error: "Facture introuvable." };
  if (!motif) return { error: "Le motif de l'avoir est obligatoire." };
  if (!["credit", "rembourser"].includes(destination)) return { error: "Destination invalide." };

  const { data: origine } = await supabaseAdmin
    .from("factures")
    .select("id, numero, type, client_id, statut, date_facture, montant_total, montant_paye")
    .eq("id", factureId)
    .maybeSingle();
  if (!origine) return { error: "Facture introuvable." };
  if (!origine.numero) return { error: "Un brouillon ne se corrige pas par un avoir : modifiez-le." };
  if (origine.type === "avoir") return { error: "On ne crée pas un avoir sur un avoir." };

  const { data: lignesOrigine } = await supabaseAdmin
    .from("facture_lignes")
    .select("id, libelle, quantite, prix_unitaire, montant, compte_produit, reservation_id, cotisation_id")
    .eq("facture_id", factureId)
    .order("ordre");

  type LigneOrigine = {
    id: string; libelle: string; quantite: number | string; prix_unitaire: number | string;
    compte_produit: string; reservation_id: string | null; cotisation_id: string | null;
  };

  const choisies = new Map(lignes.map((l) => [l.ligne_id, Number(l.quantite)]));
  const aReprendre = ((lignesOrigine ?? []) as LigneOrigine[])
    .map((l) => ({
      ...l,
      quantiteAvoir: Math.min(Math.max(choisies.get(l.id) ?? 0, 0), Number(l.quantite)),
    }))
    .filter((l) => l.quantiteAvoir > 0);

  if (aReprendre.length === 0) return { error: "Sélectionnez au moins une ligne à créditer." };

  // Un avoir ne peut pas dépasser ce qui reste à créditer sur la facture.
  const { data: avoirsExistants } = await supabaseAdmin
    .from("factures").select("montant_total").eq("facture_origine_id", factureId).not("numero", "is", null);
  const dejaCredite = r2((avoirsExistants ?? []).reduce(
    (s: number, a: { montant_total: number | string }) => s + Number(a.montant_total), 0));
  const montantAvoir = r2(aReprendre.reduce(
    (s, l) => s + l.quantiteAvoir * Number(l.prix_unitaire), 0));
  const creditable = r2(Number(origine.montant_total ?? 0) - dejaCredite);

  if (montantAvoir > creditable + 0.005) {
    return { error: `Cet avoir dépasse ce qui reste à créditer (CHF ${creditable.toFixed(2)}).` };
  }

  const { data: avoir, error: errCreation } = await supabaseAdmin
    .from("factures")
    .insert({
      client_id: origine.client_id,
      type: "avoir",
      type_facture: "service",
      facture_origine_id: factureId,
      date_facture: new Date().toISOString().split("T")[0],
      statut: "brouillon",
      motif,
    })
    .select("id")
    .single();
  if (errCreation || !avoir) return { error: errCreation?.message ?? "Création de l'avoir impossible." };

  await supabaseAdmin.from("facture_lignes").insert(
    aReprendre.map((l, i) => ({
      facture_id: avoir.id,
      ordre: i + 1,
      libelle: l.libelle,
      quantite: l.quantiteAvoir,
      prix_unitaire: Number(l.prix_unitaire),
      compte_produit: l.compte_produit,
      reservation_id: l.reservation_id ?? null,
      cotisation_id: l.cotisation_id ?? null,
    })),
  );

  // Un avoir efface d'abord ce qui restait DÛ ; seule la part déjà encaissée
  // peut devenir un crédit utilisable. Créditer un client qui n'a rien payé
  // lui donnerait un avoir tout en lui laissant sa dette.
  const resteOrigine = Math.max(
    r2(Number(origine.montant_total ?? 0) - Number(origine.montant_paye ?? 0) - dejaCredite), 0);
  const partSurDette = Math.min(montantAvoir, resteOrigine);
  const partCreditable = r2(montantAvoir - partSurDette);

  if (destination === "credit" && partCreditable > 0) {
    const { data: mvt } = await supabaseAdmin
      .from("avoirs_mouvements")
      .insert({
        client_id: origine.client_id,
        montant: partCreditable,
        type: "avoir_facture",
        motif: `Avoir sur facture ${origine.numero} : ${motif}`,
        facture_id: avoir.id,
        created_by: verif.userId ?? null,
      })
      .select("id")
      .single();
    // L'écriture du 2035 est portée par l'avoir lui-même : ce mouvement ne sert
    // qu'au solde du client, il ne passe pas d'écriture de son côté.
    if (!mvt) return { error: "Le solde d'avoir du client n'a pas pu être crédité." };
  }

  const { data: numero, error: errEmission } = await supabaseAdmin.rpc("emettre_facture", {
    p_facture_id: avoir.id,
    p_user_id: verif.userId ?? null,
  });
  if (errEmission) return { error: errEmission.message };

  await synchroniserComptaFacture(avoir.id, verif.userId ?? null);

  // Le reste dû de l'origine tombe de ce que l'avoir a effacé sur la dette.
  // Entièrement créditée, elle sort du poste « à encaisser ».
  const totalCredite = r2(dejaCredite + montantAvoir);
  const resteApres = Math.max(
    r2(Number(origine.montant_total ?? 0) - Number(origine.montant_paye ?? 0) - totalCredite), 0);

  if (totalCredite >= Number(origine.montant_total ?? 0) - 0.005) {
    await supabaseAdmin.from("factures")
      .update({ statut: "annulee_par_avoir", montant_restant: 0 })
      .eq("id", factureId);
  } else {
    await supabaseAdmin.from("factures")
      .update({ montant_restant: resteApres })
      .eq("id", factureId);
  }
  await synchroniserComptaFacture(factureId, verif.userId ?? null);

  await tracerEvenement({
    entite: "facture", entiteId: factureId, evenement: "avoir",
    apres: { avoir: numero, montant: montantAvoir, destination },
    motif, userId: verif.userId ?? null,
  });
  await tracerEvenement({
    entite: "avoir", entiteId: avoir.id, evenement: "creation",
    apres: { origine: origine.numero, montant: montantAvoir, destination },
    motif, userId: verif.userId ?? null,
  });

  await genererPdfFacture(avoir.id);

  revalidatePath("/factures");
  revalidatePath(`/factures/${factureId}`);
  return { avoirId: avoir.id, numero: (numero as string) ?? undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// B — Facture libre et facture d'acompte
// ─────────────────────────────────────────────────────────────────────────────

function lignesValides(brut: string): { lignes: LigneSaisie[]; error?: string } {
  let brutes: LigneSaisie[];
  try {
    brutes = JSON.parse(brut || "[]");
  } catch {
    return { lignes: [], error: "Lignes illisibles." };
  }

  const lignes: LigneSaisie[] = [];
  for (const l of brutes) {
    const libelle = String(l.libelle ?? "").trim();
    const quantite = Number(l.quantite);
    const prix = Number(l.prix_unitaire);
    const compte = String(l.compte_produit ?? "3000");
    if (libelle === "") continue;
    if (!Number.isFinite(quantite) || quantite <= 0) return { lignes: [], error: `Quantité invalide sur « ${libelle} ».` };
    if (!Number.isFinite(prix)) return { lignes: [], error: `Prix invalide sur « ${libelle} ».` };
    if (!COMPTES.includes(compte)) return { lignes: [], error: `Compte de produit inconnu sur « ${libelle} ».` };
    lignes.push({ libelle, quantite, prix_unitaire: r2(prix), compte_produit: compte });
  }
  if (lignes.length === 0) return { lignes: [], error: "Ajoutez au moins une ligne." };
  return { lignes };
}

/**
 * Facture libre : lignes saisies à la main, plus éventuellement des
 * réservations impayées reprises telles quelles. Remplace l'ancienne
 * « facture groupée ».
 */
export async function creerFactureLibre(formData: FormData): Promise<{ error?: string; factureId?: string }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return { error: verif.error };

  const clientId = ((formData.get("client_id") as string) || "").trim();
  const dateFacture = ((formData.get("date_facture") as string) || "").trim();
  const emettre = (formData.get("emettre") as string) === "1";
  const reservations = ((formData.get("reservations") as string) || "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  if (!clientId) return { error: "Choisissez un client." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFacture)) return { error: "Date de facture invalide." };

  const { data: client } = await supabaseAdmin
    .from("clients").select("id, adresse").eq("id", clientId).maybeSingle();
  if (!client) return { error: "Client introuvable." };
  if (!(client.adresse ?? "").trim()) {
    return { error: "Ce client n'a pas d'adresse : complétez sa fiche avant de facturer." };
  }

  const saisie = lignesValides((formData.get("lignes") as string) || "[]");
  // Sans ligne saisie, il faut au moins une réservation reprise.
  if (saisie.error && reservations.length === 0) return { error: saisie.error };

  const { data: facture, error } = await supabaseAdmin
    .from("factures")
    .insert({
      client_id: clientId,
      type: "libre",
      type_facture: "service",
      date_facture: dateFacture,
      statut: "brouillon",
    })
    .select("id")
    .single();
  if (error || !facture) return { error: error?.message ?? "Création impossible." };

  let ordre = 0;
  const aInserer: Record<string, unknown>[] = [];
  for (const l of saisie.lignes) {
    aInserer.push({
      facture_id: facture.id, ordre: ++ordre, libelle: l.libelle,
      quantite: l.quantite, prix_unitaire: l.prix_unitaire, compte_produit: l.compte_produit,
    });
  }
  for (const resaId of reservations) {
    for (const l of await lignesDepuisReservation(resaId)) {
      aInserer.push({
        facture_id: facture.id, ordre: ++ordre, libelle: l.libelle,
        quantite: l.quantite, prix_unitaire: l.prix_unitaire, compte_produit: l.compte_produit,
        reservation_id: l.reservation_id ?? null, cotisation_id: l.cotisation_id ?? null,
      });
    }
    await supabaseAdmin.from("facture_reservations").insert({
      facture_id: facture.id, reservation_id: resaId, montant: 0,
    });
  }

  if (aInserer.length === 0) {
    await supabaseAdmin.from("factures").delete().eq("id", facture.id);
    return { error: "Aucune ligne à facturer." };
  }
  await supabaseAdmin.from("facture_lignes").insert(aInserer);

  const { data: lignesPosees } = await supabaseAdmin
    .from("facture_lignes").select("montant").eq("facture_id", facture.id);
  const total = r2((lignesPosees ?? []).reduce(
    (s: number, l: { montant: number | string }) => s + Number(l.montant), 0));
  await supabaseAdmin.from("factures").update({
    montant_total: total, montant_ttc: total, montant_ht: total, montant_restant: total,
  }).eq("id", facture.id);

  await tracerEvenement({
    entite: "facture", entiteId: facture.id, evenement: "creation",
    apres: { type: "libre", total, reservations: reservations.length },
    userId: verif.userId ?? null,
  });

  if (emettre) {
    const { error: errEmission } = await supabaseAdmin.rpc("emettre_facture", {
      p_facture_id: facture.id, p_user_id: verif.userId ?? null,
    });
    if (errEmission) return { error: errEmission.message };
    for (const resaId of reservations) await synchroniserComptaResa(resaId, undefined, verif.userId ?? null);
    await synchroniserComptaFacture(facture.id, verif.userId ?? null);
    await finaliserEmission(facture.id, verif.userId ?? null);
  }

  revalidatePath("/factures");
  redirect(`/factures/${facture.id}`);
}

/**
 * Facture d'acompte sur une réservation validée : montant libre, aucun produit
 * reconnu. L'encaissement la porte en 2030, la facture définitive l'impute.
 */
export async function creerFactureAcompte(formData: FormData): Promise<{ error?: string; factureId?: string }> {
  const verif = await verifierPermission("perm_encaissements");
  if (verif.error) return { error: verif.error };

  const reservationId = ((formData.get("reservation_id") as string) || "").trim();
  const montant = parseFloat((formData.get("montant") as string) || "0");
  if (!reservationId) return { error: "Réservation introuvable." };
  if (!Number.isFinite(montant) || montant <= 0) return { error: "Montant d'acompte invalide." };

  const { data: resa } = await supabaseAdmin
    .from("reservations")
    .select("id, client_id, statut, numero, montant_final, montant_calcule")
    .eq("id", reservationId)
    .maybeSingle();
  if (!resa) return { error: "Réservation introuvable." };
  if (resa.statut !== "validee") return { error: "Seule une réservation validée peut faire l'objet d'un acompte." };
  if (!resa.client_id) return { error: "Réservation sans client." };

  const total = Number(resa.montant_final ?? resa.montant_calcule ?? 0);
  if (total > 0 && montant > total) {
    return { error: `L'acompte ne peut pas dépasser le montant du séjour (CHF ${total.toFixed(2)}).` };
  }

  const { data: facture, error } = await supabaseAdmin
    .from("factures")
    .insert({
      client_id: resa.client_id,
      type: "acompte",
      type_facture: "reservation",
      date_facture: new Date().toISOString().split("T")[0],
      statut: "brouillon",
      motif: `Acompte sur la réservation #${resa.numero ?? ""}`.trim(),
    })
    .select("id")
    .single();
  if (error || !facture) return { error: error?.message ?? "Création impossible." };

  await supabaseAdmin.from("facture_lignes").insert({
    facture_id: facture.id, ordre: 1,
    libelle: `Acompte sur la réservation #${resa.numero ?? ""}`.trim(),
    quantite: 1, prix_unitaire: r2(montant), compte_produit: "3000",
    reservation_id: reservationId,
  });
  await supabaseAdmin.from("factures").update({
    montant_total: r2(montant), montant_ttc: r2(montant), montant_ht: r2(montant),
    montant_restant: r2(montant),
  }).eq("id", facture.id);

  const { error: errEmission } = await supabaseAdmin.rpc("emettre_facture", {
    p_facture_id: facture.id, p_user_id: verif.userId ?? null,
  });
  if (errEmission) return { error: errEmission.message };

  await synchroniserComptaFacture(facture.id, verif.userId ?? null);
  await finaliserEmission(facture.id, verif.userId ?? null);

  await tracerEvenement({
    entite: "facture", entiteId: facture.id, evenement: "creation",
    apres: { type: "acompte", montant: r2(montant), reservation: resa.numero },
    userId: verif.userId ?? null,
  });

  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/factures");
  return { factureId: facture.id };
}
