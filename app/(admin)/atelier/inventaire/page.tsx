import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { listerArticles } from "@/src/lib/boutique";
import { aujourdhuiISO } from "@/src/lib/dates";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import FormInventaire, { type LigneComptage } from "@/app/components/stock/FormInventaire";

export const dynamic = "force-dynamic";

/**
 * Inventaire de l'atelier : le même écran de comptage que la boutique, avec
 * les fournitures à la place des articles. Aucun code dupliqué — un périmètre.
 */
export default async function InventaireAtelierPage() {
  await exigerAccesAdmin("perm_atelier");

  const articles = await listerArticles({ actifsSeulement: true, perimetre: "atelier" });

  const lignes: LigneComptage[] = articles.map((a) => ({
    id: a.id,
    reference: a.reference,
    nom: a.nom,
    categorie: a.categorie,
    unite: a.unite,
    stock_actuel: Number(a.stock_actuel),
  }));

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto">
        <EnTete
          titre="📦 Inventaire des fournitures"
          sousTitre="Comptez la sangle au mètre, les boucles, les rivets. Ce qui est compté fait foi."
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href="/atelier/entrees" variante="secondaire">📥 Entrées</Bouton>
              <Bouton href="/atelier" variante="secondaire">← Atelier</Bouton>
            </div>
          }
        />

        {lignes.length === 0 ? (
          <Carte>
            <EtatVide
              icone="🧵"
              titre="Rien à compter"
              message="Aucune fourniture active. Créez-en une depuis le catalogue de l'atelier."
            />
          </Carte>
        ) : (
          <FormInventaire lignes={lignes} dateDuJour={aujourdhuiISO()} />
        )}
      </div>
    </main>
  );
}
