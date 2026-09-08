"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { enregistrerRubrique, type EtatPromotion } from "./actionsPromotions";
import AlerteFormulaire, { marqueChamp } from "@/app/components/AlerteFormulaire";
import { ETAT_FORMULAIRE_VIDE, caseCochee, valeurChamp } from "@/src/lib/etatFormulaire";
import { CATEGORIES_ARTICLE, libelleCategorieArticle } from "@/src/lib/boutiqueLogique";
import {
  AVERTISSEMENT_SOUS_PRIX_ACHAT,
  CIBLES_PROMOTION,
  TYPES_PROMOTION,
  apercuMarge,
  typePromotion,
} from "@/src/lib/prixLogique";
import { infoStatutVitrine } from "@/src/lib/statutVitrineLogique";
import type { ArticleChoisissable } from "@/src/lib/promotions";
import type { Promotion } from "@/src/lib/prixLogique";

/**
 * Créer ou modifier une rubrique.
 *
 * Le pourcentage se saisit en voyant SON EFFET, article par article : prix de
 * base, prix remisé, prix d'achat, marge restante. Une action qui passe sous le
 * prix d'achat est signalée en rouge — et pas bloquée : écouler un fond de
 * stock à perte peut être le bon geste, mais jamais sans le savoir.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const GRENAT = "#8A1F1F";
const BORDURE = "1px solid rgba(27,43,94,0.16)";

const champ: React.CSSProperties = {
  width: "100%", minHeight: 48, padding: "12px 14px", border: BORDURE,
  borderRadius: 14, fontSize: 16, color: MARINE, backgroundColor: "#FFFFFF",
  fontFamily: "inherit", boxSizing: "border-box",
};

const etiquette: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600, color: MARINE, marginBottom: 6,
};

const aide: React.CSSProperties = { fontSize: 12, color: SOUS, marginTop: 6, marginBottom: 0 };

const chf = (n: number) => `${n.toFixed(2)} CHF`;

export default function FormPromotion({
  promotion,
  articles,
  articlesChoisis,
}: {
  promotion?: Promotion;
  articles: ArticleChoisissable[];
  articlesChoisis: string[];
}) {
  const [etat, action, enCours] = useActionState<EtatPromotion, FormData>(
    enregistrerRubrique.bind(null, promotion?.id ?? null),
    ETAT_FORMULAIRE_VIDE
  );
  const v = etat.valeurs;
  const texte = (nom: string, defaut: string | number | null | undefined) =>
    valeurChamp(v, nom, defaut === null || defaut === undefined ? "" : String(defaut));

  const [type, setType] = useState(texte("type", promotion?.type ?? "action"));
  const [pourcentage, setPourcentage] = useState(texte("pourcentage", promotion?.pourcentage));
  const [choisis, setChoisis] = useState<Set<string>>(new Set(articlesChoisis));
  const [recherche, setRecherche] = useState("");
  const [categorie, setCategorie] = useState("");

  const info = typePromotion(type);
  const avecPourcentage = info?.avecPourcentage === true;

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return articles.filter(
      (a) =>
        (!categorie || a.categorie === categorie) &&
        (!q || `${a.nom} ${a.reference}`.toLowerCase().includes(q))
    );
  }, [articles, recherche, categorie]);

  // Ce qu'on regarde vraiment en tapant le pourcentage : les articles CHOISIS,
  // avec leur marge restante. Les autres n'ont rien à dire ici.
  const apercus = useMemo(
    () =>
      articles
        .filter((a) => choisis.has(a.id))
        .map((a) => ({
          article: a,
          m: apercuMarge({
            prixVente: a.prix_vente,
            prixAchat: a.prix_achat,
            pourcentage: avecPourcentage ? pourcentage : 0,
          }),
        })),
    [articles, choisis, pourcentage, avecPourcentage]
  );
  const aPerte = apercus.filter((x) => x.m.sousLePrixDAchat);

  function basculer(id: string) {
    setChoisis((actuel) => {
      const suite = new Set(actuel);
      if (suite.has(id)) suite.delete(id);
      else suite.add(id);
      return suite;
    });
  }

  function toutCeQuiEstVisible() {
    setChoisis((actuel) => {
      const suite = new Set(actuel);
      for (const a of visibles) suite.add(a.id);
      return suite;
    });
  }

  return (
    <form action={action} style={{ display: "grid", gap: 18, paddingBottom: 24 }}>
      <AlerteFormulaire etat={etat} />

      {/* Les articles cochés partent avec le formulaire, même filtrés hors vue :
          un filtre change ce qu'on voit, pas ce qu'on a choisi. */}
      {[...choisis].map((id) => (
        <input key={id} type="hidden" name="article" value={id} />
      ))}

      <div>
        <label htmlFor="type" style={etiquette}>Type de rubrique</label>
        <select
          {...marqueChamp(etat, "type", { ...champ, maxWidth: 320 })}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {TYPES_PROMOTION.map((t) => (
            <option key={t.valeur} value={t.valeur}>{t.libelle}</option>
          ))}
        </select>
        {info && <p style={aide}>{info.aide}</p>}
      </div>

      <div>
        <label htmlFor="nom" style={etiquette}>Nom affiché en boutique</label>
        <input
          {...marqueChamp(etat, "nom", champ)}
          type="text"
          required
          defaultValue={texte("nom", promotion?.nom ?? info?.nomPropose)}
          placeholder={info?.nomPropose}
        />
        <p style={aide}>
          C&apos;est ce nom qui paraîtra sur la facture et le ticket, suivi du
          pourcentage — « {info?.nomPropose ?? "Action du mois"} −20 % ».
        </p>
      </div>

      {avecPourcentage && (
        <div>
          <label htmlFor="pourcentage" style={etiquette}>Remise (%)</label>
          <input
            {...marqueChamp(etat, "pourcentage", { ...champ, maxWidth: 160, fontSize: 20, fontWeight: 700 })}
            type="text"
            inputMode="decimal"
            value={pourcentage}
            onChange={(e) => setPourcentage(e.target.value)}
            placeholder="20"
          />
        </div>
      )}

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div>
          <label htmlFor="date_debut" style={etiquette}>Du</label>
          <input
            {...marqueChamp(etat, "date_debut", champ)}
            type="date" required
            defaultValue={texte("date_debut", promotion?.date_debut)}
          />
        </div>
        <div>
          <label htmlFor="date_fin" style={etiquette}>Au (inclus)</label>
          <input
            {...marqueChamp(etat, "date_fin", champ)}
            type="date" required
            defaultValue={texte("date_fin", promotion?.date_fin)}
          />
        </div>
      </div>

      <div>
        <label htmlFor="cible" style={etiquette}>À qui elle s&apos;adresse</label>
        <select
          {...marqueChamp(etat, "cible", { ...champ, maxWidth: 320 })}
          defaultValue={texte("cible", promotion?.cible ?? "tous")}
        >
          {CIBLES_PROMOTION.map((c) => (
            <option key={c.valeur} value={c.valeur}>{c.libelle}</option>
          ))}
        </select>
        <p style={aide}>{CIBLES_PROMOTION.find((c) => c.valeur === (texte("cible", promotion?.cible ?? "tous")))?.aide}</p>
      </div>

      <div>
        <label htmlFor="texte" style={etiquette}>Phrase d&apos;accroche (facultative)</label>
        <input
          {...marqueChamp(etat, "texte", champ)}
          type="text" maxLength={160}
          defaultValue={texte("texte", promotion?.texte)}
          placeholder="Les nouveautés de la rentrée"
        />
      </div>

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div>
          <label htmlFor="ordre" style={etiquette}>Ordre d&apos;affichage</label>
          <input
            {...marqueChamp(etat, "ordre", { ...champ, maxWidth: 120 })}
            type="text" inputMode="numeric"
            defaultValue={texte("ordre", promotion?.ordre ?? 0)}
          />
          <p style={aide}>Le plus petit passe en premier.</p>
        </div>
        <label htmlFor="actif" style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: MARINE }}>
          <input
            type="checkbox" name="actif" id="actif"
            defaultChecked={caseCochee(v, "actif", promotion?.actif ?? true)}
            style={{ width: 20, height: 20 }}
          />
          Rubrique active
        </label>
      </div>

      {/* ── Les articles ───────────────────────────────────────────────── */}
      <div style={{ borderTop: BORDURE, paddingTop: 16, display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0, color: MARINE, fontSize: 17, fontWeight: 700 }}>
          Les articles ({choisis.size} choisi{choisis.size > 1 ? "s" : ""})
        </h2>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            value={categorie}
            onChange={(e) => setCategorie(e.target.value)}
            style={{ ...champ, maxWidth: 240 }}
            aria-label="Filtrer par catégorie"
          >
            <option value="">Toutes les catégories</option>
            {CATEGORIES_ARTICLE.map((c) => (
              <option key={c.valeur} value={c.valeur}>{c.libelle}</option>
            ))}
          </select>
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher un article…"
            aria-label="Chercher un article"
            style={{ ...champ, flex: "1 1 200px" }}
          />
          <button
            type="button"
            onClick={toutCeQuiEstVisible}
            style={{ ...champ, width: "auto", cursor: "pointer", fontWeight: 600 }}
          >
            Tout cocher
          </button>
        </div>

        <div style={{
          maxHeight: 320, overflowY: "auto", border: BORDURE, borderRadius: 14, padding: 8,
        }}>
          {visibles.length === 0 ? (
            <p style={{ color: SOUS, fontSize: 14, margin: 8 }}>Aucun article ne correspond.</p>
          ) : (
            visibles.map((a) => (
              <label
                key={a.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 6px",
                  fontSize: 15, color: MARINE, cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={choisis.has(a.id)}
                  onChange={() => basculer(a.id)}
                  style={{ width: 20, height: 20, flexShrink: 0 }}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  {a.nom}
                  <span style={{ display: "block", fontSize: 12, color: SOUS }}>
                    {a.reference} · {libelleCategorieArticle(a.categorie)}
                    {a.statut_vitrine !== "publie"
                      ? ` · ${infoStatutVitrine(a.statut_vitrine).libelle}`
                      : ""}
                  </span>
                </span>
                <span style={{ color: SOUS, fontSize: 14, whiteSpace: "nowrap" }}>
                  {chf(a.prix_vente)}
                </span>
              </label>
            ))
          )}
        </div>
      </div>

      {/* ── L'effet du pourcentage, article par article ─────────────────── */}
      {avecPourcentage && apercus.length > 0 && (
        <div style={{ borderTop: BORDURE, paddingTop: 16, display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, color: MARINE, fontSize: 17, fontWeight: 700 }}>
            Ce que ça donne
          </h2>

          {aPerte.length > 0 && (
            <p role="status" style={{
              backgroundColor: "#FDECEC", color: GRENAT, border: "1px solid #F0C2C2",
              borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 700, margin: 0,
            }}>
              ⚠️ {aPerte.length === 1
                ? `« ${aPerte[0].article.nom} » : ${AVERTISSEMENT_SOUS_PRIX_ACHAT.toLowerCase()}`
                : `${aPerte.length} articles passent sous leur prix d'achat : la vente se ferait à perte.`}
              {" "}Rien n&apos;est bloqué — c&apos;est votre décision.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: 560, fontSize: 15 }}>
              <thead>
                <tr style={{ color: SOUS, textAlign: "left" }}>
                  <th className="py-2 font-medium">Article</th>
                  <th className="py-2 font-medium text-right">Prix de base</th>
                  <th className="py-2 font-medium text-right">Prix remisé</th>
                  <th className="py-2 font-medium text-right">Prix d&apos;achat</th>
                  <th className="py-2 font-medium text-right">Marge</th>
                </tr>
              </thead>
              <tbody>
                {apercus.map(({ article, m }) => (
                  <tr key={article.id} style={{ borderTop: BORDURE }}>
                    <td className="py-2" style={{ color: MARINE }}>{article.nom}</td>
                    <td className="py-2 text-right" style={{ color: SOUS, whiteSpace: "nowrap" }}>
                      {chf(m.prixBase)}
                    </td>
                    <td className="py-2 text-right" style={{
                      color: m.sousLePrixDAchat ? GRENAT : MARINE, fontWeight: 700, whiteSpace: "nowrap",
                    }}>
                      {chf(m.prixRemise)}
                    </td>
                    <td className="py-2 text-right" style={{ color: SOUS, whiteSpace: "nowrap" }}>
                      {m.prixAchat === null ? "—" : chf(m.prixAchat)}
                    </td>
                    <td className="py-2 text-right" style={{
                      color: m.sousLePrixDAchat ? GRENAT : "#1F6E5B", fontWeight: 700, whiteSpace: "nowrap",
                    }}>
                      {m.marge === null ? "—" : chf(m.marge)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", borderTop: BORDURE, paddingTop: 16 }}>
        <button
          type="submit"
          disabled={enCours}
          style={{
            minHeight: 48, padding: "0 22px", borderRadius: 14, border: "none",
            backgroundColor: "#2E8B7E", color: "#FFFFFF", fontSize: 16, fontWeight: 700,
            fontFamily: "inherit", cursor: enCours ? "wait" : "pointer", opacity: enCours ? 0.6 : 1,
          }}
        >
          {enCours ? "Enregistrement…" : "💾 Enregistrer"}
        </button>
        <Link
          href="/boutique/actions"
          style={{
            minHeight: 48, padding: "0 22px", borderRadius: 14, border: BORDURE,
            display: "inline-flex", alignItems: "center", backgroundColor: "#FFFFFF",
            color: MARINE, fontSize: 16, fontWeight: 600, textDecoration: "none",
          }}
        >
          ✖ Annuler
        </Link>
      </div>
    </form>
  );
}
