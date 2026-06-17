"use client";

import { archiverClient } from "./actions";

export default function BoutonArchiverClient({ id, actif }: { id: string; actif: boolean | null }) {
  const estActif = actif !== false;

  return (
    <form action={archiverClient}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="actif" value={String(estActif)} />
      <button type="submit"
        className="bg-gray-500 text-white px-4 py-2 rounded-xl hover:bg-gray-600">
        {estActif ? "Archiver le client" : "Réactiver le client"}
      </button>
    </form>
  );
}