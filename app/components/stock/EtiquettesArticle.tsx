"use client";

import { useState, type CSSProperties } from "react";
import {
  CASES,
  GROUPES,
  LIBELLE_TAILLE_ARTICLE,
  MARQUEUR_ETIQUETTES,
  TAILLES_ARTICLE,
  champVersValeurs,
  champsDeCategorieEtAnimaux,
  valeursPourAnimaux,
  libelleValeur,
  normaliserCouleur,
  valeursVersChamp,
  type ChampCase,
  type GroupeEtiquette,
} from "@/src/lib/etiquettesArticles";

/**
 * « Étiquettes pour les filtres » — la section de la fiche article.
 *
 * Des pastilles, pas des listes déroulantes : on voit d'un coup d'œil ce qui
 * est coché et ce qui ne l'est pas, et cocher trois âges demande trois clics
 * au lieu d'un menu ouvert trois fois.
 *
 * La catégorie décide de ce qui s'affiche — demander la protéine d'une laisse
 * n'a pas de sens, et une fiche qui demande tout ne se remplit jamais. Ce qui
 * est masqué n'est PAS effacé : chaque liste part dans un champ caché, à sa
 * valeur actuelle. Un article mal classé puis reclassé retrouve ses
 * étiquettes.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.16)";

const sPastille = (actif: boolean): CSSProperties => ({
  minHeight: 44,
  padding: "8px 14px",
  borderRadius: 999,
  border: actif ? "1px solid #C9A84C" : BORDURE,
  background: actif ? "#F4EAC9" : "#FFFFFF",
  color: actif ? "#6E5410" : MARINE,
  fontSize: 15,
  fontWeight: actif ? 700 : 500,
  fontFamily: "inherit",
  cursor: "pointer",
});

const sLigne: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };
const sTitre: CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600, color: MARINE, marginBottom: 6,
};

export type EtiquettesSaisies = {
  animaux?: string[] | null;
  especes?: string[] | null;
  types_soin?: string[] | null;
  ages?: string[] | null;
  besoins?: string[] | null;
  tailles_chien?: string[] | null;
  gouts?: string[] | null;
  proteines?: string[] | null;
  couleurs?: string[] | null;
  matieres?: string[] | null;
  usages_jouet?: string[] | null;
  sans_cereales?: boolean | null;
  monoproteine?: boolean | null;
  taille_article?: string | null;
};

/*
 * Les groupes du corps de la section, dans l'ordre d'affichage.
 *
 * « animaux » n'y est PAS : il se montre à part, en tête, parce que c'est lui
 * qui commande ce que les autres montrent. Le mettre dans la liste l'aurait
 * noyé au milieu de ce qui dépend de lui.
 *
 * « especes » suit l'animal de près — c'est son rang inférieur. « types_soin »
 * se place avec les autres filtres de rayon.
 */
const LISTES: GroupeEtiquette[] = [
  "especes",
  // "gouts" avant "proteines" : on dit d abord ce que l emballage annonce,
  // puis tout ce que la recette contient (APP 25-GOUT).
  "ages", "besoins", "tailles_chien", "gouts", "proteines", "types_soin",
  "couleurs", "matieres", "usages_jouet",
];

export default function EtiquettesArticle({
  categorie,
  article,
  valeurs,
}: {
  /** La catégorie CHOISIE dans le formulaire, pas celle enregistrée. */
  categorie: string;
  article?: EtiquettesSaisies;
  /** La saisie renvoyée par une action refusée : elle prime sur l'existant. */
  valeurs?: Record<string, string> | null;
}) {
  const depart = (groupe: GroupeEtiquette): string[] => {
    const refusee = valeurs?.[groupe];
    if (refusee !== undefined) return champVersValeurs(refusee);
    return article?.[groupe] ?? [];
  };
  const departCase = (champ: ChampCase): boolean => {
    if (valeurs) return valeurs[champ] === "on";
    return article?.[champ] === true;
  };

  const [listes, setListes] = useState<Record<GroupeEtiquette, string[]>>({
    /*
     * À la CRÉATION, « Chiens » est coché : c'est le cas de neuf articles sur
     * dix, et la base l'impose de toute façon (au moins un animal). Sur une
     * fiche existante, on reprend ce qui y est — jamais un défaut qui écraserait
     * un choix fait il y a six mois.
     */
    animaux: article || valeurs ? depart("animaux") : ["chien"],
    especes: depart("especes"),
    types_soin: depart("types_soin"),
    ages: depart("ages"),
    besoins: depart("besoins"),
    tailles_chien: depart("tailles_chien"),
    gouts: depart("gouts"),
    proteines: depart("proteines"),
    couleurs: depart("couleurs"),
    matieres: depart("matieres"),
    usages_jouet: depart("usages_jouet"),
  });
  const [taille, setTaille] = useState<string>(
    valeurs?.taille_article ?? article?.taille_article ?? ""
  );
  const [cases, setCases] = useState<Record<ChampCase, boolean>>({
    sans_cereales: departCase("sans_cereales"),
    monoproteine: departCase("monoproteine"),
  });
  const [couleurSaisie, setCouleurSaisie] = useState("");

  function basculer(groupe: GroupeEtiquette, valeur: string) {
    setListes((avant) => {
      const deja = avant[groupe].includes(valeur);
      return {
        ...avant,
        [groupe]: deja
          ? avant[groupe].filter((v) => v !== valeur)
          : [...avant[groupe], valeur],
      };
    });
  }

  function ajouterCouleur() {
    const propre = normaliserCouleur(couleurSaisie);
    if (!propre) return;
    setListes((avant) =>
      avant.couleurs.includes(propre)
        ? avant
        : { ...avant, couleurs: [...avant.couleurs, propre] }
    );
    setCouleurSaisie("");
  }

  /*
   * Le croisement des DEUX règles : ce que la catégorie appelle, et ce que
   * l'animal coché autorise. Les deux sont nécessaires — un aliment appelle
   * « Taille du chien », mais un foin de lapin ne doit pas la montrer.
   *
   * Recalculé à chaque rendu, donc à chaque clic sur un animal : cocher
   * « Rongeurs » fait apparaître « Espèce » sur-le-champ, et décocher
   * « Chiens » retire « Taille du chien ». Sabrina voit ce qui s'appliquera,
   * au lieu de le découvrir après enregistrement.
   */
  const montres = champsDeCategorieEtAnimaux(categorie, listes.animaux);
  /* Aucun animal coché : la base refusera. On le dit ICI, pas après. */
  const sansAnimal = listes.animaux.length === 0;

  return (
    <div style={{ display: "grid", gap: 14, borderTop: BORDURE, paddingTop: 16 }}>
      {/* Le marqueur : sans lui, l'action ne touche pas aux étiquettes. */}
      <input type="hidden" name={MARQUEUR_ETIQUETTES} value="1" />

      <div>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: MARINE }}>
          Étiquettes pour les filtres
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: SOUS }}>
          Ce qui permet à un client de retrouver cet article dans la boutique.
          Rien n&apos;est obligatoire, et seules les étiquettes qui ont du sens
          pour la catégorie choisie sont proposées — les autres sont gardées
          telles quelles, jamais effacées.
        </p>
      </div>

      {/*
        * L'ANIMAL, EN TÊTE ET OBLIGATOIRE (APP 27).
        *
        * Il se place avant tout le reste parce qu'il commande tout le reste :
        * ce sont ses cases qui font apparaître « Espèce », et disparaître
        * « Taille du chien ». Un article sans animal n'apparaîtrait dans aucun
        * onglet du catalogue — ni « Épuisé », ni « masqué » : introuvable.
        */}
      <div>
        <span style={sTitre}>{GROUPES.animaux.libelle}</span>
        <span style={{ display: "block", fontSize: 12, color: "rgba(27,43,94,0.55)", marginTop: 2 }}>
          {GROUPES.animaux.aide}
        </span>
        <div style={sLigne}>
          {GROUPES.animaux.valeurs.map((v) => (
            <button
              key={v.valeur}
              type="button"
              aria-pressed={listes.animaux.includes(v.valeur)}
              onClick={() => basculer("animaux", v.valeur)}
              style={sPastille(listes.animaux.includes(v.valeur))}
            >
              {v.libelle}
            </button>
          ))}
        </div>
        <input type="hidden" name="animaux" value={listes.animaux.join(",")} />
        {sansAnimal && (
          <p role="alert" style={{
            fontSize: 13.5, fontWeight: 600, color: "#8A1F1F", margin: "8px 0 0",
          }}>
            Choisissez au moins un animal : sans cela, l&apos;article n&apos;apparaîtra
            dans aucun onglet de la boutique.
          </p>
        )}
      </div>

      {LISTES.filter((g) => montres.includes(g)).map((groupe) => (
        <div key={groupe}>
          <span style={sTitre}>{GROUPES[groupe].libelle}</span>
          {/*
            « Contient » porte une phrase d'aide : sans elle, on croit qu'on y
            met la saveur, et c'est exactement la confusion que le lot APP 25
            sépare.
          */}
          {GROUPES[groupe].aide && (
            <span style={{ display: "block", fontSize: 12, color: "rgba(27,43,94,0.55)", marginTop: 2 }}>
              {GROUPES[groupe].aide}
            </span>
          )}
          <div style={sLigne}>
            {groupe === "couleurs"
              ? listes.couleurs.map((c) => (
                  <button
                    key={c}
                    type="button"
                    style={sPastille(true)}
                    onClick={() => basculer("couleurs", c)}
                    aria-pressed
                  >
                    {libelleValeur("couleurs", c)} ✕
                  </button>
                ))
              : valeursPourAnimaux(groupe, listes.animaux).map((v) => {
                  const actif = listes[groupe].includes(v.valeur);
                  return (
                    <button
                      key={v.valeur}
                      type="button"
                      style={sPastille(actif)}
                      onClick={() => basculer(groupe, v.valeur)}
                      aria-pressed={actif}
                    >
                      {v.libelle}
                    </button>
                  );
                })}
          </div>

          {groupe === "couleurs" && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {/* Les couleurs ne se ferment pas : un fournisseur sortira
                  toujours un « bordeaux » auquel personne n'avait pensé. */}
              <input
                type="text"
                value={couleurSaisie}
                onChange={(e) => setCouleurSaisie(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); ajouterCouleur(); }
                }}
                placeholder="noir, bleu marine…"
                aria-label="Ajouter une couleur"
                maxLength={30}
                style={{
                  minHeight: 44, padding: "8px 12px", borderRadius: 12, border: BORDURE,
                  fontSize: 16, color: MARINE, background: "#FFFFFF", fontFamily: "inherit",
                  minWidth: 180,
                }}
              />
              <button type="button" onClick={ajouterCouleur} style={sPastille(false)}>
                + Ajouter
              </button>
            </div>
          )}
        </div>
      ))}

      {montres.includes("taille_article") && (
        <div>
          <span style={sTitre}>{LIBELLE_TAILLE_ARTICLE}</span>
          <div style={sLigne}>
            {TAILLES_ARTICLE.map((t) => {
              const actif = taille === t.valeur;
              return (
                <button
                  key={t.valeur}
                  type="button"
                  style={sPastille(actif)}
                  // Un seul choix : recliquer la taille cochée l'enlève.
                  onClick={() => setTaille(actif ? "" : t.valeur)}
                  aria-pressed={actif}
                >
                  {t.libelle}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {CASES.filter((c) => montres.includes(c.champ)).map((c) => (
        <label
          key={c.champ}
          htmlFor={c.champ}
          style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: MARINE }}
        >
          <input
            type="checkbox"
            id={c.champ}
            name={c.champ}
            checked={cases[c.champ]}
            onChange={(e) => setCases((avant) => ({ ...avant, [c.champ]: e.target.checked }))}
            style={{ width: 20, height: 20 }}
          />
          {c.libelle}
        </label>
      ))}

      {/* Ce que la catégorie masque part quand même, à sa valeur actuelle :
          on cache, on n'efface pas. Une liste par champ, valeurs séparées par
          une virgule — dix champs répétés se perdraient au premier refus. */}
      {LISTES.map((groupe) => (
        <input
          key={`cache-${groupe}`}
          type="hidden"
          name={groupe}
          value={valeursVersChamp(listes[groupe])}
        />
      ))}
      <input type="hidden" name="taille_article" value={taille} />
      {CASES.filter((c) => !montres.includes(c.champ)).map((c) => (
        <input
          key={`cache-${c.champ}`}
          type="hidden"
          name={c.champ}
          value={cases[c.champ] ? "on" : ""}
        />
      ))}
    </div>
  );
}
