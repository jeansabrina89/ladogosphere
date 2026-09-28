import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { lireParametresEnLigne } from "@/src/lib/venteEnLigne";
import { formatPrixClient } from "@/src/lib/prixClient";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import FormFrancoPort from "./FormFrancoPort";
import FormGrillePort from "./FormGrillePort";
import FormAnimauxEnLigne from "./FormAnimauxEnLigne";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { libelleValeur } from "@/src/lib/etiquettesArticles";
import { animauxOuvertsEnLigne } from "@/src/lib/animauxEnLigne";
import { TOUS_LES_ANIMAUX } from "@/src/lib/animauxEnLigneLogique";

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

  /*
   * APP 48 — le nombre d'articles PUBLIÉS par animal.
   *
   * Lu dans la TABLE, pas dans la vitrine : la vitrine ne montre déjà plus les
   * animaux fermés, et l'écran n'apprendrait donc rien sur ce qu'on rouvre —
   * qui est exactement la question qu'on se pose devant ces cases.
   */
  const ouverts = await animauxOuvertsEnLigne();
  const { data: publies } = await supabaseAdmin
    .from("articles")
    .select("animaux")
    .eq("actif", true)
    .eq("vendable_en_ligne", true)
    .eq("composant", false)
    .eq("statut_vitrine", "publie");

  const compte = new Map<string, number>();
  for (const a of (publies ?? []) as unknown as { animaux: string[] | null }[]) {
    for (const animal of a.animaux ?? []) compte.set(animal, (compte.get(animal) ?? 0) + 1);
  }
  const animaux = TOUS_LES_ANIMAUX.map((valeur) => ({
    valeur,
    libelle: libelleValeur("animaux", valeur),
    nombre: compte.get(valeur) ?? 0,
  }));

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto" style={{ minWidth: 0 }}>
        <EnTete
          titre="🛍️ Boutique"
          sousTitre={params.francoPortDes === null
            ? "La livraison n'est jamais offerte."
            : `Livraison offerte dès ${formatPrixClient(params.francoPortDes)} d'articles.`}
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

        <Carte>
          <h2 style={{ color: "#1B2B5E", fontSize: 17, fontWeight: 700, margin: "0 0 10px" }}>
            🐾 Animaux vendus en ligne
          </h2>
          <FormAnimauxEnLigne animaux={animaux} ouverts={ouverts} />
        </Carte>
      </div>
    </main>
  );
}
