import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { lireParametresEnLigne } from "@/src/lib/venteEnLigne";
import { formatPoids, libelleSeuil } from "@/src/lib/venteEnLigneLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import FormFrancoPort from "./FormFrancoPort";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.58)";

/**
 * Réglages → Boutique.
 *
 * Pour l'instant, un seul réglage s'y saisit : le seuil de livraison offerte.
 * La grille des frais de port et le poids maximum d'un colis y sont rappelés
 * tels qu'ils sont enregistrés, pour qu'on sache contre quoi le seuil joue —
 * ils n'ont pas encore d'écran de saisie.
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
          <h2 style={{ margin: "0 0 8px", color: MARINE, fontSize: 16, fontWeight: 700 }}>
            L&apos;envoi postal aujourd&apos;hui
          </h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: SOUS, fontSize: 14, display: "grid", gap: 4 }}>
            {params.grillePort.map((p, i) => (
              <li key={i}>
                Jusqu&apos;à {formatPoids(p.jusqu_a_grammes)} : {p.prix.toFixed(2)} CHF
              </li>
            ))}
            <li>Colis de {formatPoids(params.poidsMaxGrammes)} au plus : au-delà, il faut venir le chercher.</li>
          </ul>
        </Carte>
      </div>
    </main>
  );
}
