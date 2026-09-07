"use client";

import { useEffect, useRef } from "react";
import type { EtatFormulaire } from "@/src/lib/etatFormulaire";

/**
 * Message de refus d'un formulaire, au-dessus des champs.
 *
 * Même présentation que les autres refus de l'application (départ du check-in,
 * dépenses) : fond rose, texte grenat, pastille d'avertissement.
 *
 * Quand le refus nomme un champ, on l'amène à l'écran et on y place le focus —
 * la personne repart de l'endroit exact où ça coince.
 */
export default function AlerteFormulaire({ etat }: { etat: EtatFormulaire }) {
  const zone = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!etat.erreur) return;

    const cible = etat.champ
      ? (document.getElementById(etat.champ) as HTMLElement | null)
      : null;

    (cible ?? zone.current)?.scrollIntoView({ block: "center", behavior: "smooth" });
    cible?.focus({ preventScroll: true });
  }, [etat.erreur, etat.champ]);

  if (!etat.erreur) return null;

  return (
    <p
      ref={zone}
      role="alert"
      aria-live="assertive"
      style={{
        backgroundColor: "#FDECEC",
        color: "#8A1F1F",
        border: "1px solid #F0C2C2",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
        fontWeight: 600,
        margin: "0 0 16px",
      }}
    >
      ⚠️ {etat.erreur}
    </p>
  );
}

/**
 * Attributs à poser sur un champ pour le marquer fautif : bordure grenat et
 * `aria-invalid`, pour l'œil comme pour le lecteur d'écran.
 */
export function marqueChamp(
  etat: EtatFormulaire,
  nom: string,
  style: React.CSSProperties
): { id: string; name: string; style: React.CSSProperties; "aria-invalid"?: true } {
  const fautif = !!etat.erreur && etat.champ === nom;
  return {
    id: nom,
    name: nom,
    style: fautif
      ? { ...style, border: "1px solid #A8453A", backgroundColor: "#FFF7F7" }
      : style,
    ...(fautif ? { "aria-invalid": true as const } : {}),
  };
}

/** Même marquage, pour les formulaires habillés en classes plutôt qu'en styles. */
export function marqueChampClasse(
  etat: EtatFormulaire,
  nom: string,
  classe: string
): { id: string; name: string; className: string; "aria-invalid"?: true } {
  const fautif = !!etat.erreur && etat.champ === nom;
  return {
    id: nom,
    name: nom,
    className: fautif ? `${classe} border-2 border-[#A8453A] bg-[#FFF7F7]` : classe,
    ...(fautif ? { "aria-invalid": true as const } : {}),
  };
}
