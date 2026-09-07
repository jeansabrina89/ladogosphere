import React from "react";
import { Svg, G, Rect, Line, Path, Text } from "@react-pdf/renderer";

// Les types publics de @react-pdf ne déclarent pas la taille ni la graisse de
// police sur un <Text> SVG, alors que le moteur les honore. On les rend
// utilisables ici, à cet unique endroit, plutôt que d'éparpiller des casts.
const TexteSvg = Text as unknown as React.ComponentType<{
  x: number;
  y: number;
  fill?: string;
  style?: { fontSize?: number; fontFamily?: string; fontWeight?: "bold" | "normal" };
  children?: React.ReactNode;
}>;

// swissqrbill produit le bulletin de versement en SVG. @react-pdf/renderer sait
// dessiner des primitives SVG, mais pas avaler une chaîne SVG : ce module fait
// la traduction, et rien d'autre.
//
// Le bulletin n'emploie que six éléments — svg, g, rect, line, path, text/tspan —
// et trois unités : mm, pt et px. Tout est ramené en points typographiques, la
// seule unité dans laquelle @react-pdf raisonne. Un <svg> imbriqué n'ayant
// jamais de viewBox ici, il équivaut à une translation : on le rend en <G>.

const PT_PAR_MM = 72 / 25.4;

/** "67mm" → 189.92 ; "30pt" → 30 ; "229.08" → 229.08. */
export function versPoints(valeur: string | undefined, defaut = 0): number {
  if (valeur === undefined || valeur === null || valeur === "") return defaut;
  const v = String(valeur).trim();
  if (v.endsWith("%")) return defaut;
  const nombre = parseFloat(v);
  if (Number.isNaN(nombre)) return defaut;
  if (v.endsWith("mm")) return nombre * PT_PAR_MM;
  return nombre; // pt et px : unités utilisateur du bulletin
}

type Noeud = {
  tag: string;
  attrs: Record<string, string>;
  enfants: Noeud[];
  texte: string;
};

const RE_BALISE = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
const RE_ATTR = /([\w:-]+)\s*=\s*"([^"]*)"/g;

function lireAttributs(brut: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of brut.matchAll(RE_ATTR)) attrs[m[1]] = m[2];
  return attrs;
}

/** Analyse la chaîne SVG en arbre. Suffisant pour ce que swissqrbill émet. */
export function analyserSvg(svg: string): Noeud | null {
  const racine: Noeud = { tag: "#racine", attrs: {}, enfants: [], texte: "" };
  const pile: Noeud[] = [racine];
  let position = 0;

  RE_BALISE.lastIndex = 0;
  for (const m of svg.matchAll(RE_BALISE)) {
    const [entier, fermante, tag, attrsBruts, autoFermante] = m;
    const debut = m.index ?? 0;

    const texte = svg.slice(position, debut);
    if (texte.trim() !== "") pile[pile.length - 1].texte += texte;
    position = debut + entier.length;

    if (fermante) {
      if (pile.length > 1) pile.pop();
      continue;
    }

    const noeud: Noeud = { tag, attrs: lireAttributs(attrsBruts), enfants: [], texte: "" };
    pile[pile.length - 1].enfants.push(noeud);
    if (!autoFermante) pile.push(noeud);
  }

  return racine.enfants[0] ?? null;
}

function couleur(v: string | undefined, defaut?: string): string | undefined {
  if (!v || v === "none") return defaut;
  return v;
}

function rendreEnfants(noeuds: Noeud[], cle: string): React.ReactNode[] {
  return noeuds.map((n, i) => rendre(n, `${cle}-${i}`)).filter(Boolean) as React.ReactNode[];
}

function rendre(n: Noeud, cle: string): React.ReactNode {
  const a = n.attrs;

  switch (n.tag) {
    // Un <svg> imbriqué sans viewBox n'est qu'un décalage d'origine.
    case "svg":
    case "g": {
      const dx = versPoints(a.x);
      const dy = versPoints(a.y);
      const transform = dx || dy ? `translate(${dx}, ${dy})` : undefined;
      return (
        <G key={cle} transform={transform}>
          {rendreEnfants(n.enfants, cle)}
        </G>
      );
    }

    case "rect": {
      // width/height en % : le fond blanc de la page, inutile dans le PDF.
      if ((a.width ?? "").endsWith("%") || (a.height ?? "").endsWith("%")) return null;
      return (
        <Rect
          key={cle}
          x={versPoints(a.x)}
          y={versPoints(a.y)}
          width={versPoints(a.width)}
          height={versPoints(a.height)}
          fill={couleur(a.fill, "black")}
        />
      );
    }

    case "line":
      return (
        <Line
          key={cle}
          x1={versPoints(a.x1)}
          y1={versPoints(a.y1)}
          x2={versPoints(a.x2)}
          y2={versPoints(a.y2)}
          strokeWidth={versPoints(a["stroke-width"], 1)}
          stroke={couleur(a.stroke, "black")}
        />
      );

    case "path":
      return (
        <Path
          key={cle}
          d={a.d ?? ""}
          fill={couleur(a.fill, "black")}
          stroke={couleur(a.stroke)}
        />
      );

    // Chaque tspan porte sa propre taille de police, ce qu'un <Text> SVG ne
    // sait pas faire varier en son sein : on émet donc un <Text> par tspan,
    // positionné par ses x/y absolus — c'est ainsi que le bulletin est écrit.
    case "text":
      return <React.Fragment key={cle}>{rendreEnfants(n.enfants, cle)}</React.Fragment>;

    case "tspan": {
      const contenu = n.texte.trim();
      if (contenu === "") return null;
      // dy décale la ligne de base par rapport à y.
      return (
        <TexteSvg
          key={cle}
          x={versPoints(a.x)}
          y={versPoints(a.y) + versPoints(a.dy)}
          fill={couleur(a.fill, "black")}
          style={{
            fontSize: versPoints(a["font-size"], 8),
            fontFamily: a["font-weight"] === "bold" ? "Helvetica-Bold" : "Helvetica",
            fontWeight: a["font-weight"] === "bold" ? "bold" : "normal",
          }}
        >
          {contenu}
        </TexteSvg>
      );
    }

    default:
      return null;
  }
}

/**
 * Convertit le SVG du bulletin QR en un <Svg> @react-pdf de 210 × 105 mm,
 * la taille normalisée du bulletin de versement suisse.
 */
export function BulletinQr({ svg }: { svg: string }) {
  const racine = analyserSvg(svg);
  if (!racine) return null;

  const largeur = 210 * PT_PAR_MM;
  const hauteur = 105 * PT_PAR_MM;

  return (
    <Svg width={largeur} height={hauteur} viewBox={`0 0 ${largeur} ${hauteur}`}>
      {rendreEnfants(racine.enfants, "qr")}
    </Svg>
  );
}
