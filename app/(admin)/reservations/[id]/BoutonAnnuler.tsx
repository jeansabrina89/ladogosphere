"use client";

import { useRef } from "react";
import { annulerReservation } from "./modifier/actions";

export default function BoutonAnnuler({
  id,
  montant_paye,
  client_id,
}: {
  id: string;
  montant_paye: number;
  client_id?: string | null;
}) {
  const mettreEnAvoirRef = useRef<HTMLInputElement>(null);

  return (
    <form action={annulerReservation}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="client_id" value={client_id || ""} />
      <input type="hidden" name="mettre_en_avoir" defaultValue="false" ref={mettreEnAvoirRef} />
      <button
        type="submit"
        className="bg-red-600 text-white px-4 py-2 rounded-xl hover:bg-red-700"
        onClick={(e) => {
          if (!confirm("Annuler cette réservation ? Les boxes seront libérés.")) {
            e.preventDefault();
            return;
          }
          if (montant_paye > 0) {
            const oui = confirm(
              `Cette réservation a CHF ${montant_paye.toFixed(2)} de payé.\n\n` +
              "Mettre ce montant en avoir pour le client ?\n" +
              "OK = Oui, créditer l'avoir\nAnnuler = Non, laisser le montant sur la réservation"
            );
            if (mettreEnAvoirRef.current) {
              mettreEnAvoirRef.current.value = oui ? "true" : "false";
            }
          }
        }}>
        ❌ Annuler la réservation
      </button>
    </form>
  );
}
