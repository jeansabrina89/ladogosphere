"use client";
import { archiverClient } from "./actions";
import Bouton from "@/app/components/ui/Bouton";

export default function BoutonArchiverClient({ id, actif }: { id: string; actif: boolean | null }) {
  const estActif = actif !== false;
  return (
    <form action={archiverClient}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="actif" value={String(estActif)} />
      <Bouton type="submit" variante="secondaire">
        {estActif ? "Archiver le client" : "Réactiver le client"}
      </Bouton>
    </form>
  );
}
