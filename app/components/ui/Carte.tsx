import type { ReactNode } from "react";

type Accent = "rose" | "or" | "teal" | "aucun";

const ACCENT_COULEURS: Record<Exclude<Accent, "aucun">, string> = {
  rose: "#E8847A",
  or:   "#C9A84C",
  teal: "#4AAEA0",
};

type Props = {
  children: ReactNode;
  accent?: Accent;
  className?: string;
};

export default function Carte({ children, accent = "aucun", className = "" }: Props) {
  return (
    <div
      className={className}
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid rgba(27,43,94,0.12)",
        borderRadius: "18px",
        overflow: "hidden",
      }}
    >
      {accent !== "aucun" && (
        <div
          style={{
            height: "5px",
            backgroundColor: ACCENT_COULEURS[accent],
          }}
        />
      )}
      <div style={{ padding: "24px" }}>
        {children}
      </div>
    </div>
  );
}
