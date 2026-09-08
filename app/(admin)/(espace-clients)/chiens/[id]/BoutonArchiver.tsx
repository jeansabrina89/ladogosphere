"use client";

import { archiverChien } from "./actions";
import Bouton from "@/app/components/ui/Bouton";

export default function BoutonArchiver({ id, actif }: { id: string; actif: boolean | null }) {
  const estActif = actif !== false;

  return (
    <form action={archiverChien}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="actif" value={String(estActif)} />
      <Bouton type="submit" variante="secondaire">
        {estActif ? "Archiver le chien" : "Réactiver le chien"}
      </Bouton>
    </form>
  );
}
