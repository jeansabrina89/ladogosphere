import type { ReactNode } from "react";

type Props = {
  icone?: ReactNode;
  titre: string;
  message?: string;
  action?: ReactNode;
};

export default function EtatVide({ icone, titre, message, action }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "48px 24px",
        gap: "12px",
      }}
    >
      {icone && (
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            backgroundColor: "#EDE8DF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#1F6E5B",
            fontSize: "24px",
            flexShrink: 0,
          }}
        >
          {icone}
        </div>
      )}
      <p
        style={{
          color: "#1B2B5E",
          fontSize: "17px",
          fontWeight: 500,
          margin: 0,
        }}
      >
        {titre}
      </p>
      {message && (
        <p
          style={{
            color: "rgba(27,43,94,0.6)",
            fontSize: "14px",
            margin: 0,
            maxWidth: "320px",
            lineHeight: 1.5,
          }}
        >
          {message}
        </p>
      )}
      {action && (
        <div style={{ marginTop: "4px" }}>
          {action}
        </div>
      )}
    </div>
  );
}
