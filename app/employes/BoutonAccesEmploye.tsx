"use client";

import { useActionState } from "react";
import type { AccesEmployeState } from "./actions";

export default function BoutonAccesEmploye({
  action,
  id,
  idFieldName,
  label,
  color = "#4AAEA0",
}: {
  action: (prevState: AccesEmployeState, formData: FormData) => Promise<AccesEmployeState>;
  id: string;
  idFieldName: string;
  label: string;
  color?: string;
}) {
  const [state, formAction, isPending] = useActionState<AccesEmployeState, FormData>(action, {});

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name={idFieldName} value={id} />
        <button
          type="submit"
          disabled={isPending}
          className="px-3 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: color }}
        >
          {isPending ? "…" : label}
        </button>
      </form>

      {state.password && (
        <div className="mt-2 p-3 rounded-xl border text-sm max-w-xs"
          style={{ backgroundColor: "#FEF9C3", borderColor: "#FBBF24" }}>
          <p className="font-semibold" style={{ color: "#1B2B5E" }}>
            Mot de passe temporaire :{" "}
            <span className="font-mono">{state.password}</span>
          </p>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(state.password!)}
            className="mt-1 text-xs font-semibold underline"
            style={{ color: "#1B2B5E" }}
          >
            📋 Copier
          </button>
          <p className="text-xs text-orange-600 mt-1">
            ⚠️ À transmettre à l'employé — affiché une seule fois.
          </p>
        </div>
      )}

      {state.lien && (
        <p className="mt-2 text-sm font-semibold" style={{ color: "#4AAEA0" }}>
          ✅ Compte existant relié avec succès.
        </p>
      )}

      {state.error && (
        <p className="mt-2 text-sm font-semibold text-red-600 max-w-xs">
          ❌ {state.error}
        </p>
      )}
    </div>
  );
}
