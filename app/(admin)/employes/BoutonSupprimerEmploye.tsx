"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { supprimerEmploye } from "./actions";

export default function BoutonSupprimerEmploye({ id, nom }: { id: string; nom: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    const ok = window.confirm(
      `Supprimer définitivement ${nom} ?\n\n` +
      `Cela efface aussi tout son historique RH (fiches de salaire, planning, ` +
      `vacances, timbrages). Action irréversible.`
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await supprimerEmploye(id);
      if (res.error) alert("Erreur : " + res.error);
      else router.refresh();
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="px-3 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
      style={{ backgroundColor: "#C0392B" }}
    >
      {isPending ? "…" : "🗑️ Supprimer"}
    </button>
  );
}