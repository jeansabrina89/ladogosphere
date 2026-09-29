import Link from "next/link";
import { Dog, Cat, Rat, Bird, Turtle, Squirrel, PawPrint } from "lucide-react";
import Carte from "@/app/components/ui/Carte";
import type { Encadre, Miette } from "@/src/lib/niveauxCatalogue";

/**
 * Les encadrés de la boutique : un par animal, puis un par rayon (APP 49).
 *
 * Des LIENS, et rien d'autre. Toute la surface de l'encadré est cliquable —
 * viser une icône ou trois mots au doigt est un exercice, pas une navigation.
 * Le focus reste visible : le contour du navigateur n'est pas retiré.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.58)";
const VERT = "#1F6E5B";

/**
 * Une icône par animal.
 *
 * Six viennent de `lucide-react`, déjà installé. Deux n'existent pas et
 * empruntent la plus proche :
 *
 *   • le FURET — aucune icône de mustélidé — prend la patte générique. Un rat
 *     aurait menti sur l'animal, et le furet est déjà celui qu'on range mal ;
 *   • la FAUNE SAUVAGE prend l'écureuil, qui est l'un des trois animaux nommés
 *     par la décision (écureuils, hérissons, oiseaux du jardin).
 *
 * Le REPTILE prend la tortue : c'en est un, même si la boutique sert aussi des
 * lézards — et `Snake` comme `Lizard` n'existent pas dans la bibliothèque.
 */
const ICONES: Record<string, React.ComponentType<{ size?: number; color?: string; "aria-hidden"?: boolean }>> = {
  chien: Dog,
  chat: Cat,
  rongeur: Rat,
  furet: PawPrint,
  reptile: Turtle,
  oiseau: Bird,
  faune: Squirrel,
};

function texteNombre(n: number): string {
  return `${n} article${n > 1 ? "s" : ""}`;
}

/**
 * La grille : deux colonnes sur un téléphone, davantage ensuite.
 *
 * `minmax(0, 1fr)` et non `1fr` : sans le zéro, un libellé long — « Couchages,
 * coussins et paniers » — pousse sa colonne et déborde de la page.
 */
function Grille({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid", gap: 12,
      gridTemplateColumns: "repeat(auto-fill, minmax(min(160px, 100%), 1fr))",
      minWidth: 0,
    }}>
      {children}
    </div>
  );
}

function Encadre({ encadre, icone }: { encadre: Encadre; icone?: React.ReactNode }) {
  return (
    <Link
      href={encadre.lien}
      style={{ textDecoration: "none", display: "block", borderRadius: 16 }}
    >
      <Carte>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: 6, textAlign: "center", minHeight: 96, justifyContent: "center",
        }}>
          {icone}
          <span style={{ color: MARINE, fontSize: 15.5, fontWeight: 700, lineHeight: 1.3 }}>
            {encadre.libelle}
          </span>
          <span style={{ color: SOUS, fontSize: 13.5 }}>{texteNombre(encadre.nombre)}</span>
        </div>
      </Carte>
    </Link>
  );
}

export function EncadresAnimaux({ encadres }: { encadres: Encadre[] }) {
  return (
    <Grille>
      {encadres.map((e) => {
        const Icone = ICONES[e.valeur] ?? PawPrint;
        return (
          <Encadre
            key={e.valeur}
            encadre={e}
            icone={<Icone size={30} color={VERT} aria-hidden />}
          />
        );
      })}
    </Grille>
  );
}

export function EncadresRayons({ encadres }: { encadres: Encadre[] }) {
  // Pas d'icône : vingt-deux rayons n'ont pas vingt-deux symboles évidents, et
  // une icône approximative se lit moins bien qu'un libellé seul.
  return (
    <Grille>
      {encadres.map((e) => <Encadre key={e.valeur} encadre={e} />)}
    </Grille>
  );
}

/** Le fil d'Ariane, qui remplace les onglets dès qu'on est dans la liste. */
export function FilAriane({ miettes }: { miettes: Miette[] }) {
  if (miettes.length === 0) return null;
  return (
    <nav aria-label="Fil d'Ariane" style={{ margin: "0 0 14px" }}>
      <ol style={{
        display: "flex", flexWrap: "wrap", gap: 6, listStyle: "none",
        margin: 0, padding: 0, color: SOUS, fontSize: 14.5,
      }}>
        {miettes.map((m, i) => (
          <li key={`${m.libelle}-${i}`} style={{ display: "flex", gap: 6 }}>
            {i > 0 && <span aria-hidden>›</span>}
            {m.lien ? (
              <Link href={m.lien} style={{ color: VERT, fontWeight: 600, textDecoration: "underline" }}>
                {m.libelle}
              </Link>
            ) : (
              <span aria-current="page" style={{ color: MARINE, fontWeight: 700 }}>
                {m.libelle}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * La recherche, en formulaire GET.
 *
 * Elle vivait dans l'état du navigateur : le lien d'une recherche ne se
 * partageait pas, et le retour arrière la perdait. Elle passe dans l'adresse
 * sous « q », comme sur le site (SITE 38) — et un formulaire GET fonctionne
 * sans JavaScript.
 */
export function ChampRecherche({ q, animal }: { q: string; animal?: string | null }) {
  return (
    <form action="/catalogue" method="get" role="search" style={{ margin: "0 0 16px" }}>
      {/* L'animal SUIT la recherche : on cherche dans le rayon où l'on est. */}
      {animal && <input type="hidden" name="animal" value={animal} />}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Rechercher un article…"
          aria-label="Rechercher un article"
          style={{
            flex: "1 1 220px", minWidth: 0, minHeight: 44, padding: "10px 14px",
            borderRadius: 12, border: "1px solid rgba(27,43,94,0.16)",
            fontSize: 16, color: MARINE, backgroundColor: "#FFFFFF",
            fontFamily: "inherit", boxSizing: "border-box",
          }}
        />
        <button type="submit" style={{
          minHeight: 44, padding: "0 18px", borderRadius: 12, border: "none",
          backgroundColor: VERT, color: "#FFFFFF", fontSize: 15, fontWeight: 700,
          fontFamily: "inherit", cursor: "pointer",
        }}>
          Rechercher
        </button>
      </div>
    </form>
  );
}
