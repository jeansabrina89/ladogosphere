"use client";

import { useState } from "react";
import { POSTES } from "@/src/lib/permissionsCatalogue";

/**
 * Les trois raccourcis de permissions.
 *
 * Ce ne sont PAS des rôles : rien ne s'enregistre, rien ne se relit, et
 * l'application ne demandera jamais « est-elle vendeuse ? ». Ils cochent les
 * cases habituelles d'un poste, et on peut en décocher une juste après — ce
 * sont des cases, ils les pré-remplissent.
 *
 * Ils ne DÉcochent rien non plus : quelqu'un qui a déjà d'autres permissions
 * ne les perd pas parce qu'on a voulu lui ajouter le comptoir. Chaque poste
 * contient le précédent, comme le métier se construit.
 *
 * Deux permissions n'y figurent JAMAIS : « Factures » et « Atelier ». Elles
 * ouvrent le carnet de comptes et la réserve de fabrication — ce sont des
 * décisions qui se prennent une par une, pas des cases qu'on ramasse au
 * passage.
 */

export default function RaccourciVendeuse() {
  const [fait, setFait] = useState<string | null>(null);

  function cocher(cases: readonly string[]) {
    let ajoutees = 0;
    for (const nom of cases) {
      const champ = document.querySelector<HTMLInputElement>(`input[name="${nom}"]`);
      if (champ && !champ.checked) {
        champ.click();
        ajoutees += 1;
      }
    }
    return ajoutees;
  }

  return (
    <div className="rounded-xl border border-[rgba(27,43,94,0.14)] bg-[#FBF9F5] p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgba(27,43,94,0.5)]">
        Partir d&apos;un poste
      </p>

      <div className="flex flex-col gap-3">
        {POSTES.map(({ cle, bouton, cases, aide }) => (
          <div key={cle} className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setFait(`${cle}:${cocher(cases)}`)}
              className="min-h-[44px] shrink-0 rounded-xl border border-[rgba(27,43,94,0.14)] bg-white px-4 text-sm font-semibold text-[#1B2B5E]"
            >
              {bouton}
            </button>
            <p className="min-w-[200px] flex-1 text-xs text-[rgba(27,43,94,0.55)]">{aide}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-[rgba(27,43,94,0.55)]">
        Rien n&apos;est décoché, et « Factures » et « Atelier » ne sont jamais cochés
        automatiquement. Ajustez case par case avant d&apos;enregistrer.
      </p>

      {fait && (
        <p role="status" className="mt-2 text-xs font-semibold text-[#1F6E5B]">
          {fait.endsWith(":0")
            ? "Ces cases étaient déjà cochées : rien n'a changé."
            : `${fait.split(":")[1]} case(s) cochée(s). Vérifiez-les, puis enregistrez.`}
        </p>
      )}
    </div>
  );
}
