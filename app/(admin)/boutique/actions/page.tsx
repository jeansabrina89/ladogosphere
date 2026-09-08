import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { listerPromotions } from "@/src/lib/promotions";
import { aujourdhuiISO } from "@/src/lib/dates";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import ListePromotions from "./ListePromotions";

export const dynamic = "force-dynamic";

/**
 * Boutique → Actions : les trois rubriques de la vitrine.
 *
 * Décider d'un prix n'est pas encaisser : l'écran demande « Boutique —
 * gestion », comme la fiche article et l'inventaire.
 */
export default async function ActionsBoutiquePage() {
  await exigerAccesAdmin("perm_boutique_gestion");
  const rubriques = await listerPromotions();

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto" style={{ minWidth: 0 }}>
        <EnTete
          titre="🏷️ Actions"
          sousTitre="Nouveautés, Action du mois, Anti-gaspillage. Une rubrique vide ne s'affiche pas en boutique."
          action={
            <Bouton href="/boutique/actions/nouvelle" variante="principal">+ Nouvelle rubrique</Bouton>
          }
        />

        <Carte>
          <p style={{ color: "rgba(27,43,94,0.58)", fontSize: 13.5, margin: 0 }}>
            Une action et la remise membre ne s&apos;additionnent jamais sur un même
            article : la plus avantageuse pour le client s&apos;applique, et la remise
            membre continue de jouer pleinement sur le reste du panier. Une action
            terminée ne change aucun document déjà émis.
          </p>
        </Carte>

        <Carte>
          <ListePromotions rubriques={rubriques} aujourdhui={aujourdhuiISO()} />
        </Carte>
      </div>
    </main>
  );
}
