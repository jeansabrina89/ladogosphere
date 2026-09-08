"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { enregistrerArticle, type EtatBoutique } from "../actions";
import AlerteFormulaire, { marqueChamp } from "@/app/components/AlerteFormulaire";
import { ETAT_FORMULAIRE_VIDE, caseCochee, valeurChamp } from "@/src/lib/etatFormulaire";
import {
  CATEGORIES_ARTICLE,
  aideCategorie,
  MENTION_TAUX,
  tauxPropose,
  margeArticle,
  lireNombre,
} from "@/src/lib/boutiqueLogique";
import { COMPTE_MATIERES_FABRICATION, type PerimetreStock } from "@/src/lib/perimetreStock";
import { SECTEURS } from "@/src/lib/tvaLogique";

export type ArticleFormulaire = {
  id: string;
  reference: string;
  nom: string;
  description: string | null;
  categorie: string;
  marque: string | null;
  fournisseur_id: string | null;
  taux_tva: number | string;
  secteur_tdfn: string | null;
  type_article: string;
  delai_fabrication_jours: number | null;
  composant: boolean;
  prix_vente: number | string;
  prix_achat: number | string | null;
  stock_alerte: number | string | null;
  unite: string;
  code_barres: string | null;
  actif: boolean;
  vendable_en_ligne: boolean;
};

/**
 * Fiche article, en création comme en modification.
 *
 * La catégorie propose le taux de TVA, elle ne l'impose pas : le champ reste
 * ouvert, avec la mention qui le dit. Le prix de vente est un prix TTC, et la
 * marge s'affiche à côté, en lecture seule — c'est une aide, pas une saisie.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.16)";

const champ: React.CSSProperties = {
  width: "100%",
  minHeight: 48,
  padding: "12px 14px",
  border: BORDURE,
  borderRadius: 14,
  fontSize: 16, // 16 px : iOS ne zoome pas au focus
  color: MARINE,
  backgroundColor: "#FFFFFF",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const etiquette: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600, color: MARINE, marginBottom: 6,
};

const aide: React.CSSProperties = { fontSize: 12, color: SOUS, marginTop: 6, marginBottom: 0 };

export default function FormArticle({
  article,
  fournisseurs,
  perimetre = "boutique",
}: {
  article?: ArticleFormulaire;
  fournisseurs: { id: string; nom: string }[];
  /**
   * « atelier » : on saisit une FOURNITURE. Ni prix de vente, ni catégorie de
   * vente, ni vitrine — rien de ce qui ne concerne que ce qui se vend. Les
   * champs masqués partent quand même, à leur valeur actuelle : on cache, on
   * n'efface pas.
   */
  perimetre?: PerimetreStock;
}) {
  const atelier = perimetre === "atelier";
  const [etat, action, enCours] = useActionState<EtatBoutique, FormData>(
    enregistrerArticle.bind(null, article?.id ?? null),
    ETAT_FORMULAIRE_VIDE
  );
  const v = etat.valeurs;
  const texte = (nom: string, defaut: string | number | null | undefined) =>
    valeurChamp(v, nom, defaut === null || defaut === undefined ? "" : String(defaut));

  const [categorie, setCategorie] = useState(texte("categorie", article?.categorie));
  const [taux, setTaux] = useState(
    texte("taux_tva", article?.taux_tva ?? tauxPropose(article?.categorie))
  );
  const [tauxTouche, setTauxTouche] = useState(false);
  const [prixVente, setPrixVente] = useState(texte("prix_vente", article?.prix_vente));
  const [prixAchat, setPrixAchat] = useState(texte("prix_achat", article?.prix_achat));
  const [typeArticle, setTypeArticle] = useState(texte("type_article", article?.type_article ?? "standard"));

  // Après un refus, les champs pilotés reprennent la saisie renvoyée par
  // l'action : ce qui a été tapé ne se perd pas parce qu'il est contrôlé.
  const [valeursVues, setValeursVues] = useState(v);
  if (v !== valeursVues) {
    setValeursVues(v);
    setCategorie(texte("categorie", article?.categorie));
    setTaux(texte("taux_tva", article?.taux_tva ?? tauxPropose(article?.categorie)));
    setPrixVente(texte("prix_vente", article?.prix_vente));
    setPrixAchat(texte("prix_achat", article?.prix_achat));
    setTypeArticle(texte("type_article", article?.type_article ?? "standard"));
  }

  function choisirCategorie(valeur: string) {
    setCategorie(valeur);
    // Le taux suit la catégorie tant que personne ne l'a corrigé à la main.
    if (!tauxTouche) setTaux(String(tauxPropose(valeur)));
  }

  const marge = margeArticle(lireNombre(prixVente), lireNombre(prixAchat));

  return (
    <form action={action} style={{ display: "grid", gap: 18, paddingBottom: 24 }}>
      <AlerteFormulaire etat={etat} />

      <div>
        <label htmlFor="nom" style={etiquette}>Nom de l&apos;article</label>
        <input
          {...marqueChamp(etat, "nom", champ)}
          type="text"
          required
          defaultValue={texte("nom", article?.nom)}
          placeholder="Croquettes agneau 12 kg"
        />
      </div>

      {atelier ? (
        /* Une fourniture n'a pas de catégorie de VENTE : elle ne se vend pas.
           Le champ part quand même, à sa valeur actuelle ou « divers ». */
        <input type="hidden" name="categorie" value={categorie || "divers"} />
      ) : (
      <div>
        <label htmlFor="categorie" style={etiquette}>Catégorie</label>
        <select
          {...marqueChamp(etat, "categorie", champ)}
          value={categorie}
          onChange={(e) => choisirCategorie(e.target.value)}
        >
          <option value="">— Choisir —</option>
          {CATEGORIES_ARTICLE.map((c) => (
            <option key={c.valeur} value={c.valeur}>{c.libelle}</option>
          ))}
        </select>
        {aideCategorie(categorie) && <p style={aide}>{aideCategorie(categorie)}</p>}
      </div>
      )}

      <div>
        <label htmlFor="taux_tva" style={etiquette}>Taux de TVA (%)</label>
        <input
          {...marqueChamp(etat, "taux_tva", { ...champ, maxWidth: 180 })}
          type="text"
          inputMode="decimal"
          value={taux}
          onChange={(e) => { setTaux(e.target.value); setTauxTouche(true); }}
        />
        <p style={aide}>{MENTION_TAUX}</p>
      </div>

      <div>
        <label htmlFor="secteur_tdfn" style={etiquette}>Secteur de dette fiscale nette</label>
        <select
          {...marqueChamp(etat, "secteur_tdfn", { ...champ, maxWidth: 280 })}
          defaultValue={article?.secteur_tdfn ?? "commerce"}
        >
          {SECTEURS.map((s) => (
            <option key={s.valeur} value={s.valeur}>{s.libelle}</option>
          ))}
        </select>
        <p style={aide}>
          Il ne sert qu&apos;au décompte TVA, jamais à la facture : le taux facturé
          au client est celui du champ précédent.
        </p>
      </div>

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {atelier ? (
          /* On n'achète pas une sangle pour la revendre au mètre : seul le
             prix d'ACHAT compte, et c'est lui qui valorise le stock. */
          <input type="hidden" name="prix_vente" value={prixVente || "0"} />
        ) : (
        <div>
          <label htmlFor="prix_vente" style={etiquette}>Prix TTC de vente (CHF)</label>
          <input
            {...marqueChamp(etat, "prix_vente", { ...champ, fontSize: 20, fontWeight: 700 })}
            type="text"
            inputMode="decimal"
            required
            value={prixVente}
            onChange={(e) => setPrixVente(e.target.value)}
            placeholder="0.00"
          />
        </div>
        )}

        <div>
          <label htmlFor="prix_achat" style={etiquette}>Prix d&apos;achat (CHF, facultatif)</label>
          <input
            {...marqueChamp(etat, "prix_achat", champ)}
            type="text"
            inputMode="decimal"
            value={prixAchat}
            onChange={(e) => setPrixAchat(e.target.value)}
            placeholder="0.00"
          />
          <p style={aide} aria-live="polite">
            {marge
              ? `Marge : ${marge.montant.toFixed(2)} CHF${marge.pourcentage !== null ? ` (${marge.pourcentage > 0 ? "+" : ""}${String(marge.pourcentage).replace(".", ",")} %)` : ""}`
              : "La marge s'affichera ici."}
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div>
          <label htmlFor="unite" style={etiquette}>Unité</label>
          <input
            {...marqueChamp(etat, "unite", champ)}
            type="text"
            defaultValue={texte("unite", article?.unite ?? "pièce")}
            placeholder="pièce"
          />
        </div>
        <div>
          <label htmlFor="stock_alerte" style={etiquette}>Seuil d&apos;alerte</label>
          <input
            {...marqueChamp(etat, "stock_alerte", champ)}
            type="text"
            inputMode="decimal"
            defaultValue={texte("stock_alerte", article?.stock_alerte ?? 0)}
          />
          <p style={aide}>0 : aucune alerte pour cet article.</p>
        </div>
      </div>

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div>
          <label htmlFor="marque" style={etiquette}>Marque</label>
          <input
            {...marqueChamp(etat, "marque", champ)}
            type="text"
            defaultValue={texte("marque", article?.marque)}
          />
        </div>
        <div>
          <label htmlFor="fournisseur_id" style={etiquette}>Fournisseur</label>
          <select
            {...marqueChamp(etat, "fournisseur_id", champ)}
            defaultValue={texte("fournisseur_id", article?.fournisseur_id)}
          >
            <option value="">— Aucun —</option>
            {fournisseurs.map((f) => (
              <option key={f.id} value={f.id}>{f.nom}</option>
            ))}
          </select>
          <p style={aide}>
            Nouveau fournisseur ?{" "}
            <Link href="/comptabilite/fournisseurs/nouveau" style={{ color: "#1F6E5B", fontWeight: 600 }}>
              l&apos;ajouter au carnet
            </Link>
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div>
          <label htmlFor="reference" style={etiquette}>Référence</label>
          <input
            {...marqueChamp(etat, "reference", champ)}
            type="text"
            defaultValue={texte("reference", article?.reference)}
            placeholder="ART-0001"
          />
          <p style={aide}>Laissez vide : elle sera attribuée automatiquement.</p>
        </div>
        <div>
          <label htmlFor="code_barres" style={etiquette}>Code-barres</label>
          <input
            {...marqueChamp(etat, "code_barres", champ)}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={texte("code_barres", article?.code_barres)}
            placeholder="7612345678901"
          />
          <p style={aide}>Tapé, collé, ou lu par une douchette branchée en clavier.</p>
        </div>
      </div>

      <div>
        <label htmlFor="description" style={etiquette}>Description (visible sur le site vitrine)</label>
        <textarea
          {...marqueChamp(etat, "description", { ...champ, minHeight: 96 })}
          rows={3}
          defaultValue={texte("description", article?.description)}
        />
      </div>

      {atelier && (
        <p style={{
          margin: 0, padding: "10px 12px", borderRadius: 12, fontSize: 13,
          backgroundColor: "#FBF9F5", border: BORDURE, color: SOUS,
        }}>
          Ses achats se saisissent en dépense sur la catégorie « Matières de
          fabrication » — compte {COMPTE_MATIERES_FABRICATION}. C&apos;est de là que
          les entrées en stock partent.
        </p>
      )}

      <div style={{ display: "grid", gap: 12, borderTop: BORDURE, paddingTop: 16 }}>
        {atelier ? (
          <input type="hidden" name="type_article" value="standard" />
        ) : (
        <div>
          <label htmlFor="type_article" style={etiquette}>Type d&apos;article</label>
          <select
            {...marqueChamp(etat, "type_article", champ)}
            value={typeArticle}
            onChange={(e) => setTypeArticle(e.target.value)}
          >
            <option value="standard">Article ordinaire (suivi en stock)</option>
            <option value="personnalisable">Sur mesure (configuré par le client)</option>
          </select>
          <p style={aide}>
            {typeArticle === "personnalisable"
              ? "Pas de stock de produit fini : ce sont ses fournitures qui se décomptent, à la fabrication."
              : "Son stock se décompte à chaque vente."}
          </p>
        </div>
        )}

        {typeArticle === "personnalisable" && (
          <div>
            <label htmlFor="delai_fabrication_jours" style={etiquette}>
              Délai de fabrication (jours ouvrables)
            </label>
            <input
              {...marqueChamp(etat, "delai_fabrication_jours", { ...champ, maxWidth: 160 })}
              type="text"
              inputMode="numeric"
              defaultValue={texte("delai_fabrication_jours", article?.delai_fabrication_jours ?? 10)}
            />
            <p style={aide}>Les options choisies peuvent l&apos;allonger.</p>
          </div>
        )}

        {atelier ? (
          /* Ici, tout est fourniture : la case n'a rien à demander. */
          <input type="hidden" name="composant" value="on" />
        ) : (
        <label htmlFor="composant" style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 15, color: MARINE }}>
          <input
            type="checkbox" name="composant" id="composant"
            defaultChecked={caseCochee(v, "composant", article?.composant ?? false)}
            style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0 }}
          />
          <span>
            Fourniture d&apos;atelier
            <span style={{ display: "block", fontSize: 12, color: SOUS }}>
              Se stocke mais ne se vend pas seule : sangle, bouclerie, puce NFC.
              Absente de la caisse et de la vitrine.
            </span>
          </span>
        </label>
        )}

        <label htmlFor="actif" style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: MARINE }}>
          <input
            type="checkbox" name="actif" id="actif"
            defaultChecked={caseCochee(v, "actif", article?.actif ?? true)}
            style={{ width: 20, height: 20 }}
          />
          {atelier ? "Fourniture active (utilisable en fabrication)" : "Article actif (proposé à la vente)"}
        </label>
        {atelier ? (
          <input type="hidden" name="vendable_en_ligne" value="" />
        ) : (
        <label htmlFor="vendable_en_ligne" style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: MARINE }}>
          <input
            type="checkbox" name="vendable_en_ligne" id="vendable_en_ligne"
            defaultChecked={caseCochee(v, "vendable_en_ligne", article?.vendable_en_ligne ?? true)}
            style={{ width: 20, height: 20 }}
          />
          Visible sur le site vitrine
        </label>
        )}
      </div>

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
          href={article ? `/boutique/articles/${article.id}` : (atelier ? "/atelier/fournitures" : "/boutique/articles")}
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
