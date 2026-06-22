import Link from "next/link";
import type { CSSProperties } from "react";

export default function NomClientLien({
  id,
  prenom,
  nom,
  style,
}: {
  id?: string | null;
  prenom?: string | null;
  nom?: string | null;
  style?: CSSProperties;
}) {
  const label = `${prenom ?? ""} ${nom ?? ""}`.trim() || "Client";
  if (!id) return <span style={style}>{label}</span>;
  return (
    <Link
      href={`/clients/${id}`}
      className="hover:underline"
      style={{ color: "inherit", textDecoration: "none", ...style }}
    >
      {label}
    </Link>
  );
}
