"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  enregistrerGroupe,
  supprimerGroupe,
  deplacerGroupe,
  ordonnerGroupes,
  enregistrerValeur,
  basculerValeur,
  supprimerValeur,
  deplacerValeur,
  dupliquerDepuis,
} from "./actions";
import {
  TYPES_GROUPE,
  libelleTypeGroupe,
  type OptionGroupe,
  type OptionValeur,
  type TypeGroupe,
} from "@/src/lib/personnalisationLogique";
import { urlPhotoArticle } from "@/src/lib/boutiqueLogique";

/**
 * Catalogue d'options d'un article personnalisable.
 *
 * Pensé pour la saisie en série : le formulaire d'ajout d'un coloris reste
 * ouvert et empile les vignettes au-dessus, et un dépôt multiple crée une
 * valeur par image en reprenant le nom du fichier. Le réordonnancement se fait
 * au glisser ET par deux boutons — le glisser seul ne suffit pas sur mobile.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.14)";
const VERT = "#2E8B7E";
const CIBLE = 44;

const champ: React.CSSProperties = {
  width: "100%", minHeight: CIBLE, padding: "10px 12px", border: BORDURE,
  borderRadius: 12, fontSize: 16, color: MARINE, backgroundColor: "#FFFFFF",
  fontFamily: "inherit", boxSizing: "border-box",
};

const etiquette: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600, color: MARINE, marginBottom: 4,
};

const bouton: React.CSSProperties = {
  minHeight: CIBLE, padding: "0 14px", borderRadius: 12, border: BORDURE,
  backgroundColor: "#FFFFFF", color: MARINE, fontSize: 15, fontWeight: 600,
  fontFamily: "inherit", cursor: "pointer",
};

const boutonPrincipal: React.CSSProperties = {
  ...bouton, backgroundColor: VERT, color: "#FFFFFF", border: "none",
};

const carreOrdre: React.CSSProperties = {
  width: CIBLE, height: CIBLE, flexShrink: 0, borderRadius: 10, border: BORDURE,
  backgroundColor: "#FFFFFF", color: MARINE, fontSize: 16, fontWeight: 700,
  fontFamily: "inherit", cursor: "pointer", lineHeight: 1,
};

export default function GestionOptions({
  articleId,
  groupes,
  fournitures,
  sources,
}: {
  articleId: string;
  groupes: OptionGroupe[];
  /** Articles marqués « fourniture », consommables par un choix. */
  fournitures: { id: string; nom: string; unite: string }[];
  /** Autres articles personnalisables, pour la duplication. */
  sources: { id: string; nom: string; reference: string; nbGroupes: number }[];
}) {
  const router = useRouter();
  const [ouverts, setOuverts] = useState<Record<string, boolean>>(
    Object.fromEntries(groupes.map((g) => [g.id, true]))
  );
  const [nouveauGroupe, setNouveauGroupe] = useState(false);
  const [groupeModifie, setGroupeModifie] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [glisse, setGlisse] = useState<string | null>(null);
  const [source, setSource] = useState("");

  function suite(res: { error?: string; message?: string }) {
    setErreur(res.error ?? null);
    setAvis(res.error ? null : res.message ?? null);
    if (!res.error) router.refresh();
    return !res.error;
  }

  async function deposerOrdre(cibleId: string) {
    if (!glisse || glisse === cibleId) return setGlisse(null);
    const ids = groupes.map((g) => g.id);
    const de = ids.indexOf(glisse);
    const vers = ids.indexOf(cibleId);
    ids.splice(vers, 0, ids.splice(de, 1)[0]);
    setGlisse(null);
    suite(await ordonnerGroupes(articleId, ids));
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {erreur && (
        <p role="alert" style={{
          backgroundColor: "#FDECEC", color: "#8A1F1F", border: "1px solid #F0C2C2",
          borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 600, margin: 0,
        }}>
          ⚠️ {erreur}
        </p>
      )}
      {avis && (
        <p role="status" style={{
          backgroundColor: "#E4F1EC", color: "#1F6E5B", border: "1px solid #B9DDD1",
          borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 600, margin: 0,
        }}>
          ✅ {avis}
        </p>
      )}

      {groupes.length === 0 && !nouveauGroupe && (
        <p style={{ color: SOUS, fontSize: 15, margin: 0 }}>
          Aucun groupe d&apos;options. Ajoutez-en un, ou copiez ceux d&apos;un autre article.
        </p>
      )}

      {groupes.map((g, i) => (
        <div
          key={g.id}
          draggable
          onDragStart={() => setGlisse(g.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => deposerOrdre(g.id)}
          style={{
            border: glisse === g.id ? `2px dashed ${VERT}` : BORDURE,
            borderRadius: 16, backgroundColor: "#FFFFFF", padding: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" aria-label={`Monter ${g.nom}`} disabled={i === 0}
              onClick={async () => suite(await deplacerGroupe(articleId, g.id, "haut"))}
              style={{ ...carreOrdre, opacity: i === 0 ? 0.4 : 1 }}>↑</button>
            <button type="button" aria-label={`Descendre ${g.nom}`} disabled={i === groupes.length - 1}
              onClick={async () => suite(await deplacerGroupe(articleId, g.id, "bas"))}
              style={{ ...carreOrdre, opacity: i === groupes.length - 1 ? 0.4 : 1 }}>↓</button>

            <button
              type="button"
              onClick={() => setOuverts({ ...ouverts, [g.id]: !ouverts[g.id] })}
              style={{ ...bouton, border: "none", flex: 1, textAlign: "left", minWidth: 0 }}
            >
              <span style={{ display: "block", color: MARINE, fontSize: 16, fontWeight: 700 }}>
                {ouverts[g.id] ? "▾" : "▸"} {g.nom}
              </span>
              <span style={{ display: "block", color: SOUS, fontSize: 13, fontWeight: 400 }}>
                {libelleTypeGroupe(g.type)}
                {g.obligatoire ? " · obligatoire" : " · facultatif"}
                {g.type !== "texte" && g.type !== "booleen" ? ` · ${g.valeurs.length} option${g.valeurs.length > 1 ? "s" : ""}` : ""}
                {g.max_caracteres ? ` · ${g.max_caracteres} caractères` : ""}
              </span>
            </button>

            <button type="button" onClick={() => setGroupeModifie(groupeModifie === g.id ? null : g.id)}
              style={bouton}>✏️</button>
            <button type="button" style={{ ...bouton, color: "#A8453A" }}
              onClick={async () => suite(await supprimerGroupe(articleId, g.id))}>🗑️</button>
          </div>

          {groupeModifie === g.id && (
            <FormGroupe
              articleId={articleId}
              groupe={g}
              onFini={(res) => { if (suite(res)) setGroupeModifie(null); }}
              onAnnuler={() => setGroupeModifie(null)}
            />
          )}

          {ouverts[g.id] && (
            <div style={{ marginTop: 14 }}>
              {g.aide && (
                <p style={{ color: SOUS, fontSize: 14, margin: "0 0 12px" }}>{g.aide}</p>
              )}

              {g.type === "texte" ? (
                <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>
                  Ce groupe est un champ de texte : il n&apos;a pas d&apos;options à lister.
                  {g.max_caracteres ? ` La saisie est bornée à ${g.max_caracteres} caractères.` : ""}
                </p>
              ) : (
                <Valeurs
                  articleId={articleId}
                  groupe={g}
                  fournitures={fournitures}
                  onRetour={suite}
                />
              )}
            </div>
          )}
        </div>
      ))}

      {nouveauGroupe ? (
        <div style={{ border: BORDURE, borderRadius: 16, backgroundColor: "#FFFFFF", padding: 14 }}>
          <h3 style={{ color: MARINE, fontSize: 16, fontWeight: 700, margin: "0 0 10px" }}>
            Nouveau groupe d&apos;options
          </h3>
          <FormGroupe
            articleId={articleId}
            onFini={(res) => { if (suite(res)) setNouveauGroupe(false); }}
            onAnnuler={() => setNouveauGroupe(false)}
          />
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setNouveauGroupe(true)} style={boutonPrincipal}>
            + Groupe d&apos;options
          </button>
        </div>
      )}

      {sources.length > 0 && (
        <div style={{ border: BORDURE, borderRadius: 16, backgroundColor: "#FBF9F5", padding: 14 }}>
          <h3 style={{ color: MARINE, fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>
            Dupliquer les options depuis un autre article
          </h3>
          <p style={{ color: SOUS, fontSize: 14, margin: "0 0 10px" }}>
            Les groupes et les options sont copiés, pas partagés : chaque article reste
            indépendant ensuite.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select value={source} onChange={(e) => setSource(e.target.value)}
              style={{ ...champ, flex: "1 1 220px", width: "auto" }} aria-label="Article source">
              <option value="">— Choisir un article —</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom} ({s.nbGroupes} groupe{s.nbGroupes > 1 ? "s" : ""})
                </option>
              ))}
            </select>
            <button type="button" disabled={!source} style={{ ...bouton, opacity: source ? 1 : 0.5 }}
              onClick={async () => { if (suite(await dupliquerDepuis(articleId, source))) setSource(""); }}>
              Copier ici
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Formulaire d'un groupe ──────────────────────────────────────────────────

function FormGroupe({
  articleId,
  groupe,
  onFini,
  onAnnuler,
}: {
  articleId: string;
  groupe?: OptionGroupe;
  onFini: (res: { error?: string; message?: string }) => void;
  onAnnuler: () => void;
}) {
  const [nom, setNom] = useState(groupe?.nom ?? "");
  const [type, setType] = useState<TypeGroupe>(groupe?.type ?? "couleur");
  const [obligatoire, setObligatoire] = useState(groupe?.obligatoire ?? true);
  const [aide, setAide] = useState(groupe?.aide ?? "");
  const [max, setMax] = useState(String(groupe?.max_caracteres ?? ""));
  const [enCours, setEnCours] = useState(false);

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 12, paddingTop: 12, borderTop: BORDURE }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div>
          <label htmlFor={`nom-${groupe?.id ?? "neuf"}`} style={etiquette}>Nom du groupe</label>
          <input id={`nom-${groupe?.id ?? "neuf"}`} type="text" value={nom}
            onChange={(e) => setNom(e.target.value)} style={champ}
            placeholder="Couleur de la sangle" />
        </div>
        <div>
          <label htmlFor={`type-${groupe?.id ?? "neuf"}`} style={etiquette}>Type</label>
          <select id={`type-${groupe?.id ?? "neuf"}`} value={type}
            onChange={(e) => setType(e.target.value as TypeGroupe)} style={champ}>
            {TYPES_GROUPE.map((t) => (
              <option key={t.valeur} value={t.valeur}>{t.libelle}</option>
            ))}
          </select>
          <p style={{ fontSize: 12, color: SOUS, margin: "4px 0 0" }}>
            {TYPES_GROUPE.find((t) => t.valeur === type)?.aide}
          </p>
        </div>
      </div>

      <div>
        <label htmlFor={`aide-${groupe?.id ?? "neuf"}`} style={etiquette}>
          Phrase d&apos;explication (facultative)
        </label>
        <input id={`aide-${groupe?.id ?? "neuf"}`} type="text" value={aide}
          onChange={(e) => setAide(e.target.value)} style={champ}
          placeholder="La teinte se juge en grand : touchez une vignette." />
      </div>

      {type === "texte" && (
        <div>
          <label htmlFor={`max-${groupe?.id ?? "neuf"}`} style={etiquette}>
            Nombre de caractères au maximum
          </label>
          <input id={`max-${groupe?.id ?? "neuf"}`} type="text" inputMode="numeric" value={max}
            onChange={(e) => setMax(e.target.value)} style={{ ...champ, maxWidth: 160 }}
            placeholder="20" />
        </div>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: MARINE }}>
        <input type="checkbox" checked={obligatoire} onChange={(e) => setObligatoire(e.target.checked)}
          style={{ width: 20, height: 20 }} />
        Choix obligatoire
      </label>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={enCours}
          style={boutonPrincipal}
          onClick={async () => {
            setEnCours(true);
            const res = await enregistrerGroupe({
              article_id: articleId, id: groupe?.id ?? null, nom, type, obligatoire,
              aide, max_caracteres: max ? Number(max) : null,
            });
            setEnCours(false);
            onFini(res);
          }}
        >
          {enCours ? "…" : "💾 Enregistrer"}
        </button>
        <button type="button" onClick={onAnnuler} style={bouton}>Annuler</button>
      </div>
    </div>
  );
}

// ── Valeurs d'un groupe ─────────────────────────────────────────────────────

function Valeurs({
  articleId,
  groupe,
  fournitures,
  onRetour,
}: {
  articleId: string;
  groupe: OptionGroupe;
  fournitures: { id: string; nom: string; unite: string }[];
  onRetour: (res: { error?: string; message?: string }) => boolean;
}) {
  const router = useRouter();
  const champFichiers = useRef<HTMLInputElement>(null);
  const [modifiee, setModifiee] = useState<string | null>(null);
  const [ajout, setAjout] = useState(false);
  const [depot, setDepot] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ ok: boolean; texte: string } | null>(null);
  const valeurs = [...groupe.valeurs].sort((a, b) => a.ordre - b.ordre);
  const estCouleur = groupe.type === "couleur";

  /**
   * Dépôt d'un lot de photos : l'indicateur reste affiché jusqu'à la réponse,
   * et cède la place à un résultat qui dit ce qui est passé et ce qui ne l'est
   * pas — fichier par fichier, avec la raison. Une image refusée n'empêche
   * jamais les autres.
   */
  async function deposerPlusieurs(fichiers: FileList | null) {
    if (!fichiers || fichiers.length === 0) return;
    const nb = fichiers.length;
    setResultat(null);
    setDepot(`Envoi de ${nb} image${nb > 1 ? "s" : ""}…`);

    const corps = new FormData();
    for (const f of Array.from(fichiers)) corps.append("photos", f);

    type Reponse = {
      creees?: { libelle: string }[];
      refuses?: { fichier: string; raison: string }[];
      error?: string;
    };

    let data: Reponse = {};
    let repondu = false;
    try {
      const r = await fetch(`/api/options/groupes/${groupe.id}/couleurs`, {
        method: "POST",
        body: corps,
      });
      data = (await r.json().catch(() => ({}))) as Reponse;
      repondu = r.ok;
    } catch {
      data = { error: "L'envoi n'a pas abouti. Vérifiez la connexion, puis réessayez." };
    }

    if (champFichiers.current) champFichiers.current.value = "";
    setDepot(null);

    if (!repondu) {
      setResultat({ ok: false, texte: data.error ?? "Le dépôt a échoué." });
      return;
    }

    const creees = data.creees ?? [];
    const refuses = data.refuses ?? [];

    const lignes = [
      creees.length > 0
        ? `${creees.length} coloris créé${creees.length > 1 ? "s" : ""}. Vérifiez les noms.`
        : "Aucun coloris créé.",
      ...(refuses.length > 0
        ? [
            `${refuses.length} image${refuses.length > 1 ? "s" : ""} refusée${refuses.length > 1 ? "s" : ""} :`,
            ...refuses.map((r) => `• ${r.fichier} — ${r.raison}`),
          ]
        : []),
    ];

    setResultat({ ok: refuses.length === 0 && creees.length > 0, texte: lignes.join("\n") });
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {/*
        Le champ de fichiers vit hors de toute condition : le chemin rapide
        doit rester disponible, que le formulaire d'ajout soit ouvert ou non.
      */}
      {estCouleur && (
        <input
          ref={champFichiers}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          style={{ display: "none" }}
          onChange={(e) => deposerPlusieurs(e.target.files)}
        />
      )}

      {valeurs.length === 0 && (
        estCouleur ? (
          // C'est le moment exact où l'on cherche quoi faire : on le dit.
          <p style={{
            color: MARINE, fontSize: 15, lineHeight: 1.5, margin: 0,
            backgroundColor: "#FBF9F5", border: "1px dashed rgba(27,43,94,0.22)",
            borderRadius: 12, padding: 14,
          }}>
            Aucun coloris pour l&apos;instant. Déposez toutes vos photos d&apos;un coup — un
            coloris sera créé par image, nommé d&apos;après le fichier — ou ajoutez-les une
            par une.
          </p>
        ) : (
          <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>Aucune option dans ce groupe.</p>
        )
      )}

      {valeurs.map((v, i) => (
        <div key={v.id} style={{
          border: BORDURE, borderRadius: 12, padding: 10,
          backgroundColor: v.actif ? "#FFFFFF" : "#FBF9F5", opacity: v.actif ? 1 : 0.65,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Vignette valeur={v} taille={44} />
            <span style={{ flex: 1, minWidth: 120 }}>
              <span style={{ display: "block", color: MARINE, fontSize: 15, fontWeight: 600 }}>
                {v.libelle}{v.defaut && " · par défaut"}
              </span>
              <span style={{ display: "block", color: SOUS, fontSize: 13 }}>
                {Number(v.supplement_prix) > 0 ? `+${Number(v.supplement_prix).toFixed(2)} CHF` : "sans supplément"}
                {Number(v.supplement_delai_jours) > 0 ? ` · +${v.supplement_delai_jours} j` : ""}
                {v.composant_article_id ? ` · ${v.composant_quantite} ${fournitures.find((f) => f.id === v.composant_article_id)?.unite ?? ""} de ${fournitures.find((f) => f.id === v.composant_article_id)?.nom ?? "fourniture"}` : ""}
                {!v.actif && " · désactivée"}
              </span>
            </span>

            <button type="button" aria-label={`Monter ${v.libelle}`} disabled={i === 0}
              onClick={async () => onRetour(await deplacerValeur(articleId, groupe.id, v.id, "haut"))}
              style={{ ...carreOrdre, opacity: i === 0 ? 0.4 : 1 }}>↑</button>
            <button type="button" aria-label={`Descendre ${v.libelle}`} disabled={i === valeurs.length - 1}
              onClick={async () => onRetour(await deplacerValeur(articleId, groupe.id, v.id, "bas"))}
              style={{ ...carreOrdre, opacity: i === valeurs.length - 1 ? 0.4 : 1 }}>↓</button>
            <button type="button" onClick={() => setModifiee(modifiee === v.id ? null : v.id)}
              style={bouton}>✏️</button>
            <button type="button" style={bouton}
              onClick={async () => onRetour(await basculerValeur(articleId, v.id, !v.actif))}>
              {v.actif ? "Désactiver" : "Réactiver"}
            </button>
            <button type="button" style={{ ...bouton, color: "#A8453A" }}
              onClick={async () => onRetour(await supprimerValeur(articleId, v.id))}>🗑️</button>
          </div>

          {modifiee === v.id && (
            <FormValeur
              articleId={articleId}
              groupe={groupe}
              valeur={v}
              fournitures={fournitures}
              onFini={(res) => { if (onRetour(res)) setModifiee(null); }}
              onAnnuler={() => setModifiee(null)}
            />
          )}
        </div>
      ))}

      {/*
        Le chemin rapide, au-dessus du formulaire et jamais masqué par lui :
        c'est celui qu'on prend pour entrer vingt coloris d'affilée.
      */}
      {estCouleur && (
        <div>
          <button
            type="button"
            onClick={() => champFichiers.current?.click()}
            disabled={depot !== null}
            style={{ ...boutonPrincipal, opacity: depot !== null ? 0.6 : 1 }}
          >
            📷 Déposer plusieurs photos
          </button>
          <p style={{ color: SOUS, fontSize: 12, margin: "6px 0 0" }}>
            Le nom du fichier devient le nom du coloris : « bleu-nuit.jpg » → « Bleu nuit ».
          </p>
        </div>
      )}

      {depot && (
        <p role="status" aria-live="polite" style={{
          color: MARINE, fontSize: 14, fontWeight: 600, margin: 0,
          backgroundColor: "#F1F8F6", border: `1px solid ${VERT}`,
          borderRadius: 10, padding: "8px 10px",
        }}>
          ⏳ {depot}
        </p>
      )}

      {resultat && (
        <p role="status" aria-live="polite" style={{
          fontSize: 14, fontWeight: 600, margin: 0, whiteSpace: "pre-line",
          borderRadius: 10, padding: "8px 10px",
          color: resultat.ok ? "#1F6E5B" : "#8A1F1F",
          backgroundColor: resultat.ok ? "#E4F1EC" : "#FDECEC",
          border: `1px solid ${resultat.ok ? "#B9DDD1" : "#F0C2C2"}`,
        }}>
          {resultat.ok ? "✅ " : "⚠️ "}{resultat.texte}
        </p>
      )}

      {ajout ? (
        <div style={{ border: `1px solid ${VERT}`, borderRadius: 12, padding: 10, backgroundColor: "#F6FBF9" }}>
          <FormValeur
            articleId={articleId}
            groupe={groupe}
            fournitures={fournitures}
            enSerie
            onFini={(res) => { onRetour(res); }}
            onAnnuler={() => setAjout(false)}
          />
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setAjout(true)} style={bouton}>
            + {estCouleur ? "Ajouter une couleur" : "Ajouter une option"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Formulaire d'une valeur ─────────────────────────────────────────────────

function FormValeur({
  articleId,
  groupe,
  valeur,
  fournitures,
  enSerie = false,
  onFini,
  onAnnuler,
}: {
  articleId: string;
  groupe: OptionGroupe;
  valeur?: OptionValeur;
  fournitures: { id: string; nom: string; unite: string }[];
  /** Saisie en série : le formulaire reste ouvert et se vide après chaque ajout. */
  enSerie?: boolean;
  onFini: (res: { error?: string; message?: string }) => void;
  onAnnuler: () => void;
}) {
  const router = useRouter();
  const champPhoto = useRef<HTMLInputElement>(null);
  const [libelle, setLibelle] = useState(valeur?.libelle ?? "");
  const [couleur, setCouleur] = useState(valeur?.code_couleur ?? "");
  const [prix, setPrix] = useState(String(valeur?.supplement_prix ?? "0"));
  const [delai, setDelai] = useState(String(valeur?.supplement_delai_jours ?? "0"));
  const [composant, setComposant] = useState(valeur?.composant_article_id ?? "");
  const [quantite, setQuantite] = useState(String(valeur?.composant_quantite ?? ""));
  const [defaut, setDefaut] = useState(valeur?.defaut ?? false);
  const [enCours, setEnCours] = useState(false);
  const [photoEnCours, setPhotoEnCours] = useState(false);

  async function envoyerPhoto(valeurId: string, fichier: File) {
    setPhotoEnCours(true);
    const corps = new FormData();
    corps.set("photo", fichier);
    const r = await fetch(`/api/options/valeurs/${valeurId}/photo`, { method: "POST", body: corps });
    setPhotoEnCours(false);
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      onFini({ error: data.error ?? "Le dépôt de la vignette a échoué." });
      return false;
    }
    router.refresh();
    return true;
  }

  async function enregistrer() {
    setEnCours(true);
    const res = await enregistrerValeur({
      article_id: articleId,
      groupe_id: groupe.id,
      id: valeur?.id ?? null,
      libelle,
      code_couleur: couleur,
      supplement_prix: prix,
      supplement_delai_jours: delai,
      composant_article_id: composant || null,
      composant_quantite: quantite,
      defaut,
    });

    // La photo choisie avant l'enregistrement part une fois la valeur créée.
    const fichier = champPhoto.current?.files?.[0];
    if (!res.error && res.id && fichier) await envoyerPhoto(res.id, fichier);

    setEnCours(false);
    onFini(res);

    if (!res.error && enSerie) {
      setLibelle("");
      setCouleur("");
      setPrix("0");
      setDelai("0");
      setQuantite("");
      setDefaut(false);
      if (champPhoto.current) champPhoto.current.value = "";
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, marginTop: valeur ? 12 : 0, paddingTop: valeur ? 12 : 0, borderTop: valeur ? BORDURE : "none" }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div>
          <label style={etiquette} htmlFor={`lib-${valeur?.id ?? "neuf"}`}>Nom</label>
          <input id={`lib-${valeur?.id ?? "neuf"}`} type="text" value={libelle} autoFocus={enSerie}
            onChange={(e) => setLibelle(e.target.value)} style={champ}
            placeholder={groupe.type === "couleur" ? "Bleu nuit" : "25 mm"}
            onKeyDown={(e) => { if (e.key === "Enter") enregistrer(); }} />
        </div>

        {groupe.type === "couleur" && (
          <div>
            <label style={etiquette} htmlFor={`coul-${valeur?.id ?? "neuf"}`}>
              Couleur de secours
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="color"
                aria-label="Sélecteur de couleur"
                value={/^#[0-9a-fA-F]{6}$/.test(couleur) ? couleur : "#1b2b5e"}
                onChange={(e) => setCouleur(e.target.value)}
                style={{ width: CIBLE, height: CIBLE, padding: 0, border: BORDURE, borderRadius: 10, background: "none" }}
              />
              <input id={`coul-${valeur?.id ?? "neuf"}`} type="text" value={couleur}
                onChange={(e) => setCouleur(e.target.value)} style={{ ...champ, flex: 1 }}
                placeholder="#1b2b5e" />
            </div>
            <p style={{ fontSize: 12, color: SOUS, margin: "4px 0 0" }}>
              Sert seulement quand aucune photo n&apos;est chargée.
            </p>
          </div>
        )}
      </div>

      {groupe.type === "couleur" && (
        <div>
          <label style={etiquette} htmlFor={`photo-${valeur?.id ?? "neuf"}`}>Photo du coloris</label>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {valeur && <Vignette valeur={valeur} taille={64} />}
            <input
              ref={champPhoto}
              id={`photo-${valeur?.id ?? "neuf"}`}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              style={{ ...champ, flex: "1 1 220px", width: "auto", paddingTop: 10 }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f && valeur) await envoyerPhoto(valeur.id, f);
              }}
            />
          </div>
          <p style={{ fontSize: 12, color: SOUS, margin: "4px 0 0" }}>
            {photoEnCours ? "Envoi…" : "JPEG, PNG, WebP ou HEIC. Convertie en vignette carrée automatiquement."}
          </p>
          {/* Les deux chemins se connaissent : celui-ci renvoie au rapide. */}
          <p style={{ fontSize: 12, color: SOUS, margin: "2px 0 0" }}>
            Vous pouvez aussi déposer toutes vos photos d&apos;un coup avec le bouton ci-dessus.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <div>
          <label style={etiquette} htmlFor={`prix-${valeur?.id ?? "neuf"}`}>Supplément (CHF)</label>
          <input id={`prix-${valeur?.id ?? "neuf"}`} type="text" inputMode="decimal" value={prix}
            onChange={(e) => setPrix(e.target.value)} style={champ} />
        </div>
        <div>
          <label style={etiquette} htmlFor={`delai-${valeur?.id ?? "neuf"}`}>Jours en plus</label>
          <input id={`delai-${valeur?.id ?? "neuf"}`} type="text" inputMode="numeric" value={delai}
            onChange={(e) => setDelai(e.target.value)} style={champ} />
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div>
          <label style={etiquette} htmlFor={`comp-${valeur?.id ?? "neuf"}`}>
            Fourniture consommée (facultatif)
          </label>
          <select id={`comp-${valeur?.id ?? "neuf"}`} value={composant}
            onChange={(e) => setComposant(e.target.value)} style={champ}>
            <option value="">— Aucune —</option>
            {fournitures.map((f) => (
              <option key={f.id} value={f.id}>{f.nom}</option>
            ))}
          </select>
        </div>
        {composant && (
          <div>
            <label style={etiquette} htmlFor={`qte-${valeur?.id ?? "neuf"}`}>
              Quantité ({fournitures.find((f) => f.id === composant)?.unite ?? "unité"})
            </label>
            <input id={`qte-${valeur?.id ?? "neuf"}`} type="text" inputMode="decimal" value={quantite}
              onChange={(e) => setQuantite(e.target.value)} style={champ} placeholder="1.2" />
          </div>
        )}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: MARINE }}>
        <input type="checkbox" checked={defaut} onChange={(e) => setDefaut(e.target.checked)}
          style={{ width: 20, height: 20 }} />
        Proposée par défaut
      </label>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" disabled={enCours} style={boutonPrincipal} onClick={enregistrer}>
          {enCours ? "…" : enSerie ? "＋ Ajouter et continuer" : "💾 Enregistrer"}
        </button>
        <button type="button" onClick={onAnnuler} style={bouton}>
          {enSerie ? "Terminer" : "Annuler"}
        </button>
      </div>
    </div>
  );
}

// ── Vignette d'une valeur ───────────────────────────────────────────────────

function Vignette({ valeur, taille }: { valeur: OptionValeur; taille: number }) {
  const url = urlPhotoArticle(valeur.image_path);
  const style: React.CSSProperties = {
    width: taille, height: taille, flexShrink: 0, borderRadius: 10,
    border: BORDURE, objectFit: "cover",
  };

  if (url) {
    // Vignette du bucket public de la boutique — servie telle quelle.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={taille} height={taille} style={style} />;
  }
  if (valeur.code_couleur) {
    return <span aria-hidden="true" style={{ ...style, backgroundColor: valeur.code_couleur, display: "inline-block" }} />;
  }
  return (
    <span aria-hidden="true" style={{
      ...style, backgroundColor: "#EDE8DF", color: SOUS, display: "inline-flex",
      alignItems: "center", justifyContent: "center", fontWeight: 700,
    }}>
      {valeur.libelle.slice(0, 1).toUpperCase()}
    </span>
  );
}
