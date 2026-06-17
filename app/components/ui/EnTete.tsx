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
      <div>
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
        <div style={{ flexShrink: 0 }}>
          {action}
        </div>
      )}
    </div>
  );
}
