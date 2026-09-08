"use client";

import { useState } from "react";

const POSTE_APPRENTI = "Apprenti-e Gardien-ne d'animaux";

const JOURS_COURS: { v: string; label: string }[] = [
  { v: "", label: "Aucun" },
  { v: "1", label: "Lundi" },
  { v: "2", label: "Mardi" },
  { v: "3", label: "Mercredi" },
  { v: "4", label: "Jeudi" },
  { v: "5", label: "Vendredi" },
];

type Initial = {
  poste: string;
  poste_autre: string;
  taux_travail: number;
  salaire_base: number | null;
  jour_cours: number | null;
  salaire_annee_1: number | null;
  salaire_annee_2: number | null;
  salaire_annee_3: number | null;
  annee_apprentissage: number | null;
};

export default function ChampsRh({
  inputClass,
  initial,
}: {
  inputClass: string;
  initial: Initial;
}) {
  const [poste, setPoste] = useState(initial.poste || "Auxiliaire");
  const estApprenti = poste === POSTE_APPRENTI;

  return (
    <>
      <div className="mb-4">
        <label className="block font-semibold mb-1 text-sm">Poste</label>
        <select
          name="poste"
          value={poste}
          onChange={(e) => setPoste(e.target.value)}
          className={inputClass}
        >
          <option value="Gardien-ne d'animaux CFC">Gardien-ne d&apos;animaux CFC</option>
          <option value={POSTE_APPRENTI}>Apprenti-e Gardien-ne d&apos;animaux</option>
          <option value="Auxiliaire">Auxiliaire</option>
          <option value="Autre">Autre</option>
        </select>
      </div>

      <div className="mb-4">
        <label className="block font-semibold mb-1 text-sm">Précision poste (si &quot;Autre&quot;)</label>
        <input
          name="poste_autre"
          type="text"
          defaultValue={initial.poste_autre || ""}
          placeholder="Ex: Responsable administrative"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-semibold mb-1 text-sm">Taux de travail</label>
          <select name="taux_travail" defaultValue={initial.taux_travail} className={inputClass}>
            <option value="100">100% — 5j/semaine</option>
            <option value="90">90% — alternance 4/5j</option>
            <option value="80">80% — 4j/semaine</option>
            <option value="70">70% — alternance 3/4j</option>
            <option value="60">60% — 3j/semaine</option>
            <option value="50">50% — alternance 2/3j</option>
            <option value="40">40% — 2j/semaine</option>
            <option value="30">30% — alternance 1/2j</option>
            <option value="20">20% — 1j/semaine</option>
            <option value="10">10% — alternance 0/1j</option>
          </select>
        </div>
        {!estApprenti && (
          <div>
            <label className="block font-semibold mb-1 text-sm">Salaire base 100% (CHF)</label>
            <input
              name="salaire_base"
              type="number"
              step="50"
              defaultValue={initial.salaire_base ?? ""}
              className={inputClass}
            />
          </div>
        )}
      </div>

      {estApprenti && (
        <div className="mt-4 p-4 rounded-xl" style={{ background: "#F5F0E8" }}>
          <p className="font-semibold text-sm mb-3" style={{ color: "#1B2B5E" }}>
            🎓 Apprentissage
          </p>

          <div className="mb-4">
            <label className="block font-semibold mb-1 text-sm">Jour de cours</label>
            <select
              name="jour_cours"
              defaultValue={initial.jour_cours != null ? String(initial.jour_cours) : ""}
              className={inputClass}
            >
              {JOURS_COURS.map((j) => (
                <option key={j.v} value={j.v}>
                  {j.label}
                </option>
              ))}
            </select>
            <p className="text-xs mt-1" style={{ color: "rgba(27,43,94,0.55)" }}>
              Ce jour apparaît comme « cours » sur le planning et compte comme un jour de travail.
            </p>
          </div>

          <label className="block font-semibold mb-1 text-sm">
            Salaire mensuel prévu par année (CHF, base 100%)
          </label>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: "rgba(27,43,94,0.6)" }}>
                1ʳᵉ année
              </label>
              <input name="salaire_annee_1" type="number" step="50" defaultValue={initial.salaire_annee_1 ?? ""} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "rgba(27,43,94,0.6)" }}>
                2ᵉ année
              </label>
              <input name="salaire_annee_2" type="number" step="50" defaultValue={initial.salaire_annee_2 ?? ""} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "rgba(27,43,94,0.6)" }}>
                3ᵉ année
              </label>
              <input name="salaire_annee_3" type="number" step="50" defaultValue={initial.salaire_annee_3 ?? ""} className={inputClass} />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1 text-sm">Année en cours</label>
            <select
              name="annee_apprentissage"
              defaultValue={initial.annee_apprentissage != null ? String(initial.annee_apprentissage) : "1"}
              className={inputClass}
            >
              <option value="1">1ʳᵉ année</option>
              <option value="2">2ᵉ année</option>
              <option value="3">3ᵉ année</option>
            </select>
          </div>
          <p className="text-xs mt-2" style={{ color: "rgba(27,43,94,0.55)" }}>
            Le salaire de l&apos;année en cours devient le salaire appliqué. Les fiches déjà émises ne changent pas.
          </p>
        </div>
      )}
    </>
  );
}
