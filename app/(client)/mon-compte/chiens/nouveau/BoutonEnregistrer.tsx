"use client";

import { useFormStatus } from "react-dom";

export default function BoutonEnregistrer() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      style={{
        border: "none",
        borderRadius: 14,
        padding: "14px 24px",
        fontSize: 15,
        fontWeight: 700,
        color: "#fff",
        backgroundColor: pending ? "#9CC9C2" : "#2E8B7E",
        cursor: pending ? "not-allowed" : "pointer",
        minHeight: 54,
        fontFamily: "inherit",
      }}
    >
      {pending ? "Enregistrement…" : "💾 Enregistrer"}
    </button>
  );
}
