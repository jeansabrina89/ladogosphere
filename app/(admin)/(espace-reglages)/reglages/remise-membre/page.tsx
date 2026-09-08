import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { lireRemisesCategories } from "@/src/lib/remiseMembre";
import {
  MENTION_SANS_EFFET_RETROACTIF,
  TEXTES_PUBLICS_REMISE_MEMBRE,
  avertissementTextesASuivre,
  resumeRemises,
} from "@/src/lib/remiseMembreLogique";
import { libelleCategorieArticle } from "@/src/lib/boutiqueLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import TableauRemises from "./TableauRemises";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.58)";

/**
 * Réglages → Remise membre.
 *
 * Le pourcentage se règle catégorie par catégorie. Ce que les clients LISENT
 * aujourd'hui est rappelé en tête : si une catégorie sort de la remise, ces
 * textes ne sont plus exacts — l'écran le signale, et ne les modifie pas
 * lui-même. Une phrase contractuelle ne se réécrit pas par effet de bord.
 */
export default async function RemiseMembrePage() {
  await exigerAdminPage();
  const lignes = await lireRemisesCategories();
  const avertissement = avertissementTextesASuivre(lignes, libelleCategorieArticle);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto" style={{ minWidth: 0 }}>
        <EnTete
          titre="🎫 Remise membre"
          sousTitre={resumeRemises(lignes)}
          action={<Bouton href="/reglages" variante="secondaire">← Réglages</Bouton>}
        />

        <Carte>
          <h2 style={{ margin: "0 0 8px", color: MARINE, fontSize: 16, fontWeight: 700 }}>
            Ce que vos clients lisent aujourd&apos;hui
          </h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: SOUS, fontSize: 14, display: "grid", gap: 6 }}>
            {TEXTES_PUBLICS_REMISE_MEMBRE.map((t) => (
              <li key={t.ou}>
                <span style={{ color: MARINE, fontWeight: 600 }}>{t.ou}</span> —
                {" "}« {t.texte} »
              </li>
            ))}
          </ul>
        </Carte>

        {avertissement && (
          <Carte>
            <p role="status" style={{
              backgroundColor: "#F4EAC9", color: "#6E5410", border: "1px solid #C9A84C",
              borderRadius: 12, padding: "12px 14px", fontSize: 15, fontWeight: 600, margin: 0,
            }}>
              ⚠️ {avertissement}
            </p>
          </Carte>
        )}

        <Carte>
          <TableauRemises lignes={lignes} />
        </Carte>

        <Carte>
          <p style={{ color: SOUS, fontSize: 13.5, margin: 0 }}>{MENTION_SANS_EFFET_RETROACTIF}</p>
          <p style={{ color: SOUS, fontSize: 13.5, margin: "8px 0 0" }}>
            Un article peut aussi être exclu <strong>individuellement</strong>, depuis
            sa fiche — case « Exclu de la remise membre ». Et sur une ligne, une
            action et la remise membre ne s&apos;additionnent jamais : la plus
            avantageuse pour le client s&apos;applique.
          </p>
        </Carte>
      </div>
    </main>
  );
}
