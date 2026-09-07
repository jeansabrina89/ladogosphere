"use client";

import { useMemo, useState } from "react";
import ApercuPersonnalisation from "@/app/components/ApercuPersonnalisation";
import { urlPhotoArticle } from "@/src/lib/boutiqueLogique";
import {
  bornerTexte,
  caracteresRestants,
  choixParDefaut,
  detailPrix,
  delaiTotal,
  groupesManquants,
  libelleDelai,
  messageManquants,
  prixTotal,
  valeurRetenue,
  valeursActives,
  type ChoixParGroupe,
  type OptionGroupe,
  type OptionValeur,
} from "@/src/lib/personnalisationLogique";

/**
 * Configurateur d'un article personnalisable — le même au comptoir et dans
 * l'espace client.
 *
 * Les coloris sont une grille de vignettes photo AVEC leur nom écrit dessous :
 * une couleur seule est inutilisable pour une personne daltonienne et
 * impossible à citer au téléphone. La vignette retenue porte un cadre net et
 * une coche, pas une ombre — la sélection doit se lire en plein soleil.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.14)";
const VERT = "#2E8B7E";
const CIBLE = 44;

export type ArticleConfigurable = {
  id: string;
  nom: string;
  description: string | null;
  prix_vente: number | string;
  delai_fabrication_jours: number | null;
  photo_path: string | null;
};

const chf = (n: number) => `${n.toFixed(2)} CHF`;

export default function Configurateur({
  article,
  groupes,
  onValider,
  libelleValidation = "Valider la configuration",
  noteFin,
  enCours = false,
}: {
  article: ArticleConfigurable;
  groupes: OptionGroupe[];
  /** Absent : le configurateur se contente de montrer le prix et le délai. */
  onValider?: (choix: ChoixParGroupe, resume: { prix: number; delai: number }) => void;
  libelleValidation?: string;
  noteFin?: string;
  enCours?: boolean;
}) {
  const [choix, setChoix] = useState<ChoixParGroupe>(() => choixParDefaut(groupes));
  const [agrandie, setAgrandie] = useState<OptionValeur | null>(null);

  const ordonnes = useMemo(() => [...groupes].sort((a, b) => a.ordre - b.ordre), [groupes]);
  const prix = prixTotal(article.prix_vente, ordonnes, choix);
  const detail = detailPrix(ordonnes, choix);
  const delai = delaiTotal(article.delai_fabrication_jours, ordonnes, choix);
  const manquants = groupesManquants(ordonnes, choix);
  const complet = manquants.length === 0;

  const poser = (groupeId: string, valeur: Partial<ChoixParGroupe[string]>) =>
    setChoix({ ...choix, [groupeId]: { ...choix[groupeId], ...valeur } });

  return (
    <div style={{ paddingBottom: onValider ? 96 : 16 }}>
      <div className="grid gap-4 md:grid-cols-[1fr_320px]" style={{ alignItems: "start" }}>
        {/* Aperçu : au-dessus du récapitulatif sur mobile, à droite sur grand écran */}
        <div className="md:order-2">
          <ApercuPersonnalisation
            nom={article.nom}
            photoPath={article.photo_path}
            groupes={ordonnes}
            choix={choix}
          />
        </div>

        <div className="md:order-1" style={{ display: "grid", gap: 20 }}>
          {ordonnes.map((g) => (
            <fieldset key={g.id} style={{ border: "none", padding: 0, margin: 0 }}>
              <legend style={{ padding: 0, marginBottom: 6 }}>
                <span style={{ color: MARINE, fontSize: 17, fontWeight: 700 }}>{g.nom}</span>
                {!g.obligatoire && (
                  <span style={{ color: SOUS, fontSize: 14, fontWeight: 400 }}> — facultatif</span>
                )}
              </legend>
              {g.aide && (
                <p style={{ color: SOUS, fontSize: 14, margin: "0 0 10px" }}>{g.aide}</p>
              )}

              {g.type === "couleur" && (
                <GrilleCouleurs
                  groupe={g}
                  choisie={valeurRetenue(g, choix)}
                  onChoisir={(v) => poser(g.id, { valeur_id: v.id })}
                  onAgrandir={setAgrandie}
                />
              )}

              {g.type === "liste" && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {valeursActives(g).map((v) => {
                    const retenue = valeurRetenue(g, choix)?.id === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => poser(g.id, { valeur_id: v.id })}
                        aria-pressed={retenue}
                        style={{
                          minHeight: CIBLE + 6, padding: "0 16px", borderRadius: 12,
                          border: retenue ? `2px solid ${VERT}` : BORDURE,
                          backgroundColor: retenue ? "#F1F8F6" : "#FFFFFF",
                          color: MARINE, fontSize: 16, fontWeight: retenue ? 700 : 500,
                          fontFamily: "inherit", cursor: "pointer",
                        }}
                      >
                        {retenue && "✓ "}{v.libelle}
                        {Number(v.supplement_prix) > 0 && (
                          <span style={{ color: SOUS, fontWeight: 400 }}>
                            {" "}+{Number(v.supplement_prix).toFixed(2)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {g.type === "texte" && (
                <ChampTexte
                  groupe={g}
                  valeur={choix[g.id]?.texte ?? ""}
                  onSaisir={(texte) => poser(g.id, { texte })}
                />
              )}

              {g.type === "booleen" && (
                <Interrupteur
                  groupe={g}
                  actif={choix[g.id]?.booleen === true}
                  onBasculer={(v) => poser(g.id, { booleen: v })}
                />
              )}
            </fieldset>
          ))}

          {/* Récapitulatif, en permanence sous les choix */}
          <div style={{ border: BORDURE, borderRadius: 16, backgroundColor: "#FFFFFF", padding: 14 }}>
            <h3 style={{ color: MARINE, fontSize: 16, fontWeight: 700, margin: "0 0 10px" }}>
              Récapitulatif
            </h3>

            <div style={{ display: "grid", gap: 8 }}>
              {ordonnes.map((g) => {
                const v = valeurRetenue(g, choix);
                const texte = g.type === "texte" ? String(choix[g.id]?.texte ?? "").trim() : "";
                const manque = manquants.includes(g.nom);

                return (
                  <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {v && <Pastille valeur={v} />}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", color: SOUS, fontSize: 12 }}>{g.nom}</span>
                      <span style={{
                        display: "block", fontSize: 15, fontWeight: 600,
                        color: manque ? "#A8453A" : MARINE,
                        whiteSpace: g.type === "texte" ? "pre-line" : "normal",
                        overflowWrap: "anywhere",
                      }}>
                        {g.type === "texte"
                          ? (texte || (manque ? "À choisir" : "—"))
                          : g.type === "booleen"
                            ? (v ? v.libelle : "Non")
                            : (v?.libelle ?? (manque ? "À choisir" : "—"))}
                      </span>
                    </span>
                    {v && Number(v.supplement_prix) > 0 && (
                      <span style={{ color: SOUS, fontSize: 14, whiteSpace: "nowrap" }}>
                        +{Number(v.supplement_prix).toFixed(2)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: BORDURE, display: "grid", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: SOUS }}>
                <span>Prix de base</span>
                <span>{chf(Number(article.prix_vente ?? 0))}</span>
              </div>
              {detail.map((d, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: SOUS }}>
                  <span>{d.groupe} — {d.libelle}</span>
                  <span>+{d.supplement.toFixed(2)}</span>
                </div>
              ))}
              <div style={{
                display: "flex", justifyContent: "space-between", marginTop: 6,
                color: MARINE, fontSize: 20, fontWeight: 700,
              }}>
                <span>Prix TTC</span>
                <span>{chf(prix)}</span>
              </div>
              <p style={{ color: SOUS, fontSize: 14, margin: "6px 0 0" }}>
                🛠️ {libelleDelai(delai)}
              </p>
            </div>
          </div>

          {noteFin && (
            <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>{noteFin}</p>
          )}
        </div>
      </div>

      {/* Barre de total collée en bas : le récapitulatif reste atteignable */}
      {onValider && (
        <div
          style={{
            position: "fixed", left: 0, right: 0, bottom: 0,
            padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
            backgroundColor: "rgba(245,240,232,0.97)", borderTop: BORDURE,
            display: "flex", gap: 12, alignItems: "center", zIndex: 30,
          }}
          className="md:pl-[264px]"
        >
          <span style={{ flex: "0 0 auto" }}>
            <span style={{ display: "block", color: SOUS, fontSize: 12 }}>Prix TTC</span>
            <span style={{ display: "block", color: MARINE, fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>
              {chf(prix)}
            </span>
          </span>
          <div style={{ flex: 1 }}>
            <button
              type="button"
              disabled={!complet || enCours}
              onClick={() => onValider(choix, { prix, delai })}
              style={{
                width: "100%", minHeight: CIBLE + 8, borderRadius: 14, border: "none",
                backgroundColor: complet && !enCours ? VERT : "#B9CFC9", color: "#FFFFFF",
                fontSize: 17, fontWeight: 700, fontFamily: "inherit",
                cursor: complet && !enCours ? "pointer" : "not-allowed",
              }}
            >
              {enCours ? "Enregistrement…" : libelleValidation}
            </button>
            {!complet && (
              <p style={{ color: "#8A1F1F", fontSize: 13, margin: "6px 0 0", textAlign: "center" }}>
                {messageManquants(manquants)}
              </p>
            )}
          </div>
        </div>
      )}

      {agrandie && <Loupe valeur={agrandie} onFermer={() => setAgrandie(null)} />}
    </div>
  );
}

// ── Grille de coloris ───────────────────────────────────────────────────────

function GrilleCouleurs({
  groupe,
  choisie,
  onChoisir,
  onAgrandir,
}: {
  groupe: OptionGroupe;
  choisie: OptionValeur | null;
  onChoisir: (v: OptionValeur) => void;
  onAgrandir: (v: OptionValeur) => void;
}) {
  return (
    <div
      style={{
        display: "grid", gap: 10,
        gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
      }}
    >
      {valeursActives(groupe).map((v) => {
        const retenue = choisie?.id === v.id;
        const url = urlPhotoArticle(v.image_path);
        return (
          <div key={v.id} style={{ display: "grid", gap: 4 }}>
            <button
              type="button"
              onClick={() => onChoisir(v)}
              onDoubleClick={() => onAgrandir(v)}
              aria-pressed={retenue}
              aria-label={`${v.libelle}${retenue ? " (retenu)" : ""}`}
              style={{
                position: "relative", width: "100%", aspectRatio: "1 / 1",
                minHeight: 96, borderRadius: 12, padding: 0, overflow: "hidden",
                border: retenue ? `3px solid ${VERT}` : BORDURE,
                backgroundColor: v.code_couleur ?? "#EDE8DF",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {url && (
                // Vignette du bucket public de la boutique.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              )}
              {!url && !v.code_couleur && (
                <span style={{ color: SOUS, fontSize: 13, fontWeight: 600 }}>{v.libelle}</span>
              )}
              {retenue && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute", top: 4, right: 4, width: 26, height: 26,
                    borderRadius: "50%", backgroundColor: VERT, color: "#FFFFFF",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, fontWeight: 700,
                  }}
                >
                  ✓
                </span>
              )}
            </button>

            {/* Jamais un visuel sans nom : une couleur ne se cite pas au téléphone. */}
            <span style={{
              fontSize: 13, textAlign: "center", color: retenue ? MARINE : SOUS,
              fontWeight: retenue ? 700 : 500, overflowWrap: "anywhere",
            }}>
              {v.libelle}
              {Number(v.supplement_prix) > 0 && ` +${Number(v.supplement_prix).toFixed(2)}`}
            </span>

            {/* Cible tactile de plein format : on est debout, au comptoir. */}
            <button
              type="button"
              onClick={() => onAgrandir(v)}
              aria-label={`Agrandir ${v.libelle}`}
              style={{
                minHeight: CIBLE, border: BORDURE, borderRadius: 10,
                backgroundColor: "#FFFFFF", color: SOUS, fontSize: 13,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              🔍 Agrandir
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Loupe({ valeur, onFermer }: { valeur: OptionValeur; onFermer: () => void }) {
  const url = urlPhotoArticle(valeur.image_path);
  return (
    <div
      role="dialog"
      aria-label={valeur.libelle}
      onClick={onFermer}
      style={{
        position: "fixed", inset: 0, zIndex: 70, backgroundColor: "rgba(27,43,94,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div style={{ maxWidth: 480, width: "100%", display: "grid", gap: 12 }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={valeur.libelle} style={{ width: "100%", borderRadius: 16, display: "block" }} />
        ) : (
          <div style={{
            width: "100%", aspectRatio: "1 / 1", borderRadius: 16,
            backgroundColor: valeur.code_couleur ?? "#EDE8DF",
          }} />
        )}
        <p style={{ color: "#FFFFFF", fontSize: 20, fontWeight: 700, textAlign: "center", margin: 0 }}>
          {valeur.libelle}
        </p>
        <button
          type="button"
          onClick={onFermer}
          style={{
            minHeight: CIBLE + 8, borderRadius: 14, border: "none", backgroundColor: "#FFFFFF",
            color: MARINE, fontSize: 16, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
          }}
        >
          Fermer
        </button>
      </div>
    </div>
  );
}

// ── Texte et interrupteur ───────────────────────────────────────────────────

function ChampTexte({
  groupe,
  valeur,
  onSaisir,
}: {
  groupe: OptionGroupe;
  valeur: string;
  onSaisir: (texte: string) => void;
}) {
  const restants = caracteresRestants(valeur, groupe.max_caracteres);
  return (
    <div>
      <textarea
        id={`texte-${groupe.id}`}
        value={valeur}
        rows={2}
        maxLength={groupe.max_caracteres ?? undefined}
        onChange={(e) => onSaisir(bornerTexte(e.target.value, groupe.max_caracteres))}
        aria-label={groupe.nom}
        style={{
          width: "100%", minHeight: CIBLE + 20, padding: "10px 12px", border: BORDURE,
          borderRadius: 12, fontSize: 16, color: MARINE, backgroundColor: "#FFFFFF",
          fontFamily: "inherit", boxSizing: "border-box", resize: "vertical",
        }}
      />
      {restants !== null && (
        <p aria-live="polite" style={{
          color: restants <= 3 ? "#A8453A" : SOUS, fontSize: 13, margin: "4px 0 0",
        }}>
          {restants} caractère{restants > 1 ? "s" : ""} restant{restants > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

function Interrupteur({
  groupe,
  actif,
  onBasculer,
}: {
  groupe: OptionGroupe;
  actif: boolean;
  onBasculer: (v: boolean) => void;
}) {
  const valeur = valeursActives(groupe)[0];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={actif}
      onClick={() => onBasculer(!actif)}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        minHeight: CIBLE + 8, padding: "8px 14px", borderRadius: 12,
        border: actif ? `2px solid ${VERT}` : BORDURE,
        backgroundColor: actif ? "#F1F8F6" : "#FFFFFF",
        fontFamily: "inherit", cursor: "pointer", textAlign: "left",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 52, height: 30, flexShrink: 0, borderRadius: 999,
          backgroundColor: actif ? VERT : "#D9D4CB", position: "relative",
          transition: "background-color .15s",
        }}
      >
        <span style={{
          position: "absolute", top: 3, left: actif ? 25 : 3, width: 24, height: 24,
          borderRadius: "50%", backgroundColor: "#FFFFFF", transition: "left .15s",
        }} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", color: MARINE, fontSize: 16, fontWeight: 600 }}>
          {actif ? "Oui" : "Non"}
        </span>
        {valeur && Number(valeur.supplement_prix) > 0 && (
          <span style={{ display: "block", color: SOUS, fontSize: 13 }}>
            +{Number(valeur.supplement_prix).toFixed(2)} CHF
            {Number(valeur.supplement_delai_jours) > 0 && ` · +${valeur.supplement_delai_jours} jours`}
          </span>
        )}
      </span>
    </button>
  );
}

function Pastille({ valeur }: { valeur: OptionValeur }) {
  const url = urlPhotoArticle(valeur.image_path);
  const style: React.CSSProperties = {
    width: 28, height: 28, flexShrink: 0, borderRadius: 8,
    border: "1px solid rgba(27,43,94,0.2)", objectFit: "cover",
  };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={28} height={28} style={style} />;
  }
  if (!valeur.code_couleur) return null;
  return <span aria-hidden="true" style={{ ...style, display: "inline-block", backgroundColor: valeur.code_couleur }} />;
}
