import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { listerArticles } from "@/src/lib/boutique";
import { aujourdhuiISO } from "@/src/lib/dates";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import FormInventaire, { type LigneComptage } from "./FormInventaire";

export const dynamic = "force-dynamic";

export default async function InventairePage() {
  await exigerAccesAdmin("perm_boutique");

  // Un article sur mesure n'a pas de stock de produit fini : rien à compter.
  const articles = (await listerArticles({ actifsSeulement: true }))
    .filter((a) => a.type_article !== "personnalisable");

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
          titre="📦 Inventaire"
          sousTitre="Comptez, saisissez, validez une seule fois. Ce qui est compté fait foi."
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href="/boutique/inventaire/recapitulatif" variante="secondaire">
                🖨️ Récapitulatif
              </Bouton>
              <Bouton href="/boutique" variante="secondaire">← Boutique</Bouton>
            </div>
          }
        />

        {lignes.length === 0 ? (
          <Carte>
            <EtatVide
              icone="📦"
              titre="Rien à compter"
              message="Le catalogue ne contient aucun article actif."
            />
          </Carte>
        ) : (
          <FormInventaire lignes={lignes} dateDuJour={aujourdhuiISO()} />
        )}
      </div>
    </main>
  );
}
