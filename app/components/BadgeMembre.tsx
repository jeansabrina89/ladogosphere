import type { CSSProperties } from "react";

const base: CSSProperties = {
  display: "inline-block",
  fontSize: 12,
  fontWeight: 600,
  padding: "3px 10px",
  borderRadius: 999,
};

export default function BadgeMembre({
  membre,
  aJour,
  montrerStandard = false,
}: {
  membre: boolean;
  aJour: boolean;
  montrerStandard?: boolean;
}) {
  if (!membre) {
    if (!montrerStandard) return null;
    return <span style={{ ...base, backgroundColor: "#EDE8DF", color: "rgba(27,43,94,0.6)" }}>Standard</span>;
  }
  if (aJour) {
    return <span style={{ ...base, backgroundColor: "#F4EAC9", color: "#6E5410" }}>⭐ Membre</span>;
  }
  return <span style={{ ...base, backgroundColor: "#FBE2DE", color: "#A8453A" }}>🔔 À renouveler</span>;
}
