"use client";

import { useFormStatus } from "react-dom";

export default function BoutonEnregistrer() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="px-6 py-3 rounded-xl font-semibold text-white"
      style={{
        backgroundColor: pending ? "#9CC9C2" : "#4AAEA0",
        cursor: pending ? "not-allowed" : "pointer",
        opacity: pending ? 0.8 : 1,
      }}
    >
      {pending ? "Enregistrement…" : "💾 Enregistrer"}
    </button>
  );
}
