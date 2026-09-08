import type { ReactNode } from "react";

type Props = {
  titre: string;
  sousTitre?: string;
  action?: ReactNode;
};

export default function EnTete({ titre, sousTitre, action }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "12px",
        marginBottom: "24px",
      }}
    >
      {/* Le titre cède la place : sans minWidth: 0, un titre long garderait
          la largeur de son contenu et pousserait les actions dehors. */}
      <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
        <h1
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            color: "#1B2B5E",
            fontSize: "22px",
            fontWeight: 700,
            margin: 0,
            lineHeight: 1.25,
          }}
        >
          {titre}
        </h1>
        {sousTitre && (
          <p
            style={{
              color: "rgba(27,43,94,0.6)",
              fontSize: "14px",
              marginTop: "4px",
              marginBottom: 0,
            }}
          >
            {sousTitre}
          </p>
        )}
      </div>
      {action && (
        /**
         * `minWidth: 0` — et non `flexShrink: 0`. À 375 px, deux ou trois boutons
         * font plus large que l'écran ; un bloc qui refuse de rétrécir sort de
         * la fenêtre et emporte le dernier bouton avec lui. En le laissant
         * rétrécir, le `flexWrap` de la rangée d'actions fait son travail.
         */
        <div style={{ minWidth: 0 }}>
          {action}
        </div>
      )}
    </div>
  );
}
