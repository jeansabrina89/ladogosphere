"use client";

import { useActionState } from "react";
import { modifierMesInitiales, type EtatInitiales } from "./actionsInitiales";

const ETAT_INITIAL: EtatInitiales = { erreur: null, enregistrees: null };

/** Les initiales de l'administratrice, celles qui s'affichent à côté de ses gestes. */
export default function MesInitiales({ initiales }: { initiales: string | null }) {
  const [etat, action, enCours] = useActionState(modifierMesInitiales, ETAT_INITIAL);

  return (
    <form action={action} className="mb-6 flex flex-wrap items-end gap-3"
      style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: "18px", padding: "20px" }}>
      <div>
        <label htmlFor="mes-initiales" className="block font-bold text-sm" style={{ color: "#1B2B5E" }}>
          Mes initiales
        </label>
        <p className="text-xs mb-2" style={{ color: "rgba(27,43,94,0.45)" }}>
          Affichées à côté de chacun de mes gestes.
        </p>
        <input id="mes-initiales" name="initiales" type="text" required minLength={2} maxLength={3}
          pattern="[A-Za-z]{2,3}" defaultValue={initiales ?? ""}
          className="rounded-xl p-2 border border-[rgba(27,43,94,0.18)] uppercase w-24" />
      </div>
      <button type="submit" disabled={enCours}
        className="rounded-xl px-4 py-2 text-sm font-semibold"
        style={{ backgroundColor: "#1B2B5E", color: "#FFFFFF", opacity: enCours ? 0.6 : 1 }}>
        Enregistrer
      </button>
      {etat.erreur && <p role="alert" className="w-full text-sm" style={{ color: "#B42318" }}>{etat.erreur}</p>}
      {etat.enregistrees && <p className="w-full text-sm" style={{ color: "#4AAEA0" }}>Initiales enregistrées : {etat.enregistrees}</p>}
    </form>
  );
}
