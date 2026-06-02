"use client";

import { archiverChien } from "./actions";

export default function BoutonArchiver({ id, actif }: { id: string; actif: boolean | null }) {
  const estActif = actif !== false;

  return (
    <form action={archiverChien}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="actif" value={String(estActif)} />
      <button type="submit"
        className="bg-gray-500 text-white px-4 py-2 rounded-xl hover:bg-gray-600">
        {estActif ? "Archiver le chien" : "Réactiver le chien"}
      </button>
    </form>
  );
}