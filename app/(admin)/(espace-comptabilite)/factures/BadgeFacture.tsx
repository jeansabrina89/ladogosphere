import { etatFacture, libelleEtatFacture, couleursEtatFacture, type FacturePourEtat } from "@/src/lib/factureStatut";

/** Pastille d'état d'une facture — un seul vocabulaire pour toute l'application. */
export default function BadgeFacture({
  facture,
  aujourdhui,
}: {
  facture: FacturePourEtat;
  aujourdhui: string;
}) {
  const etat = etatFacture(facture, aujourdhui);
  const { fond, texte } = couleursEtatFacture(etat);

  return (
    <span
      style={{
        display: "inline-block",
        backgroundColor: fond,
        color: texte,
        borderRadius: 999,
        padding: "2px 10px",
        fontSize: 13,
        fontWeight: 500,
        lineHeight: "20px",
        whiteSpace: "nowrap",
      }}
    >
      {libelleEtatFacture(etat)}
    </span>
  );
}
