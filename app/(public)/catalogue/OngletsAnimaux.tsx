"use client";

import { useEffect, useRef } from "react";
import type { OngletAnimal } from "@/src/lib/filtresCatalogueLogique";

/**
 * La rangée d'onglets d'animal, et le seul geste qu'elle fait d'elle-même :
 * ramener l'onglet actif dans la zone visible à l'ouverture.
 *
 * ── POURQUOI CE COMPOSANT EXISTE SÉPARÉMENT (APP 31) ──────────────────────
 *
 * La rangée vivait dans `CatalogueBoutique`. Le recentrage demande une `ref` et
 * un effet, et les mettre là aurait ajouté deux hooks à un composant qui en
 * porte déjà beaucoup, pour une préoccupation qui n'est pas la sienne : lui
 * décide QUELS onglets existent, celui-ci décide seulement ce qu'on en voit.
 *
 * Aucune règle n'a déménagé : `ongletsAnimaux` et `ongletRetenu` restent dans
 * `filtresCatalogueLogique`, et ce composant reçoit la liste toute faite.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.12)";
const CIBLE = 44;

export default function OngletsAnimaux({
  onglets,
  surChoix,
}: {
  onglets: OngletAnimal[];
  /** L'animal choisi, ou null pour « Tous ». */
  surChoix: (animal: string | null) => void;
}) {
  const actif = useRef<HTMLButtonElement | null>(null);

  /*
   * À L'OUVERTURE, ET UNE SEULE FOIS.
   *
   * Sur un téléphone, sept onglets ne tiennent pas sur 375 px : quelqu'un qui
   * ouvre un lien vers « Rongeurs » voit la rangée commencer à « Tous », et rien
   * ne lui dit que l'onglet allumé est plus loin à droite. Il croit la page
   * cassée — la grille montre des rongeurs, mais aucun onglet visible n'est
   * actif.
   *
   * Le tableau de dépendances est VIDE, délibérément : au clic, le doigt est
   * déjà sur l'onglet choisi, et le faire glisser sous le doigt serait une
   * surprise désagréable. On ne recentre donc qu'à l'arrivée.
   */
  useEffect(() => {
    const bouton = actif.current;
    // jsdom, et certains navigateurs anciens, ne l'implémentent pas. Une rangée
    // qui ne se recentre pas reste utilisable ; une page qui plante, non.
    if (!bouton?.scrollIntoView) return;

    // « Moins de mouvement » est une demande d'accessibilité, pas une préférence
    // esthétique : un défilement animé peut déclencher un vertige.
    const moinsDeMouvement =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    bouton.scrollIntoView({
      // `nearest` sur les DEUX axes, et c'est le cœur du geste :
      //   • en vertical, il ne fait RIEN tant que la rangée est déjà à l'écran,
      //     donc la page ne saute pas sous les yeux de la cliente ;
      //   • en horizontal, il déplace du minimum nécessaire — et donc pas du
      //     tout sur un ordinateur où les sept onglets tiennent en largeur.
      // `center` aurait recentré même quand tout était déjà visible.
      block: "nearest",
      inline: "nearest",
      behavior: moinsDeMouvement ? "auto" : "smooth",
    });
  }, []);

  return (
    <nav
      aria-label="Choisir un animal"
      style={{
        display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4,
        // Le défilement reste DANS la barre : la page, elle, ne bouge pas.
        scrollbarWidth: "thin", WebkitOverflowScrolling: "touch",
      }}
    >
      {onglets.map((o) => (
        <button
          key={o.valeur ?? "tous"}
          type="button"
          ref={o.actif ? actif : undefined}
          aria-pressed={o.actif}
          onClick={() => surChoix(o.valeur)}
          style={{
            flexShrink: 0,
            minHeight: CIBLE,
            padding: "8px 16px",
            borderRadius: 999,
            border: o.actif ? "1px solid #C9A84C" : BORDURE,
            background: o.actif ? "#F4EAC9" : "#FFFFFF",
            color: o.actif ? "#6E5410" : MARINE,
            fontSize: 15,
            fontWeight: o.actif ? 700 : 500,
            fontFamily: "inherit",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {o.libelle}{" "}
          <span style={{ color: o.actif ? "#6E5410" : SOUS, fontWeight: 500 }}>
            ({o.nombre})
          </span>
        </button>
      ))}
    </nav>
  );
}
