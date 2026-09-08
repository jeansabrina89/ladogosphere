"use client";

import { useState } from "react";

/**
 * Le raccourci « Vendeuse ».
 *
 * Ce n'est PAS un rôle : il ne s'enregistre nulle part, il ne se relit pas, et
 * rien dans l'application ne demandera jamais « est-elle vendeuse ? ». Il coche
 * les cases habituelles d'une employée au comptoir, et on peut en décocher une
 * juste après — ce sont des cases, il les pré-remplit.
 *
 * Il ne DÉcoche rien non plus : quelqu'un qui a déjà d'autres permissions ne
 * les perd pas parce qu'on a voulu lui ajouter le comptoir.
 */
const CASES_VENDEUSE = [
  "perm_checkin",
  "perm_reservations_creer",
  "perm_reservations_modifier",
  "perm_encaissements",
  "perm_boutique_vente",
];

export default function RaccourciVendeuse() {
  const [fait, setFait] = useState(false);

  return (
    <div className="rounded-xl border border-[rgba(27,43,94,0.14)] bg-[#FBF9F5] p-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            for (const nom of CASES_VENDEUSE) {
              const champ = document.querySelector<HTMLInputElement>(`input[name="${nom}"]`);
              if (champ && !champ.checked) champ.click();
            }
            setFait(true);
          }}
          className="min-h-[44px] rounded-xl border border-[rgba(27,43,94,0.14)] bg-white px-4 text-sm font-semibold text-[#1B2B5E]"
        >
          👜 Cocher les permissions d&apos;une vendeuse
        </button>
        <p className="text-xs text-[rgba(27,43,94,0.55)] flex-1 min-w-[200px]">
          Check-in / check-out, créer et modifier des réservations, encaissements, et
          « Boutique — vente ». Rien d&apos;autre n&apos;est coché, rien n&apos;est décoché,
          et vous pouvez ajuster case par case avant d&apos;enregistrer.
        </p>
      </div>
      {fait && (
        <p role="status" className="mt-2 text-xs font-semibold text-[#1F6E5B]">
          Cases pré-remplies. Vérifiez-les, puis enregistrez.
        </p>
      )}
    </div>
  );
}
