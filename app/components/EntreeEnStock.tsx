"use client";

import { useState } from "react";
import { estPerissable, lireNombre } from "@/src/lib/boutiqueLogique";
import { coutUnitairePropose } from "@/src/lib/coutMoyen";

export type ArticleEntree = {
  id: string;
  nom: string;
  reference: string;
  unite: string;
  categorie: string;
  /** Une fourniture qu'on transforme, par opposition à un article revendu. */
  composant?: boolean;
  /** Dernier prix d'achat connu : la proposition de coût quand la dépense n'en donne pas. */
  prix_achat?: number | string | null;
};

/** Ce que la catégorie de dépense rend probable — sans jamais l'imposer. */
export type Privilegie = "composants" | "vendables";

/**
 * `cout` n'est retenu que si on l'a tapé (`coutTouche`) : tant qu'on n'y a pas
 * touché, le champ montre la proposition et la suit quand la quantité change.
 */
export type LigneEntree = { quantite: string; peremption: string; cout?: string; coutTouche?: boolean };

/** Le coût affiché — et envoyé — pour une ligne : la saisie, sinon la proposition. */
export function coutDeLigne(
  article: ArticleEntree,
  ligne: LigneEntree,
  contexte: { montantDepenseHt?: number | null; nbLignes: number },
): string {
  if (ligne.coutTouche) return ligne.cout ?? "";
  const propose = coutUnitairePropose({
    montantDepenseHt: contexte.montantDepenseHt ?? null,
    nbArticlesDepense: contexte.nbLignes,
    quantite: lireNombre(ligne.quantite),
    prixAchat: article.prix_achat === null || article.prix_achat === undefined ? null : Number(article.prix_achat),
  });
  return propose === null ? "" : String(propose);
}

/**
 * « Entrée en stock » d'une dépense de matières ou de marchandises.
 *
 * Facultatif : on coche ce qui est arrivé, on donne la quantité, et pour une
 * denrée la date de péremption. Aucune écriture comptable n'en découle —
 * l'achat est déjà passé en charge sur 4000 ou 4200 ; le stock ne compte que
 * des quantités.
 *
 * Selon la catégorie de dépense, la liste PRIVILÉGIE les composants ou les
 * articles revendables : les probables d'abord, les autres à la suite sous un
 * intertitre. Un filtre, pas une exclusion — une puce NFC achetée sur une
 * facture de marchandises reste atteignable.
 *
 * Les champs portent les noms attendus par l'action serveur (`article_<id>`,
 * `quantite_<id>`, `peremption_<id>`) : dans un formulaire, ils partent seuls.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.16)";

export default function EntreeEnStock({
  articles,
  lignes,
  onChange,
  privilegie,
  montantDepenseHt,
}: {
  articles: ArticleEntree[];
  lignes: Record<string, LigneEntree>;
  onChange: (lignes: Record<string, LigneEntree>) => void;
  privilegie?: Privilegie;
  /**
   * Montant HT de la dépense : si elle ne porte qu'un article, le coût
   * unitaire proposé est ce montant divisé par la quantité.
   */
  montantDepenseHt?: number | null;
}) {
  const [recherche, setRecherche] = useState("");

  if (articles.length === 0) {
    return (
      <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>
        Le catalogue ne contient encore aucun article actif.
      </p>
    );
  }

  const q = recherche.trim().toLowerCase();
  const visibles = articles.filter(
    (a) =>
      lignes[a.id] !== undefined ||
      !q ||
      `${a.nom} ${a.reference}`.toLowerCase().includes(q)
  );

  const attendu = (a: ArticleEntree) =>
    privilegie === "composants" ? a.composant === true
    : privilegie === "vendables" ? a.composant !== true
    : true;

  // Une ligne déjà cochée reste où on l'a mise : on ne déplace pas sous la main.
  const probables = visibles.filter((a) => attendu(a) || lignes[a.id] !== undefined);
  const autres = visibles.filter((a) => !attendu(a) && lignes[a.id] === undefined);

  function basculer(id: string, coche: boolean) {
    const suite = { ...lignes };
    if (coche) suite[id] = { quantite: "", peremption: "", cout: "", coutTouche: false };
    else delete suite[id];
    onChange(suite);
  }

  function majLigne(id: string, champ: "quantite" | "peremption" | "cout", valeur: string) {
    onChange({
      ...lignes,
      [id]: { ...lignes[id], [champ]: valeur, ...(champ === "cout" ? { coutTouche: true } : {}) },
    });
  }

  const nbLignes = Object.keys(lignes).length;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <input
        type="search"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Chercher un article…"
        aria-label="Chercher un article"
        style={{
          width: "100%", minHeight: 48, padding: "12px 14px", border: BORDURE,
          borderRadius: 14, fontSize: 16, color: MARINE, backgroundColor: "#FFFFFF",
          fontFamily: "inherit", boxSizing: "border-box",
        }}
      />

      <div style={{ display: "grid", gap: 10, maxHeight: 420, overflowY: "auto" }}>
        {[...probables, ...autres].map((a, rang) => {
          // L'intertitre s'intercale devant le premier « autre » : la liste
          // reste entière, elle est seulement rangée.
          const separateur = autres.length > 0 && rang === probables.length;
          const ligne = lignes[a.id];
          const coche = ligne !== undefined;
          return (
            <div key={`bloc-${a.id}`}>
            {separateur && (
              <p style={{ color: SOUS, fontSize: 13, margin: "4px 0 10px" }}>
                {privilegie === "composants"
                  ? "Autres articles du catalogue — ceux que vous revendez tels quels :"
                  : "Autres articles du catalogue — les fournitures que vous transformez :"}
              </p>
            )}
            <div
              key={a.id}
              style={{
                border: coche ? "1px solid #2E8B7E" : BORDURE,
                backgroundColor: coche ? "#F6FBF9" : "#FFFFFF",
                borderRadius: 14, padding: 12,
              }}
            >
              <label
                htmlFor={`article_${a.id}`}
                style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  id={`article_${a.id}`}
                  name={`article_${a.id}`}
                  checked={coche}
                  onChange={(e) => basculer(a.id, e.target.checked)}
                  style={{ width: 22, height: 22, flexShrink: 0 }}
                />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", color: MARINE, fontSize: 15, fontWeight: 600 }}>
                    {a.nom}
                  </span>
                  <span style={{ display: "block", color: SOUS, fontSize: 12 }}>{a.reference}</span>
                </span>
              </label>

              {coche && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                  <div>
                    <label
                      htmlFor={`quantite_${a.id}`}
                      style={{ display: "block", fontSize: 12, color: SOUS, marginBottom: 4 }}
                    >
                      Quantité ({a.unite})
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      id={`quantite_${a.id}`}
                      name={`quantite_${a.id}`}
                      value={ligne.quantite}
                      onChange={(e) => majLigne(a.id, "quantite", e.target.value)}
                      placeholder="0"
                      style={{
                        width: 110, minHeight: 48, padding: "10px 12px", border: BORDURE,
                        borderRadius: 12, fontSize: 16, fontWeight: 700, color: MARINE,
                        backgroundColor: "#FFFFFF", fontFamily: "inherit", textAlign: "center",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`cout_${a.id}`}
                      style={{ display: "block", fontSize: 12, color: SOUS, marginBottom: 4 }}
                    >
                      Coût unitaire HT (CHF)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      id={`cout_${a.id}`}
                      name={`cout_${a.id}`}
                      value={coutDeLigne(a, ligne, { montantDepenseHt, nbLignes })}
                      onChange={(e) => majLigne(a.id, "cout", e.target.value)}
                      placeholder="à saisir"
                      style={{
                        width: 130, minHeight: 48, padding: "10px 12px", border: BORDURE,
                        borderRadius: 12, fontSize: 16, color: MARINE,
                        backgroundColor: "#FFFFFF", fontFamily: "inherit", textAlign: "center",
                      }}
                    />
                    {coutDeLigne(a, ligne, { montantDepenseHt, nbLignes }) === "" && (
                      <span style={{ display: "block", fontSize: 12, color: "#A8453A", marginTop: 4 }}>
                        coût non renseigné
                      </span>
                    )}
                  </div>

                  {estPerissable(a.categorie) && (
                    <div>
                      <label
                        htmlFor={`peremption_${a.id}`}
                        style={{ display: "block", fontSize: 12, color: SOUS, marginBottom: 4 }}
                      >
                        À consommer avant le
                      </label>
                      <input
                        type="date"
                        id={`peremption_${a.id}`}
                        name={`peremption_${a.id}`}
                        value={ligne.peremption}
                        onChange={(e) => majLigne(a.id, "peremption", e.target.value)}
                        style={{
                          minHeight: 48, padding: "10px 12px", border: BORDURE,
                          borderRadius: 12, fontSize: 16, color: MARINE,
                          backgroundColor: "#FFFFFF", fontFamily: "inherit",
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
