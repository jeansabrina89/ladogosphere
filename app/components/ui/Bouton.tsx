import Link from "next/link";
import type { ReactNode, MouseEventHandler, CSSProperties } from "react";

type Variante = "principal" | "secondaire" | "discret";

const STYLES: Record<Variante, { bg: string; texte: string }> = {
  principal:  { bg: "#2E8B7E", texte: "#FFFFFF" },
  secondaire: { bg: "#DBEFEA", texte: "#1F6E5B" },
  discret:    { bg: "transparent", texte: "#1F6E5B" },
};

type Props = {
  variante?: Variante;
  icone?: ReactNode;
  pleineLargeur?: boolean;
  href?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
  className?: string;
};

export default function Bouton({
  variante = "principal",
  icone,
  pleineLargeur = false,
  href,
  disabled = false,
  type = "button",
  onClick,
  children,
  className = "",
}: Props) {
  const { bg, texte } = STYLES[variante];

  const baseStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    backgroundColor: bg,
    color: texte,
    borderRadius: "14px",
    border: "none",
    padding: "10px 20px",
    minHeight: "44px",
    fontSize: "15px",
    fontWeight: 500,
    textDecoration: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    width: pleineLargeur ? "100%" : undefined,
    boxSizing: "border-box",
    transition: "opacity 0.15s",
  };

  if (href && !disabled) {
    return (
      <Link href={href} style={baseStyle} className={className}>
        {icone && <span aria-hidden="true">{icone}</span>}
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={baseStyle}
      className={className}
    >
      {icone && <span aria-hidden="true">{icone}</span>}
      {children}
    </button>
  );
}
