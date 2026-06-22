import Link from "next/link";
import type { CSSProperties } from "react";

export default function NomChienLien({
  id,
  nom,
  style,
}: {
  id?: string | null;
  nom?: string | null;
  style?: CSSProperties;
}) {
  const label = nom ?? "—";
  if (!id) return <span style={style}>{label}</span>;
  return (
    <Link
      href={`/chiens/${id}`}
      className="hover:underline"
      style={{ color: "inherit", textDecoration: "none", ...style }}
    >
      {label}
    </Link>
  );
}
