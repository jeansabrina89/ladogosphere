"use client";

import { urlPhotoArticle } from "@/src/lib/boutiqueLogique";
import type { ChoixParGroupe, OptionGroupe } from "@/src/lib/personnalisationLogique";
import { valeurRetenue } from "@/src/lib/personnalisationLogique";

/**
 * Emplacement de l'aperçu visuel du produit configuré.
 *
 * Aujourd'hui il montre la photo de l'article, et à défaut les coloris retenus.
 * Il est isolé ici, et reçoit les choix courants, pour qu'on puisse y brancher
 * un vrai rendu — superposition d'images, modèle 3D — sans toucher au
 * configurateur ni au récapitulatif.
 */
export default function ApercuPersonnalisation({
  nom,
  photoPath,
  groupes,
  choix,
}: {
  nom: string;
  photoPath: string | null;
  groupes: OptionGroupe[];
  choix: ChoixParGroupe;
}) {
  const url = urlPhotoArticle(photoPath);
  const BORDURE = "1px solid rgba(27,43,94,0.14)";
  const SOUS = "rgba(27,43,94,0.55)";

  // Les coloris retenus, à montrer même sans photo du produit.
  const teintes = groupes
    .filter((g) => g.type === "couleur")
    .map((g) => ({ groupe: g.nom, valeur: valeurRetenue(g, choix) }))
    .filter((t): t is { groupe: string; valeur: NonNullable<typeof t.valeur> } => t.valeur !== null);

  return (
    <div style={{
      border: BORDURE, borderRadius: 16, backgroundColor: "#FFFFFF",
      padding: 14, display: "grid", gap: 12,
    }}>
      {url ? (
        // Photo du bucket public de la boutique — servie telle quelle.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={nom} style={{
          width: "100%", maxHeight: 280, objectFit: "contain", borderRadius: 12,
        }} />
      ) : (
        <p style={{ color: SOUS, fontSize: 14, margin: 0, textAlign: "center", padding: "24px 0" }}>
          Pas encore d&apos;aperçu pour cet article.
        </p>
      )}

      {teintes.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {teintes.map((t) => (
            <div key={t.groupe} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Pastille valeur={t.valeur} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", color: SOUS, fontSize: 12 }}>{t.groupe}</span>
                <span style={{ display: "block", color: "#1B2B5E", fontSize: 14, fontWeight: 600 }}>
                  {t.valeur.libelle}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Pastille({ valeur }: { valeur: { libelle: string; image_path: string | null; code_couleur: string | null } }) {
  const url = urlPhotoArticle(valeur.image_path);
  const style: React.CSSProperties = {
    width: 32, height: 32, flexShrink: 0, borderRadius: 8,
    border: "1px solid rgba(27,43,94,0.2)", objectFit: "cover",
  };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={32} height={32} style={style} />;
  }
  return (
    <span aria-hidden="true" style={{
      ...style, display: "inline-block",
      backgroundColor: valeur.code_couleur ?? "#EDE8DF",
    }} />
  );
}
