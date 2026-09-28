import { pourPdf } from "@/src/lib/texteWinAnsi";
import { formatPrixFacture } from "@/src/lib/prixClient";
import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

/**
 * Ticket de caisse au format 80 mm — le rouleau des imprimantes de comptoir.
 * Sobre, sans logo lourd et sans bulletin QR : un ticket comptant ne se paie
 * pas, il atteste. Même moteur que les factures (@react-pdf/renderer).
 */

const MARINE = "#1B2B5E";
const GRIS = "#6B7280";

/** 80 mm en points PDF (72 pt = 1 pouce). */
export const LARGEUR_80MM = (80 / 25.4) * 72;

const s = StyleSheet.create({
  page: { paddingTop: 14, paddingHorizontal: 12, paddingBottom: 18, fontSize: 8.5, color: MARINE, fontFamily: "Helvetica" },
  centre: { textAlign: "center" },
  nom: { fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 2 },
  entreprise: { fontSize: 7.5, color: GRIS, textAlign: "center", lineHeight: 1.4 },
  titre: { fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 10 },
  numero: { fontSize: 10, textAlign: "center", marginTop: 2 },
  date: { fontSize: 8, color: GRIS, textAlign: "center", marginBottom: 8 },
  filet: { borderBottomWidth: 0.7, borderBottomColor: "#CBD5E1", marginVertical: 6 },
  ligne: { flexDirection: "row", marginBottom: 3 },
  libelle: { flex: 1, paddingRight: 6 },
  detail: { fontSize: 7.5, color: GRIS },
  // 70 points, et non 58 comme avant : les montants portent désormais
  // « CHF », et « -12'345.67 CHF » demande 59.7 points en Helvetica 8.5.
  // Au-dessous, react-pdf ne déborde pas -- il COUPE le montant en deux
  // lignes, sans rien signaler. Les 12 points pris à la colonne du libellé
  // sont sans effet : elle est en `flex: 1` et ses libellés se replient déjà.
  montant: { width: 70, textAlign: "right" },
  totalLigne: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
  totalFort: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingTop: 5, borderTopWidth: 1, borderTopColor: MARINE },
  gras: { fontFamily: "Helvetica-Bold" },
  grand: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  mention: { marginTop: 14, fontSize: 8, color: GRIS, textAlign: "center" },
  motif: { marginTop: 8, fontSize: 8, color: GRIS },
});

export type LigneTicket = {
  libelle: string;
  quantite: number;
  prix_unitaire: number;
  montant: number;
  /**
   * La remise figée à la vente, quand il y en a une. Trois chiffres se lisent
   * alors sur la ligne : le prix de base réel, la remise avec son origine
   * nommée, et le prix payé. Une remise anonyme n'apprend rien au client.
   */
  prix_base?: number | null;
  remise_libelle?: string | null;
};

export type TicketProps = {
  numero: string;
  /** Un retour porte le numéro de la vente qu'il corrige. */
  venteOrigine?: string | null;
  motif?: string | null;
  date: string;
  emetteur: { nom: string; adresse: string[]; email: string; telephone: string; ide: string };
  client?: string | null;
  lignes: LigneTicket[];
  total: number;
  arrondi: number;
  aRegler: number;
  recu?: number | null;
  rendu?: number | null;
  modeLibelle: string;
  /**
   * La ventilation par taux, ou null si l'entreprise n'est pas assujettie.
   * Null veut dire : n'affiche RIEN — ni numéro, ni ligne de TVA.
   */
  tva?: {
    numero: string | null;
    totalHt: number;
    totalTtc: number;
    lignes: { taux: number; etiquette: string; base: number; tva: number }[];
    motifs?: string[];
  } | null;
  /** Achat porté sur une facture : rien n'a été encaissé au comptoir. */
  surFacture: boolean;
};

/**
 * Les montants de la pièce passent TOUS par `formatPrixFacture`.
 *
 * Le formateur local passait par `Intl.NumberFormat("fr-CH")`, qui rend ici
 * « 226,50 » et « 1'250,50 » — avec une VIRGULE décimale, alors que l'écran des
 * factures rendait « 226.50 ». La cliente lisait donc deux écritures du même
 * montant, l'une à l'écran et l'autre sur le PDF joint au même e-mail.
 *
 * Pire : le résultat d'`Intl` dépend de la version d'ICU embarquée par le
 * runtime. Un PDF émis est la pièce justificative, figée pour dix ans ; son
 * écriture ne peut pas dépendre de la machine qui l'a produit un jour donné.
 */

/**
 * Hauteur du rouleau : il s'allonge avec le nombre de lignes, et avec le bloc
 * de ventilation quand il y en a un.
 */
export function hauteurTicket(
  nbLignes: number,
  nbLignesTva = 0,
  nbMotifs = 0,
  /** Les lignes qui portent une remise : elles prennent une ligne de plus. */
  nbLignesRemisees = 0
): number {
  return (
    300 + nbLignes * 22 + nbLignesRemisees * 10 +
    (nbLignesTva > 0 ? 40 + nbLignesTva * 14 : 0) + nbMotifs * 12
  );
}

export function TicketPdf(p: TicketProps) {
  const estRetour = !!p.venteOrigine;

  return (
    <Document
      title={p.numero}
      author={p.emetteur.nom}
      subject={estRetour ? "Ticket de retour" : "Ticket de caisse"}
      creator="La Dogosphère"
      producer="La Dogosphère"
    >
      <Page
        size={[
          LARGEUR_80MM,
          hauteurTicket(
            p.lignes.length,
            p.tva?.lignes.length ?? 0,
            p.tva?.motifs?.length ?? 0,
            p.lignes.filter((l) => l.remise_libelle).length
          ),
        ]}
        style={s.page}
      >
        <Text style={s.nom}>{p.emetteur.nom}</Text>
        <Text style={s.entreprise}>
          {p.emetteur.adresse.join("\n")}
          {p.emetteur.telephone ? `\n${p.emetteur.telephone}` : ""}
          {p.emetteur.email ? `\n${p.emetteur.email}` : ""}
          {p.emetteur.ide ? `\n${p.emetteur.ide}` : ""}
        </Text>

        <Text style={s.titre}>{estRetour ? "RETOUR" : "TICKET DE CAISSE"}</Text>
        <Text style={s.numero}>{p.numero}</Text>
        <Text style={s.date}>{p.date}</Text>
        {estRetour && (
          <Text style={[s.detail, s.centre]}>sur la vente {p.venteOrigine}</Text>
        )}
        {p.client && <Text style={[s.detail, s.centre]}>Client : {p.client}</Text>}

        <View style={s.filet} />

        {p.lignes.map((l, i) => (
          <View key={i} style={s.ligne}>
            <View style={s.libelle}>
              <Text>{pourPdf(l.libelle)}</Text>
              <Text style={s.detail}>
                {l.quantite} × {formatPrixFacture(l.prix_unitaire)}
                {l.prix_base != null && l.prix_base !== l.prix_unitaire
                  ? ` (au lieu de ${formatPrixFacture(Number(l.prix_base))})`
                  : ""}
              </Text>
              {l.remise_libelle ? (
                <Text style={s.detail}>{pourPdf(l.remise_libelle)}</Text>
              ) : null}
            </View>
            <Text style={s.montant}>{formatPrixFacture(l.montant)}</Text>
          </View>
        ))}

        <View style={s.filet} />

        <View style={s.totalLigne}>
          <Text>Total</Text>
          <Text>{formatPrixFacture(p.total)}</Text>
        </View>

        {p.arrondi !== 0 && (
          <View style={s.totalLigne}>
            <Text>Arrondi 5 ct.</Text>
            <Text>{formatPrixFacture(p.arrondi)}</Text>
          </View>
        )}

        <View style={s.totalFort}>
          <Text style={s.grand}>{estRetour ? "Remboursé" : "À payer"}</Text>
          <Text style={s.grand}>{formatPrixFacture(Math.abs(p.aRegler))}</Text>
        </View>

        <View style={[s.totalLigne, { marginTop: 6 }]}>
          <Text>Mode</Text>
          <Text style={s.gras}>{p.modeLibelle}</Text>
        </View>

        {p.surFacture && (
          <Text style={s.motif}>
            Montant porté sur la facture du client — rien n&apos;a été encaissé au comptoir.
          </Text>
        )}

        {p.recu !== null && p.recu !== undefined && (
          <>
            <View style={s.totalLigne}>
              <Text>Reçu</Text>
              <Text>{formatPrixFacture(p.recu)}</Text>
            </View>
            {p.rendu !== null && p.rendu !== undefined && (
              <View style={s.totalLigne}>
                <Text style={s.gras}>Rendu</Text>
                <Text style={s.gras}>{formatPrixFacture(p.rendu)}</Text>
              </View>
            )}
          </>
        )}

        {/*
          La ventilation, en pied de ticket. Les prix affichés restent TTC.

          Elle se calcule sur le TOTAL DES LIGNES, jamais sur le montant
          réellement encaissé : l'arrondi aux 5 centimes est un écart de
          caisse qui part en 3800, il n'est pas une base d'imposition.

          Rien ne s'affiche si l'entreprise n'est pas assujettie.
        */}
        {p.tva && (p.tva.lignes.length > 0 || (p.tva.motifs?.length ?? 0) > 0) && (
          <>
            <View style={s.filet} />
            <View style={s.totalLigne}>
              <Text>Total HT</Text>
              <Text>{formatPrixFacture(p.tva.totalHt)}</Text>
            </View>
            {p.tva.lignes.map((l, i) => (
              <View key={i} style={s.totalLigne}>
                <Text>{pourPdf(l.etiquette)} sur {formatPrixFacture(l.base)}</Text>
                <Text>{formatPrixFacture(l.tva)}</Text>
              </View>
            ))}
            <View style={s.totalLigne}>
              <Text style={s.gras}>Total TTC</Text>
              <Text style={s.gras}>{formatPrixFacture(p.tva.totalTtc)}</Text>
            </View>
            {(p.tva.motifs ?? []).map((m, i) => (
              <Text key={i} style={s.detail}>{pourPdf(m)}</Text>
            ))}
          </>
        )}
        {p.tva?.numero && <Text style={[s.detail, s.centre, { marginTop: 6 }]}>{p.tva.numero}</Text>}

        {p.motif && <Text style={s.motif}>Motif : {pourPdf(p.motif)}</Text>}

        <Text style={s.mention}>Merci de votre visite</Text>
      </Page>
    </Document>
  );
}
