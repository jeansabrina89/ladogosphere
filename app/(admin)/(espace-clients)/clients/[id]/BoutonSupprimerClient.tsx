"use client";

import { supprimerClient } from "./actions";

export default function BoutonSupprimerClient({ id, nom }: { id: string; nom: string }) {
  return (
    <form action={supprimerClient}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="bg-red-600 text-white px-4 py-2 rounded-xl hover:bg-red-700"
        onClick={(e) => {
          if (!confirm(`Supprimer définitivement ${nom} ? Cette action est irréversible.`)) {
            e.preventDefault();
          }
        }}>
        Supprimer définitivement
      </button>
    </form>
  );
}