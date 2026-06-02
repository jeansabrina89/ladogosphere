"use client";

import { annulerReservation } from "./modifier/actions";

export default function BoutonAnnuler({ id }: { id: string }) {
  return (
    <form action={annulerReservation}>
      <input type="hidden" name="id" value={id} />
      <button type="submit"
        className="bg-red-600 text-white px-4 py-2 rounded-xl hover:bg-red-700"
        onClick={(e) => {
          if (!confirm("Annuler cette réservation ? Les boxes seront libérés.")) {
            e.preventDefault();
          }
        }}>
        ❌ Annuler la réservation
      </button>
    </form>
  );
}