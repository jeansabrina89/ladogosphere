"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { seRetirer } from "./actions";

/** Le second clic : celui qui décide, après celui qui a seulement ouvert. */
export default function BoutonRetrait({ token }: { token: string }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={enCours}
        onClick={async () => {
          setEnCours(true);
          setErreur(null);
          const res = await seRetirer(token);
          if (res.etat !== "retiree") {
            setErreur("Le retrait n'a pas pu être enregistré. Réessayez dans un instant.");
            setEnCours(false);
            return;
          }
          router.refresh();
        }}
        className="w-full rounded-xl px-6 font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: "#1B2B5E", minHeight: 44 }}
      >
        {enCours ? "…" : "Ne plus me prévenir pour cet article"}
      </button>
      {erreur && (
        <p role="alert" className="mt-3 text-sm" style={{ color: "#8A1F1F" }}>
          {erreur}
        </p>
      )}
    </>
  );
}
