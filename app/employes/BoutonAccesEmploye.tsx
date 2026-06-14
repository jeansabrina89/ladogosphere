"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  creerAccesEmploye,
  reinitialiserMotDePasseEmploye,
  type AccesEmployeState,
} from "./actions";

function ResultatAcces({ state }: { state: AccesEmployeState | null }) {
  if (!state) return null;

  return (
    <>
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
          ✅ Compte employé existant relié.
        </p>
      )}

      {state.converti && (
        <p className="mt-2 text-sm font-semibold" style={{ color: "#4AAEA0" }}>
          ✅ Compte transformé en employé.
        </p>
      )}

      {state.error && (
        <p className="mt-2 text-sm font-semibold text-red-600 max-w-xs">
          ❌ {state.error}
        </p>
      )}
    </>
  );
}

export function BoutonCreerAcces({ ficheId }: { ficheId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<AccesEmployeState | null>(null);

  function lancer(confirmer: boolean) {
    startTransition(async () => {
      const res = await creerAccesEmploye(ficheId, confirmer);
      setState(res);
      if (res.lien || res.password || res.converti) router.refresh();
    });
  }

  function handleConfirmer() {
    const ok = window.confirm(
      `Le compte existant pour ${state?.email} (rôle : ${state?.role}) va devenir un compte employé. ` +
      `Il perdra son accès client. Continuer ?`
    );
    if (!ok) return;
    lancer(true);
  }

  return (
    <div>
      <button
        onClick={() => lancer(false)}
        disabled={isPending}
        className="px-3 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: "#4AAEA0" }}
      >
        {isPending ? "…" : "🔑 Créer un accès"}
      </button>

      <ResultatAcces state={state} />

      {state?.besoinConfirmation && (
        <div className="mt-2 p-3 rounded-xl border text-sm max-w-xs"
          style={{ backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" }}>
          <p className="text-red-700">
            Un compte client existe déjà pour <strong>{state.email}</strong>.
            Le transformer en compte employé lui retirera l'accès client.
            Confirmer ?
          </p>
          <button
            type="button"
            onClick={handleConfirmer}
            disabled={isPending}
            className="mt-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "#C0392B" }}
          >
            {isPending ? "…" : "Confirmer la transformation"}
          </button>
        </div>
      )}
    </div>
  );
}

export function BoutonReinitialiserMdp({ profilId }: { profilId: string }) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<AccesEmployeState | null>(null);

  function lancer() {
    startTransition(async () => {
      const res = await reinitialiserMotDePasseEmploye(profilId);
      setState(res);
    });
  }

  return (
    <div>
      <button
        onClick={lancer}
        disabled={isPending}
        className="px-3 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: "#C9A84C" }}
      >
        {isPending ? "…" : "🔄 Réinitialiser le mot de passe"}
      </button>

      <ResultatAcces state={state} />
    </div>
  );
}
