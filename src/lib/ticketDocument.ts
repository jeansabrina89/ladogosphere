import React from "react";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { getCoordonneesPaiement } from "@/src/lib/coordonneesPaiement";
import { lireVente, lignesDeVente } from "@/src/lib/caisse";
import { libelleModeVente } from "@/src/lib/caisseLogique";
import { TicketPdf, type LigneTicket } from "@/src/lib/ticketPdf";
import { lireParametresTva, affichage } from "@/src/lib/tva";
import { piedTva, ventilerPanier } from "@/src/lib/tvaLogique";

/**
 * Ticket de caisse, fabriqué à la demande.
 *
 * Contrairement à la facture, le ticket n'est pas archivé : la pièce
 * comptable, c'est la vente elle-même — inaltérable, avec ses lignes figées et
 * son écriture. Le ticket n'en est que l'impression, et il redonne toujours le
 * même texte parce que la vente ne bouge plus.
 */

async function lireParametres(cles: string[]): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin.from("parametres").select("cle, valeur").in("cle", cles);
  const map: Record<string, string> = {};
  for (const r of (data ?? []) as { cle: string; valeur: string }[]) map[r.cle] = (r.valeur ?? "").trim();
  return map;
}

export type DonneesTicket = {
  numero: string;
  clientEmail: string | null;
  clientPrenom: string | null;
  total: number;
};

export async function genererTicket(
  venteId: string
): Promise<{ buffer: Buffer; infos: DonneesTicket } | null> {
  const vente = await lireVente(venteId);
  if (!vente || !vente.numero) return null;

  const lignesDb = await lignesDeVente(venteId);

  const [coords, params] = await Promise.all([
    getCoordonneesPaiement(supabaseAdmin),
    lireParametres(["email_entreprise", "telephone_entreprise", "ide"]),
  ]);

  type ClientTicket = { prenom: string | null; nom: string | null; email: string | null };
  let client: ClientTicket | null = null;
  if (vente.client_id) {
    const { data } = await supabaseAdmin
      .from("clients").select("prenom, nom, email").eq("id", vente.client_id).maybeSingle();
    client = (data as ClientTicket | null) ?? null;
  }

  let vendeur: string | null = null;
  if (vente.vendu_par) {
    const { data } = await supabaseAdmin
      .from("profiles").select("prenom, nom").eq("id", vente.vendu_par).maybeSingle();
    const p = data as { prenom?: string; nom?: string } | null;
    vendeur = p ? `${p.prenom ?? ""} ${p.nom ?? ""}`.trim() || null : null;
  }

  let venteOrigine: string | null = null;
  if (vente.vente_origine_id) {
    const { data } = await supabaseAdmin
      .from("ventes").select("numero").eq("id", vente.vente_origine_id).maybeSingle();
    venteOrigine = (data?.numero as string) ?? null;
  }

  const lignes: LigneTicket[] = lignesDb.map((l) => ({
    libelle: l.libelle,
    quantite: Number(l.quantite),
    prix_unitaire: Number(l.prix_unitaire),
    montant: Number(l.montant),
  }));

  // Chaque ligne porte le taux figé au moment de la vente. La ventilation se
  // fait sur le total des lignes : l'arrondi aux 5 centimes est un écart de
  // caisse, pas une base d'imposition.
  const dateVente = String(vente.date_vente).slice(0, 10);
  const regime = await lireParametresTva(dateVente);
  const tva = piedTva(
    affichage(regime),
    ventilerPanier({
      lignes: lignesDb.map((l) => ({ montant: l.montant, taux_tva: l.taux_tva })),
    }),
    dateVente
  );

  const total = Number(vente.montant_total);
  const arrondi = Number(vente.arrondi ?? 0);
  const recu = vente.montant_recu === null ? null : Number(vente.montant_recu);
  const aRegler = Math.round((total + arrondi) * 100) / 100;

  const element = React.createElement(TicketPdf, {
    numero: vente.numero,
    venteOrigine,
    motif: vente.motif,
    date: new Date(vente.date_vente).toLocaleString("fr-CH", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    }),
    emetteur: {
      nom: coords.titulaire,
      adresse: [
        [coords.adresse.rue, coords.adresse.numero].filter(Boolean).join(" "),
        [coords.adresse.npa, coords.adresse.ville].filter(Boolean).join(" "),
      ].filter(Boolean),
      email: params.email_entreprise ?? "",
      telephone: params.telephone_entreprise ?? "",
      ide: params.ide ?? "",
    },
    client: client ? `${client.prenom ?? ""} ${client.nom ?? ""}`.trim() : null,
    lignes,
    total,
    arrondi,
    aRegler,
    recu,
    rendu: recu === null ? null : Math.round((recu - aRegler) * 100) / 100,
    modeLibelle: libelleModeVente(vente.mode_reglement),
    tva,
    surFacture: vente.mode_reglement === "facture_client",
    vendeur,
  });

  const { renderToBuffer } = await import("@react-pdf/renderer");
  // Comme pour la facture : TicketPdf REND un <Document>, mais TypeScript ne le
  // voit pas à travers le composant.
  const buffer = await renderToBuffer(element as unknown as Parameters<typeof renderToBuffer>[0]);

  return {
    buffer,
    infos: {
      numero: vente.numero,
      clientEmail: client?.email ?? null,
      clientPrenom: client?.prenom ?? null,
      total,
    },
  };
}
