import React from "react";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { BulletinQr } from "@/src/lib/svgQrVersPdf";

// Document PDF d'une facture. Rendu côté serveur, figé une fois pour toutes :
// un PDF émis n'est jamais régénéré, c'est la pièce justificative.

const MARINE = "#1B2B5E";
const GRIS = "#6B7280";
const SABLE = "#F5F0E8";

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingHorizontal: 40, paddingBottom: 48, fontSize: 9.5, color: MARINE, fontFamily: "Helvetica" },
  enTete: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  logo: { width: 74, height: 74, objectFit: "contain" },
  emetteur: { fontSize: 8.5, color: GRIS, textAlign: "right", lineHeight: 1.5 },
  nomEmetteur: { fontSize: 12, color: MARINE, fontFamily: "Helvetica-Bold", marginBottom: 3, textAlign: "right" },
  bandeau: { flexDirection: "row", justifyContent: "space-between", marginBottom: 22 },
  bloc: { maxWidth: "48%" },
  etiquette: { fontSize: 7.5, color: GRIS, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
  titre: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  ligneInfo: { flexDirection: "row", marginBottom: 2 },
  infoCle: { width: 78, color: GRIS },
  tableEnTete: { flexDirection: "row", backgroundColor: MARINE, color: "white", paddingVertical: 6, paddingHorizontal: 8, fontSize: 8.5 },
  tableLigne: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0" },
  colLibelle: { flex: 1 },
  colQte: { width: 44, textAlign: "right" },
  colPu: { width: 74, textAlign: "right" },
  colMontant: { width: 78, textAlign: "right" },
  totaux: { marginTop: 12, alignSelf: "flex-end", width: 250 },
  ligneTotal: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  ligneTotalFort: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: 1, borderTopColor: MARINE, marginTop: 4 },
  gras: { fontFamily: "Helvetica-Bold" },
  mention: { marginTop: 16, fontSize: 8, color: GRIS },
  motif: { marginTop: 12, padding: 8, backgroundColor: SABLE, fontSize: 8.5 },
  bulletin: { position: "absolute", bottom: 0, left: 0, right: 0 },
  pied: { position: "absolute", bottom: 16, left: 40, right: 40, fontSize: 7.5, color: GRIS, textAlign: "center" },
});

export type LignePdf = {
  libelle: string;
  quantite: number;
  prix_unitaire: number;
  montant: number;
};

export type FacturePdfProps = {
  numero: string;
  type: string;
  dateFacture: string;
  dateEcheance: string | null;
  motif?: string | null;
  client: { nom: string; adresse: string[] };
  emetteur: {
    nom: string; adresse: string[]; email: string; telephone: string; ide: string;
    mentionTva: string;
  };
  lignes: LignePdf[];
  total: number;
  acomptes: number;
  dejaPaye: number;
  reste: number;
  delaiJours: number;
  logo?: string | null;
  /** SVG du bulletin de versement, quand les coordonnées le permettent. */
  bulletinSvg?: string | null;
};

const chf = (n: number) =>
  new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const jolieDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [a, m, j] = iso.slice(0, 10).split("-");
  return j ? `${j}.${m}.${a}` : iso;
};

/** Le <Image> de @react-pdf n'est pas une balise du DOM : il n'a pas de prop alt. */
function Logo({ source }: { source: string }) {
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image style={s.logo} src={source} />;
}

function TitreDocument({ type }: { type: string }) {
  if (type === "avoir") return <Text style={s.titre}>AVOIR</Text>;
  if (type === "acompte") return <Text style={s.titre}>FACTURE D&apos;ACOMPTE</Text>;
  return <Text style={s.titre}>FACTURE</Text>;
}

export function FacturePdf(p: FacturePdfProps) {
  const estAvoir = p.type === "avoir";
  // Le bulletin occupe le tiers bas de la page : on lui réserve la place.
  const placeBulletin = p.bulletinSvg && !estAvoir ? 320 : 0;

  return (
    <Document
      title={`${estAvoir ? "Avoir" : "Facture"} ${p.numero}`}
      author={p.emetteur.nom}
      creator="La Dogosphère"
    >
      <Page size="A4" style={[s.page, { paddingBottom: 48 + placeBulletin }]} wrap>
        <View style={s.enTete} fixed={false}>
          <View>
            {p.logo
              ? <Logo source={p.logo} />
              : <Text style={s.nomEmetteur}>{p.emetteur.nom}</Text>}
          </View>
          <View>
            <Text style={s.nomEmetteur}>{p.emetteur.nom}</Text>
            <View style={s.emetteur}>
              {p.emetteur.adresse.filter(Boolean).map((l, i) => <Text key={i}>{l}</Text>)}
              {p.emetteur.email ? <Text>{p.emetteur.email}</Text> : null}
              {p.emetteur.telephone ? <Text>{p.emetteur.telephone}</Text> : null}
              {p.emetteur.ide ? <Text>{p.emetteur.ide}</Text> : null}
            </View>
          </View>
        </View>

        <View style={s.bandeau}>
          <View style={s.bloc}>
            <TitreDocument type={p.type} />
            <View style={s.ligneInfo}>
              <Text style={s.infoCle}>N°</Text><Text style={s.gras}>{p.numero}</Text>
            </View>
            <View style={s.ligneInfo}>
              <Text style={s.infoCle}>Date</Text><Text>{jolieDate(p.dateFacture)}</Text>
            </View>
            {!estAvoir && (
              <View style={s.ligneInfo}>
                <Text style={s.infoCle}>Échéance</Text><Text>{jolieDate(p.dateEcheance)}</Text>
              </View>
            )}
          </View>
          <View style={s.bloc}>
            <Text style={s.etiquette}>Facturé à</Text>
            <Text style={s.gras}>{p.client.nom}</Text>
            {p.client.adresse.filter(Boolean).map((l, i) => <Text key={i}>{l}</Text>)}
          </View>
        </View>

        <View style={s.tableEnTete}>
          <Text style={s.colLibelle}>Désignation</Text>
          <Text style={s.colQte}>Qté</Text>
          <Text style={s.colPu}>Prix unitaire</Text>
          <Text style={s.colMontant}>Montant</Text>
        </View>
        {p.lignes.map((l, i) => (
          <View key={i} style={s.tableLigne} wrap={false}>
            <Text style={s.colLibelle}>{l.libelle}</Text>
            <Text style={s.colQte}>{l.quantite}</Text>
            <Text style={s.colPu}>{chf(l.prix_unitaire)}</Text>
            <Text style={s.colMontant}>{chf(l.montant)}</Text>
          </View>
        ))}

        <View style={s.totaux} wrap={false}>
          <View style={s.ligneTotal}>
            <Text>Total</Text><Text>{chf(p.total)} CHF</Text>
          </View>
          {p.acomptes > 0 && (
            <View style={s.ligneTotal}>
              <Text>Acomptes déjà versés</Text><Text>− {chf(p.acomptes)} CHF</Text>
            </View>
          )}
          {p.dejaPaye > 0 && (
            <View style={s.ligneTotal}>
              <Text>Déjà payé</Text><Text>− {chf(p.dejaPaye)} CHF</Text>
            </View>
          )}
          <View style={s.ligneTotalFort}>
            <Text style={s.gras}>{estAvoir ? "Montant de l'avoir" : "Reste à payer"}</Text>
            <Text style={s.gras}>{chf(estAvoir ? p.total : p.reste)} CHF</Text>
          </View>
        </View>

        {p.motif ? (
          <View style={s.motif}>
            <Text style={s.gras}>Motif</Text>
            <Text>{p.motif}</Text>
          </View>
        ) : null}

        <Text style={s.mention}>{p.emetteur.mentionTva}</Text>
        {!estAvoir && (
          <Text style={s.mention}>Payable à {p.delaiJours} jours, sans escompte.</Text>
        )}

        {p.bulletinSvg && !estAvoir ? (
          <View style={s.bulletin} fixed={false}>
            <BulletinQr svg={p.bulletinSvg} />
          </View>
        ) : null}

        <Text
          style={s.pied}
          render={({ pageNumber, totalPages }) =>
            totalPages > 1 ? `${p.numero} — page ${pageNumber} / ${totalPages}` : ""
          }
          fixed
        />
      </Page>
    </Document>
  );
}
