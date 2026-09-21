import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { lireParametresEnLigne } from "@/src/lib/venteEnLigne";
import { libelleSeuil } from "@/src/lib/venteEnLigneLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import FormFrancoPort from "./FormFrancoPort";
import FormGrillePort from "./FormGrillePort";

export const dynamic = "force-dynamic";

/**
 * Réglages → Boutique.
 *
 * Tout ce qui chiffre l'envoi postal : le seuil de livraison offerte, la
 * grille des frais de port et le poids maximum d'un colis. Chaque changement
 * est tracé au journal ; aucune commande déjà confirmée ne bouge.
 */
export default async function ReglagesBoutiquePage() {
  await exigerAdminPage();
  const params = await lireParametresEnLigne();

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto" style={{ minWidth: 0 }}>
        <EnTete
          titre="🛍️ Boutique"
          sousTitre={params.francoPortDes === null
            ? "La livraison n'est jamais offerte."
            : `Livraison offerte dès ${libelleSeuil(params.francoPortDes)} d'articles.`}
          action={<Bouton href="/reglages" variante="secondaire">← Réglages</Bouton>}
        />

        <Carte>
          <FormFrancoPort
            valeurInitiale={params.francoPortDes === null ? "" : String(params.francoPortDes)}
          />
        </Carte>

        <Carte>
          <FormGrillePort grille={params.grillePort} poidsMaxGrammes={params.poidsMaxGrammes} />
        </Carte>
      </div>
    </main>
  );
}
