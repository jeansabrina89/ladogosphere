"use client";

import { useMemo, useState } from "react";
import ApercuPersonnalisation from "@/app/components/ApercuPersonnalisation";
import { urlPhotoArticle } from "@/src/lib/boutiqueLogique";
import {
  determinerTaille,
  recalculerTailles,
  taillesTriees,
  libelleDeduction,
  type GroupeTaille,
  type Taille,
} from "@/src/lib/taillesLogique";
import {
  bornerTexte,
  caracteresRestants,
  choixParDefaut,
  detailPrix,
  delaiTotal,
  etatDesGroupes,
  groupesManquants,
  libelleDelai,
  messageManquants,
  mesuresAConfirmer,
  refusConfiguration,
  enumererFr,
  prixTotal,
  refusMesure,
  alerteMesure,
  supplementMesure,
  supplementApplique,
  formatMesure,
  uniteMesure,
  valeurRetenue,
  valeursActives,
  type ChoixParGroupe,
  type Dependance,
  type EtatGroupe,
  type EtatValeur,
  type OptionGroupe,
  type OptionValeur,
} from "@/src/lib/personnalisationLogique";

/**
 * Configurateur d'un article personnalisable — le même au comptoir et dans
 * l'espace client.
 *
 * Rien n'est masqué : un groupe pas encore ouvert reste visible et inactif, une
 * valeur indisponible reste affichée, grisée, avec sa raison écrite en toutes
 * lettres — pas une bulle au survol, il n'y a pas de survol sur un téléphone.
 * Le client apprend ainsi qu'un coloris existe dans une autre largeur, et peut
 * revenir sur son choix plutôt que de renoncer.
 *
 * Deux formes d'affichage : la grille de vignettes pour l'espace client, la
 * liste dense pour le comptoir. Sabrina bascule d'un bouton, et son poste s'en
 * souvient.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.14)";
const VERT = "#2E8B7E";
const GRENAT = "#8A1F1F";
const CIBLE = 44;

/** Au-delà, on cherche plus vite qu'on ne fait défiler. */
const SEUIL_RECHERCHE = 10;
const CLE_AFFICHAGE = "boutique.configurateur.affichage";

export type Affichage = "grille" | "liste";

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
  dependances = [],
  affichage = "grille",
  onValider,
  libelleValidation = "Valider la configuration",
  noteFin,
  enCours = false,
}: {
  article: ArticleConfigurable;
  groupes: OptionGroupe[];
  dependances?: Dependance[];
  /** « liste » au comptoir, « grille » côté client. Le poste peut en changer. */
  affichage?: Affichage;
  /** Absent : le configurateur se contente de montrer le prix et le délai. */
  onValider?: (choix: ChoixParGroupe, resume: { prix: number; delai: number }) => void;
  libelleValidation?: string;
  noteFin?: string;
  enCours?: boolean;
}) {
  const ordonnes = useMemo(() => [...groupes].sort((a, b) => a.ordre - b.ordre), [groupes]);

  const [choix, setChoix] = useState<ChoixParGroupe>(() => {
    // Une valeur par défaut peut être indisponible d'entrée : on nettoie.
    const depart = choixParDefaut(ordonnes);
    // Une taille se déduit d'une mesure : le recalcul englobe le nettoyage.
    return recalculerTailles(ordonnes, depart, dependances).choix;
  });
  const [messages, setMessages] = useState<string[]>([]);
  const [agrandie, setAgrandie] = useState<OptionValeur | null>(null);
  const [recherches, setRecherches] = useState<Record<string, string>>({});

  // Préférence d'affichage du poste : sans conséquence, donc localStorage.
  const [mode, setMode] = useState<Affichage>(() => {
    if (typeof window === "undefined") return affichage;
    try {
      const garde = window.localStorage.getItem(CLE_AFFICHAGE);
      return garde === "grille" || garde === "liste" ? garde : affichage;
    } catch {
      return affichage;
    }
  });

  function changerMode(suivant: Affichage) {
    setMode(suivant);
    try {
      window.localStorage.setItem(CLE_AFFICHAGE, suivant);
    } catch {
      // Un navigateur qui refuse le stockage garde simplement le choix par défaut.
    }
  }

  const etats = etatDesGroupes(ordonnes, choix, dependances);
  const prix = prixTotal(article.prix_vente, ordonnes, choix, dependances);
  const detail = detailPrix(ordonnes, choix, dependances);
  const delai = delaiTotal(article.delai_fabrication_jours, ordonnes, choix);

  // Un groupe encore fermé n'a rien à réclamer : sa question n'est pas posée.
  const manquants = groupesManquants(
    etats.filter((e) => e.actif).map((e) => e.groupe),
    choix
  );
  // Une mesure hors bornes dures, ou une mesure improbable pas encore
  // confirmée, retient la validation — chacune avec sa phrase.
  const groupesActifs = etats.filter((e) => e.actif).map((e) => e.groupe);
  const refusMesures = refusConfiguration(groupesActifs, choix);
  const aConfirmer = mesuresAConfirmer(groupesActifs, choix);
  const complet = manquants.length === 0 && !refusMesures && aConfirmer.length === 0;

  /** Un choix en pose un autre : on rejoue les dépendances à chaque fois. */
  function poser(groupeId: string, valeur: Partial<ChoixParGroupe[string]>) {
    const suivant: ChoixParGroupe = { ...choix, [groupeId]: { ...choix[groupeId], ...valeur } };
    // Changer une mesure recalcule la taille, qui recalcule ce qui en dépend.
    // Une largeur ou un coloris devenu impossible s'efface, en le disant.
    const nettoye = recalculerTailles(ordonnes, suivant, dependances);
    setChoix(nettoye.choix);
    setMessages(nettoye.messages);
  }

  /** « Passer en 19 mm » : le raccourci qui évite de renoncer au coloris. */
  function basculerVers(requise: OptionValeur) {
    const groupe = ordonnes.find((g) => (g.valeurs ?? []).some((v) => v.id === requise.id));
    if (!groupe) return;
    poser(groupe.id, { valeur_id: requise.id });
  }

  return (
    <div style={{ paddingBottom: onValider ? 96 : 16 }}>
      {messages.length > 0 && (
        <p role="alert" style={{
          backgroundColor: "#FDECEC", color: GRENAT, border: "1px solid #F0C2C2",
          borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 600,
          margin: "0 0 16px", whiteSpace: "pre-line",
        }}>
          ⚠️ {messages.join("\n")}
        </p>
      )}

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
          {/* Le choix liste/grille n'a de sens que s'il y a des vignettes à
              disposer : un article qui ne demande que des mesures n'affiche rien. */}
          {etats.some((e) => e.groupe.type === "couleur" || e.groupe.type === "liste") && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
              <BoutonMode actuel={mode} valeur="liste" libelle="☰ Liste" onChoisir={changerMode} />
              <BoutonMode actuel={mode} valeur="grille" libelle="▦ Grille" onChoisir={changerMode} />
            </div>
          )}

          {etats.map((etat) => {
            const g = etat.groupe;
            const recherche = recherches[g.id] ?? "";
            const visibles = filtrer(etat, recherche);

            return (
              <fieldset
                key={g.id}
                disabled={!etat.actif}
                style={{ border: "none", padding: 0, margin: 0, opacity: etat.actif ? 1 : 0.55 }}
              >
                <legend style={{ padding: 0, marginBottom: 6 }}>
                  <span style={{ color: MARINE, fontSize: 17, fontWeight: 700 }}>{g.nom}</span>
                  {!g.obligatoire && (
                    <span style={{ color: SOUS, fontSize: 14, fontWeight: 400 }}> — facultatif</span>
                  )}
                </legend>

                {/* Le groupe reste visible : on dit seulement ce qui l'ouvre. */}
                {!etat.actif && (
                  <p style={{
                    color: "#6E5410", backgroundColor: "#F4EAC9", border: "1px solid #C9A84C",
                    borderRadius: 10, padding: "8px 10px", fontSize: 14, fontWeight: 600,
                    margin: "0 0 10px",
                  }}>
                    {etat.raisonInactif}
                  </p>
                )}

                {g.aide && etat.actif && (
                  <p style={{ color: SOUS, fontSize: 14, margin: "0 0 10px" }}>{g.aide}</p>
                )}

                {(g.type === "couleur" || g.type === "liste") &&
                  etat.valeurs.length > SEUIL_RECHERCHE && (
                    <input
                      type="search"
                      value={recherche}
                      onChange={(e) => setRecherches({ ...recherches, [g.id]: e.target.value })}
                      placeholder={`Chercher parmi ${etat.valeurs.length} options…`}
                      aria-label={`Chercher dans ${g.nom}`}
                      style={{
                        width: "100%", minHeight: CIBLE, padding: "10px 12px", border: BORDURE,
                        borderRadius: 12, fontSize: 16, color: MARINE, backgroundColor: "#FFFFFF",
                        fontFamily: "inherit", boxSizing: "border-box", marginBottom: 10,
                      }}
                    />
                  )}

                {(g.type === "couleur" || g.type === "liste") && visibles.length === 0 && (
                  <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>
                    Aucune option ne correspond à « {recherche} ».
                  </p>
                )}

                {g.type === "couleur" && (
                  mode === "liste" ? (
                    <ListeValeurs
                      valeurs={visibles}
                      choisie={valeurRetenue(g, choix)}
                      onChoisir={(v) => poser(g.id, { valeur_id: v.id })}
                      onAgrandir={setAgrandie}
                      onBasculer={basculerVers}
                      avecVignette
                    />
                  ) : (
                    <GrilleCouleurs
                      valeurs={visibles}
                      choisie={valeurRetenue(g, choix)}
                      onChoisir={(v) => poser(g.id, { valeur_id: v.id })}
                      onAgrandir={setAgrandie}
                      onBasculer={basculerVers}
                    />
                  )
                )}

                {g.type === "liste" && (
                  mode === "liste" ? (
                    <ListeValeurs
                      valeurs={visibles}
                      choisie={valeurRetenue(g, choix)}
                      onChoisir={(v) => poser(g.id, { valeur_id: v.id })}
                      onBasculer={basculerVers}
                    />
                  ) : (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {visibles.map((e) => {
                        const retenue = valeurRetenue(g, choix)?.id === e.valeur.id;
                        return (
                          <span key={e.valeur.id} style={{ display: "grid", gap: 2 }}>
                            <button
                              type="button"
                              onClick={() => e.disponible && poser(g.id, { valeur_id: e.valeur.id })}
                              aria-pressed={retenue}
                              aria-disabled={!e.disponible}
                              style={{
                                minHeight: CIBLE + 6, padding: "0 16px", borderRadius: 12,
                                border: retenue ? `2px solid ${VERT}` : BORDURE,
                                backgroundColor: retenue ? "#F1F8F6" : e.disponible ? "#FFFFFF" : "#F2F0EC",
                                color: e.disponible ? MARINE : SOUS,
                                fontSize: 16, fontWeight: retenue ? 700 : 500,
                                fontFamily: "inherit",
                                cursor: e.disponible ? "pointer" : "not-allowed",
                              }}
                            >
                              {retenue && "✓ "}{e.valeur.libelle}
                              {Number(e.valeur.supplement_prix) > 0 && (
                                <span style={{ color: SOUS, fontWeight: 400 }}>
                                  {" "}+{Number(e.valeur.supplement_prix).toFixed(2)}
                                </span>
                              )}
                            </button>
                            {!e.disponible && (
                              <Raison etat={e} onBasculer={basculerVers} />
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )
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

                {g.type === "taille" && (
                  <ChoixDeTaille
                    groupe={g as GroupeTaille}
                    mesureGroupe={ordonnes.find((x) => x.id === (g as GroupeTaille).mesure_groupe_id) ?? null}
                    mesure={
                      (g as GroupeTaille).mesure_groupe_id
                        ? choix[(g as GroupeTaille).mesure_groupe_id!]?.nombre ?? null
                        : null
                    }
                    retenue={valeurRetenue(g, choix) as Taille | null}
                    choisieDirectement={choix[g.id]?.taille_choisie_directement === true}
                    dense={mode === "liste"}
                    onChoisir={(t, directement) =>
                      poser(g.id, { valeur_id: t?.id ?? null, taille_choisie_directement: directement })
                    }
                  />
                )}

                {g.type === "mesure" && (
                  <ChampMesure
                    groupe={g}
                    nombre={choix[g.id]?.nombre ?? null}
                    acceptee={choix[g.id]?.alerte_acceptee === true}
                    onSaisir={(nombre, alerte_acceptee) =>
                      poser(g.id, { nombre, alerte_acceptee })
                    }
                  />
                )}
              </fieldset>
            );
          })}

          {/* Récapitulatif, en permanence sous les choix */}
          <div style={{ border: BORDURE, borderRadius: 16, backgroundColor: "#FFFFFF", padding: 14 }}>
            <h3 style={{ color: MARINE, fontSize: 16, fontWeight: 700, margin: "0 0 10px" }}>
              Récapitulatif
            </h3>

            <div style={{ display: "grid", gap: 8 }}>
              {etats.map(({ groupe: g, actif }) => {
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
                        {!actif
                          ? "En attente"
                          : g.type === "mesure"
                            ? (choix[g.id]?.nombre === null || choix[g.id]?.nombre === undefined
                                ? (manque ? "À indiquer" : "—")
                                : formatMesure(choix[g.id]?.nombre, uniteMesure(g)))
                            : g.type === "taille"
                              ? (v?.libelle ?? (manque ? "À déterminer" : "—"))
                            : g.type === "texte"
                              ? (texte || (manque ? "À choisir" : "—"))
                              : g.type === "booleen"
                                ? (v ? v.libelle : "Non")
                                : (v?.libelle ?? (manque ? "À choisir" : "—"))}
                      </span>
                    </span>
                    {(() => {
                      // Le montant montré est celui qui s'applique VRAIMENT :
                      // celui de la combinaison quand il y en a un.
                      const montant =
                        g.type === "mesure"
                          ? supplementMesure(g, choix[g.id]?.nombre ?? null)
                          : v
                            ? supplementApplique(v, ordonnes, choix, dependances)
                            : 0;
                      return montant > 0 ? (
                        <span style={{ color: SOUS, fontSize: 14, whiteSpace: "nowrap" }}>
                          +{montant.toFixed(2)}
                        </span>
                      ) : null;
                    })()}
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
                  <span>
                    {d.groupe} — {d.libelle}
                    {d.contexte ? ` (${d.contexte})` : ""}
                  </span>
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

          {noteFin && <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>{noteFin}</p>}
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
              <p style={{ color: GRENAT, fontSize: 13, margin: "6px 0 0", textAlign: "center" }}>
                {refusMesures
                  ? refusMesures
                  : aConfirmer.length > 0
                    ? `Confirmez la mesure : ${enumererFr(aConfirmer)}.`
                    : messageManquants(manquants)}
              </p>
            )}
          </div>
        </div>
      )}

      {agrandie && <Loupe valeur={agrandie} onFermer={() => setAgrandie(null)} />}
    </div>
  );
}

/** Filtre d'un groupe : « bleu » ne laisse que les bleus. */
function filtrer(etat: EtatGroupe, recherche: string): EtatValeur[] {
  const q = recherche.trim().toLowerCase();
  if (!q) return etat.valeurs;
  return etat.valeurs.filter((e) => e.valeur.libelle.toLowerCase().includes(q));
}

function BoutonMode({
  actuel, valeur, libelle, onChoisir,
}: {
  actuel: Affichage; valeur: Affichage; libelle: string; onChoisir: (v: Affichage) => void;
}) {
  const ici = actuel === valeur;
  return (
    <button
      type="button"
      onClick={() => onChoisir(valeur)}
      aria-pressed={ici}
      style={{
        // 44 px : c'est le doigt qui décide, pas la place que ça prend.
        minHeight: CIBLE, padding: "0 14px", borderRadius: 999, fontSize: 14,
        fontWeight: ici ? 700 : 500, fontFamily: "inherit", cursor: "pointer",
        border: ici ? `1px solid ${VERT}` : BORDURE,
        backgroundColor: ici ? "#F1F8F6" : "#FFFFFF",
        color: ici ? "#1F6E5B" : SOUS,
      }}
    >
      {libelle}
    </button>
  );
}

/** La raison d'une indisponibilité, écrite — et le raccourci pour y remédier. */
function Raison({
  etat,
  onBasculer,
}: {
  etat: EtatValeur;
  onBasculer: (v: OptionValeur) => void;
}) {
  return (
    <span style={{ display: "block" }}>
      <span style={{ display: "block", color: GRENAT, fontSize: 12, lineHeight: 1.3 }}>
        {etat.raison}
      </span>
      {etat.requises.length === 1 && (
        <button
          type="button"
          onClick={() => onBasculer(etat.requises[0])}
          style={{
            marginTop: 2, minHeight: 32, padding: "0 8px", borderRadius: 8,
            border: `1px solid ${VERT}`, backgroundColor: "#FFFFFF", color: "#1F6E5B",
            fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
          }}
        >
          Passer en {etat.requises[0].libelle}
        </button>
      )}
    </span>
  );
}

// ── Liste dense : le comptoir ───────────────────────────────────────────────

function ListeValeurs({
  valeurs,
  choisie,
  onChoisir,
  onAgrandir,
  onBasculer,
  avecVignette = false,
}: {
  valeurs: EtatValeur[];
  choisie: OptionValeur | null;
  onChoisir: (v: OptionValeur) => void;
  onAgrandir?: (v: OptionValeur) => void;
  onBasculer: (v: OptionValeur) => void;
  avecVignette?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {valeurs.map((e) => {
        const retenue = choisie?.id === e.valeur.id;
        const url = urlPhotoArticle(e.valeur.image_path);
        return (
          <div key={e.valeur.id}>
            {/* Toute la ligne sélectionne : dense, balayable au pouce. */}
            <button
              type="button"
              onClick={() => e.disponible && onChoisir(e.valeur)}
              aria-pressed={retenue}
              aria-disabled={!e.disponible}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                minHeight: CIBLE, padding: "6px 10px", borderRadius: 10, textAlign: "left",
                border: retenue ? `2px solid ${VERT}` : BORDURE,
                backgroundColor: retenue ? "#F1F8F6" : e.disponible ? "#FFFFFF" : "#F2F0EC",
                fontFamily: "inherit",
                cursor: e.disponible ? "pointer" : "not-allowed",
                opacity: e.disponible ? 1 : 0.7,
              }}
            >
              {avecVignette && (
                url ? (
                  // Vignette du bucket public de la boutique.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" width={32} height={32} style={{
                    width: 32, height: 32, flexShrink: 0, borderRadius: 6,
                    objectFit: "cover", border: BORDURE,
                  }} />
                ) : (
                  <span aria-hidden="true" style={{
                    width: 32, height: 32, flexShrink: 0, borderRadius: 6, border: BORDURE,
                    backgroundColor: e.valeur.code_couleur ?? "#EDE8DF", display: "inline-block",
                  }} />
                )
              )}

              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                  display: "block", fontSize: 15, fontWeight: retenue ? 700 : 500,
                  color: e.disponible ? MARINE : SOUS, overflowWrap: "anywhere",
                }}>
                  {retenue && "✓ "}{e.valeur.libelle}
                </span>
              </span>

              {Number(e.valeur.supplement_prix) > 0 && (
                <span style={{ color: SOUS, fontSize: 14, whiteSpace: "nowrap" }}>
                  +{Number(e.valeur.supplement_prix).toFixed(2)}
                </span>
              )}

              {onAgrandir && url && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Agrandir ${e.valeur.libelle}`}
                  onClick={(ev) => { ev.stopPropagation(); onAgrandir(e.valeur); }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      ev.stopPropagation();
                      onAgrandir(e.valeur);
                    }
                  }}
                  style={{
                    minWidth: CIBLE, minHeight: CIBLE, display: "inline-flex",
                    alignItems: "center", justifyContent: "center", borderRadius: 8,
                    border: BORDURE, color: SOUS, fontSize: 14, cursor: "pointer",
                  }}
                >
                  🔍
                </span>
              )}
            </button>

            {!e.disponible && (
              <span style={{ display: "block", padding: "2px 10px 0" }}>
                <Raison etat={e} onBasculer={onBasculer} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Grille de coloris : l'espace client ─────────────────────────────────────

function GrilleCouleurs({
  valeurs,
  choisie,
  onChoisir,
  onAgrandir,
  onBasculer,
}: {
  valeurs: EtatValeur[];
  choisie: OptionValeur | null;
  onChoisir: (v: OptionValeur) => void;
  onAgrandir: (v: OptionValeur) => void;
  onBasculer: (v: OptionValeur) => void;
}) {
  return (
    <div
      style={{
        display: "grid", gap: 10,
        gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
      }}
    >
      {valeurs.map((e) => {
        const v = e.valeur;
        const retenue = choisie?.id === v.id;
        const url = urlPhotoArticle(v.image_path);
        return (
          <div key={v.id} style={{ display: "grid", gap: 4 }}>
            <button
              type="button"
              onClick={() => e.disponible && onChoisir(v)}
              onDoubleClick={() => onAgrandir(v)}
              aria-pressed={retenue}
              aria-disabled={!e.disponible}
              aria-label={`${v.libelle}${retenue ? " (retenu)" : ""}${e.disponible ? "" : " — indisponible"}`}
              style={{
                position: "relative", width: "100%", aspectRatio: "1 / 1",
                minHeight: 96, borderRadius: 12, padding: 0, overflow: "hidden",
                border: retenue ? `3px solid ${VERT}` : BORDURE,
                backgroundColor: v.code_couleur ?? "#EDE8DF",
                cursor: e.disponible ? "pointer" : "not-allowed",
                fontFamily: "inherit",
                // Grisée, pas masquée : le coloris existe, ailleurs.
                filter: e.disponible ? "none" : "grayscale(1)",
                opacity: e.disponible ? 1 : 0.55,
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

            {!e.disponible && <Raison etat={e} onBasculer={onBasculer} />}

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

/**
 * Un champ de mesure.
 *
 * Le schéma vient AVANT le champ : on regarde où poser le mètre, puis on
 * saisit. L'inverse ferait ressaisir. Le clavier est numérique — sur un
 * téléphone, un clavier de texte pour écrire « 38 » est une petite cruauté.
 *
 * Deux sortes de bornes : celles qui refusent (l'impossible) et celles qui
 * demandent confirmation (l'improbable). La seconde ne bloque jamais : on
 * coche « Oui, c'est correct » et la commande passe.
 */
function ChampMesure({
  groupe,
  nombre,
  acceptee,
  onSaisir,
}: {
  groupe: OptionGroupe;
  nombre: number | null;
  acceptee: boolean;
  onSaisir: (nombre: number | null, alerteAcceptee: boolean) => void;
}) {
  const [brut, setBrut] = useState(nombre === null || nombre === undefined ? "" : String(nombre));
  const unite = uniteMesure(groupe);
  const guide = urlPhotoArticle(groupe.guide_image_path ?? null);

  const lu = (() => {
    const t = brut.replace(",", ".").trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  })();

  const refus = brut.trim() ? refusMesure(groupe, lu) : null;
  const alerte = refus ? null : alerteMesure(groupe, lu);
  const supplement = supplementMesure(groupe, lu);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {guide && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={guide}
          alt={`Où mesurer : ${groupe.nom}`}
          style={{ width: "100%", maxWidth: 320, borderRadius: 12, border: BORDURE }}
        />
      )}

      <div style={{ position: "relative", maxWidth: 220 }}>
        <input
          id={`mesure-${groupe.id}`}
          type="text"
          inputMode="decimal"
          value={brut}
          onChange={(e) => {
            const v = e.target.value;
            setBrut(v);
            const t = v.replace(",", ".").trim();
            const n = t ? Number(t) : NaN;
            // Changer la mesure remet l'alerte en jeu : une confirmation vaut
            // pour le nombre confirmé, pas pour tous les suivants.
            onSaisir(Number.isFinite(n) ? n : null, false);
          }}
          aria-label={`${groupe.nom} en ${unite}`}
          aria-invalid={refus ? true : undefined}
          style={{
            width: "100%", minHeight: CIBLE + 6, padding: "10px 52px 10px 14px",
            border: refus ? `2px solid ${GRENAT}` : BORDURE,
            borderRadius: 12, fontSize: 18, color: MARINE, backgroundColor: "#FFFFFF",
            fontFamily: "inherit", boxSizing: "border-box",
          }}
        />
        <span
          aria-hidden
          style={{
            position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
            color: SOUS, fontSize: 16, pointerEvents: "none",
          }}
        >
          {unite}
        </span>
      </div>

      {refus && (
        <p role="alert" style={{
          color: GRENAT, backgroundColor: "#FDECEC", border: "1px solid #F0C2C2",
          borderRadius: 10, padding: "8px 10px", fontSize: 14, fontWeight: 600, margin: 0,
        }}>
          {refus}
        </p>
      )}

      {alerte && (
        <div style={{
          backgroundColor: "#F4EAC9", border: "1px solid #C9A84C",
          borderRadius: 10, padding: "10px 12px",
        }}>
          <p style={{ color: "#6E5410", fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>
            {alerte}
          </p>
          <button
            type="button"
            aria-pressed={acceptee}
            onClick={() => onSaisir(lu, !acceptee)}
            style={{
              minHeight: CIBLE, padding: "8px 14px", borderRadius: 12,
              border: acceptee ? `2px solid ${VERT}` : BORDURE,
              backgroundColor: acceptee ? "#F1F8F6" : "#FFFFFF",
              color: MARINE, fontSize: 15, fontWeight: 600, fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            {acceptee ? "✓ Oui, c'est correct" : "Oui, c'est correct"}
          </button>
        </div>
      )}

      {supplement > 0 && !refus && (
        <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>
          Au-delà de {formatMesure(groupe.seuil_supplement, unite)}, un supplément de{" "}
          {supplement.toFixed(2)} CHF s&apos;applique.
        </p>
      )}
    </div>
  );
}

/**
 * Le choix d'une taille — DEUX chemins, côte à côte, sans que l'un ait l'air
 * du vrai et l'autre d'un repli.
 *
 * Beaucoup de clients connaissent la taille de leur chien ; beaucoup d'autres
 * non. Celui qui sait choisit dans la liste et n'a rien à mesurer ; celui qui
 * ne sait pas saisit le tour de cou et lit la taille en clair. Les deux
 * commandes sont valables.
 */
function ChoixDeTaille({
  groupe,
  mesureGroupe,
  mesure,
  retenue,
  choisieDirectement,
  dense = false,
  onChoisir,
}: {
  groupe: GroupeTaille;
  mesureGroupe: OptionGroupe | null;
  mesure: number | null;
  retenue: Taille | null;
  choisieDirectement: boolean;
  /**
   * Le comptoir, où l'on connaît la gamme et où l'on va vite : une ligne au
   * lieu d'un encadré, pas de phrase d'accompagnement, les tailles côte à
   * côte. Le parcours client, lui, rassure un débutant — ce n'est pas le même
   * métier, et ce n'est donc pas le même écran.
   */
  dense?: boolean;
  onChoisir: (taille: Taille | null, directement: boolean) => void;
}) {
  const determination = determinerTaille(groupe, mesure);
  const tailles = taillesTriees(groupe);
  const deduction = libelleDeduction(groupe, mesureGroupe, mesure, retenue);

  if (dense) {
    return (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
        {determination.etat === "trouvee" && !choisieDirectement && (
          <span style={{
            backgroundColor: "#F1F8F6", border: `1px solid ${VERT}`, borderRadius: 10,
            padding: "6px 10px", color: MARINE, fontSize: 15, fontWeight: 700, whiteSpace: "nowrap",
          }}>
            → {retenue?.libelle ?? "—"}
          </span>
        )}
        {determination.etat === "hors_grille" && (
          <span style={{ color: "#6E5410", fontSize: 14, fontWeight: 600 }}>
            {determination.message}
          </span>
        )}
        {tailles.map((t) => {
          const active = retenue?.id === t.id;
          return (
            <button key={t.id} type="button" aria-pressed={active}
              onClick={() => onChoisir(t, true)}
              style={{
                minHeight: CIBLE, padding: "0 14px", borderRadius: 10,
                border: active ? `2px solid ${VERT}` : BORDURE,
                backgroundColor: active ? "#F1F8F6" : "#FFFFFF",
                color: MARINE, fontSize: 15, fontWeight: active ? 700 : 500,
                fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
              }}>
              {t.libelle}
              {Number(t.supplement_prix) > 0 && (
                <span style={{ color: SOUS, fontWeight: 400 }}>
                  {" "}+{Number(t.supplement_prix).toFixed(0)}
                </span>
              )}
            </button>
          );
        })}
        {/* Plusieurs plages : au comptoir on les montre en une ligne. */}
        {!choisieDirectement && determination.etat === "trouvee" && determination.propositions.length > 1 && (
          <span style={{ color: SOUS, fontSize: 13, flex: "1 1 200px", minWidth: 0 }}>
            {determination.propositions.map((p) => p.taille.libelle).join(" ou ")} conviennent
            — {determination.propositions[0].taille.libelle} est la mieux réglée.
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Ce que la mesure a donné, écrit en clair. */}
      {!choisieDirectement && determination.etat === "trouvee" && deduction && (
        <p style={{
          backgroundColor: "#F1F8F6", border: `1px solid ${VERT}`, borderRadius: 12,
          padding: "10px 12px", margin: 0, color: MARINE, fontSize: 16, fontWeight: 700,
        }}>
          {deduction}
          <span style={{ display: "block", color: SOUS, fontSize: 14, fontWeight: 400, marginTop: 2 }}>
            {determination.propositions[0].raison}
          </span>
        </p>
      )}

      {/* Plusieurs plages conviennent : on les propose TOUTES, la mieux
          ajustée en tête. On ne choisit pas à la place du client. */}
      {!choisieDirectement && determination.etat === "trouvee" && determination.propositions.length > 1 && (
        <div style={{ display: "grid", gap: 8 }}>
          <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>
            Deux tailles conviennent à votre chien. La première est celle où il est le mieux
            réglé — c&apos;est celle que nous recommandons.
          </p>
          {determination.propositions.map((prop, rang) => {
            const active = retenue?.id === prop.taille.id;
            return (
              <button
                key={prop.taille.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChoisir(prop.taille, false)}
                style={{
                  width: "100%", minHeight: CIBLE + 12, padding: "10px 14px", textAlign: "left",
                  borderRadius: 14, border: active ? `2px solid ${VERT}` : BORDURE,
                  backgroundColor: active ? "#F1F8F6" : "#FFFFFF",
                  color: MARINE, fontSize: 16, fontFamily: "inherit", cursor: "pointer",
                }}
              >
                <span style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700 }}>{active ? "✓ " : ""}Taille {prop.taille.libelle}</span>
                  {rang === 0 && (
                    <span style={{
                      backgroundColor: VERT, color: "#FFFFFF", borderRadius: 999,
                      padding: "2px 10px", fontSize: 12, fontWeight: 700,
                    }}>
                      Recommandé
                    </span>
                  )}
                  {Number(prop.taille.supplement_prix) > 0 && (
                    <span style={{ color: SOUS, fontSize: 14 }}>
                      +{Number(prop.taille.supplement_prix).toFixed(2)}
                    </span>
                  )}
                </span>
                <span style={{ display: "block", color: SOUS, fontSize: 14, marginTop: 2 }}>
                  {prop.raison}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Hors grille : on le dit, et on propose le sur-mesure. */}
      {!choisieDirectement && determination.etat === "hors_grille" && (
        <p role="alert" style={{
          backgroundColor: "#F4EAC9", border: "1px solid #C9A84C", borderRadius: 12,
          padding: "10px 12px", margin: 0, color: "#6E5410", fontSize: 15, fontWeight: 600,
        }}>
          {determination.message}
        </p>
      )}

      {/* L'autre chemin : choisir la taille soi-même. */}
      <div>
        <p style={{ color: SOUS, fontSize: 14, margin: "0 0 8px" }}>
          {choisieDirectement
            ? "Vous avez choisi la taille vous-même. Vous pouvez revenir à la mesure à tout moment."
            : mesure === null
              ? "Vous connaissez déjà la taille de votre chien ? Choisissez-la directement."
              : "Ou choisissez une autre taille vous-même :"}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tailles.map((t) => {
            const active = retenue?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChoisir(t, true)}
                style={{
                  minHeight: CIBLE, padding: "0 16px", borderRadius: 12,
                  border: active ? `2px solid ${VERT}` : BORDURE,
                  backgroundColor: active ? "#F1F8F6" : "#FFFFFF",
                  color: MARINE, fontSize: 16, fontWeight: active ? 700 : 500,
                  fontFamily: "inherit", cursor: "pointer",
                }}
              >
                {active && "✓ "}{t.libelle}
                {Number(t.supplement_prix) > 0 && (
                  <span style={{ color: SOUS, fontWeight: 400 }}>
                    {" "}+{Number(t.supplement_prix).toFixed(2)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {choisieDirectement && (
          <button
            type="button"
            onClick={() => onChoisir(null, false)}
            style={{
              minHeight: CIBLE, marginTop: 10, padding: "0 14px", borderRadius: 12,
              border: BORDURE, backgroundColor: "#FFFFFF", color: MARINE,
              fontSize: 15, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            ↩︎ Revenir à la taille déduite de la mesure
          </button>
        )}
      </div>
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
