"use client";

import { useEffect, useRef, useState } from "react";
import { fairerCheckin, fairerCheckout } from "./actions";
import DialogueResultatEssai from "@/app/components/DialogueResultatEssai";
import type { ResultatEssai } from "@/src/lib/journeeEssai";

export function BoutonCheckin({ checkin_id }: { checkin_id: string }) {
  return (
    <form action={fairerCheckin}>
      <input type="hidden" name="checkin_id" value={checkin_id} />
      <button type="submit"
        style={{ backgroundColor: "#2E8B7E", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "10px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
        ✅ Arrivé
      </button>
    </form>
  );
}

const STYLE_DEPART: React.CSSProperties = {
  backgroundColor: "#1B2B5E", color: "#fff", border: "none",
  padding: "8px 16px", borderRadius: "10px", fontSize: "14px", fontWeight: 600, cursor: "pointer",
};

export function BoutonCheckout({
  checkin_id,
  est_essai = false,
  nom_chien = "ce chien",
}: {
  checkin_id: string;
  est_essai?: boolean;
  nom_chien?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState<{ resultat: ResultatEssai; note: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Le formulaire n'est soumis qu'APRÈS le rendu portant le résultat saisi :
  // les champs cachés sont alors à jour.
  useEffect(() => {
    if (saisie) formRef.current?.requestSubmit();
  }, [saisie]);

  // Prestation ordinaire : départ direct.
  if (!est_essai) {
    return (
      <form action={fairerCheckout}>
        <input type="hidden" name="checkin_id" value={checkin_id} />
        <button type="submit" style={STYLE_DEPART}>🏁 Parti</button>
      </form>
    );
  }

  // Journée d'essai : le résultat est saisi avant d'enregistrer le départ.
  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} disabled={!!saisie} style={STYLE_DEPART}>
        {saisie ? "…" : "🏁 Parti"}
      </button>

      {ouvert && (
        <DialogueResultatEssai
          nom_chien={nom_chien}
          onAnnuler={() => setOuvert(false)}
          onValider={(resultat, note) => {
            setOuvert(false);
            setSaisie({ resultat, note });
          }}
        />
      )}

      <form action={fairerCheckout} ref={formRef} style={{ display: "none" }}>
        <input type="hidden" name="checkin_id" value={checkin_id} />
        <input type="hidden" name="resultat" value={saisie?.resultat ?? ""} />
        <input type="hidden" name="note" value={saisie?.note ?? ""} />
      </form>
    </>
  );
}
