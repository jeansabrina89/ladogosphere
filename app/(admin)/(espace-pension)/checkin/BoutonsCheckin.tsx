"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { fairerCheckin, fairerCheckout, type EtatCheckout } from "./actions";
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

const ETAT_INITIAL: EtatCheckout = { erreur: null };

/**
 * Message d'échec du départ. Il s'affiche tel quel : une facture qui n'a pas
 * pu être émise ne doit jamais passer inaperçue.
 */
function MessageErreur({ texte }: { texte: string }) {
  return (
    <p
      aria-live="polite"
      style={{
        marginTop: 8,
        maxWidth: 320,
        backgroundColor: "#FDECEC",
        color: "#8A1F1F",
        border: "1px solid #F0C2C2",
        borderRadius: 10,
        padding: "8px 10px",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      ⚠️ {texte}
    </p>
  );
}

export function BoutonCheckout({
  checkin_id,
  est_essai = false,
  nom_chien = "ce chien",
}: {
  checkin_id: string;
  est_essai?: boolean;
  nom_chien?: string;
}) {
  const [etat, action, enCours] = useActionState(fairerCheckout, ETAT_INITIAL);
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState<{ resultat: ResultatEssai; note: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Le formulaire n'est soumis qu'APRÈS le rendu portant le résultat saisi :
  // les champs cachés sont alors à jour.
  useEffect(() => {
    if (saisie) formRef.current?.requestSubmit();
  }, [saisie]);

  // Départ refusé : on rouvre la saisie pour que le geste soit rejouable.
  useEffect(() => {
    if (etat.erreur) setSaisie(null);
  }, [etat.erreur]);

  // Prestation ordinaire : départ direct.
  if (!est_essai) {
    return (
      <form action={action}>
        <input type="hidden" name="checkin_id" value={checkin_id} />
        <button type="submit" disabled={enCours} style={STYLE_DEPART}>
          {enCours ? "…" : "🏁 Parti"}
        </button>
        {etat.erreur && <MessageErreur texte={etat.erreur} />}
      </form>
    );
  }

  // Journée d'essai : le résultat est saisi avant d'enregistrer le départ.
  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} disabled={enCours} style={STYLE_DEPART}>
        {enCours ? "…" : "🏁 Parti"}
      </button>

      {etat.erreur && <MessageErreur texte={etat.erreur} />}

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

      <form action={action} ref={formRef} style={{ display: "none" }}>
        <input type="hidden" name="checkin_id" value={checkin_id} />
        <input type="hidden" name="resultat" value={saisie?.resultat ?? ""} />
        <input type="hidden" name="note" value={saisie?.note ?? ""} />
      </form>
    </>
  );
}
