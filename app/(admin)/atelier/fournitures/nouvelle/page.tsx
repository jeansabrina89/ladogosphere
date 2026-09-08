import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { tauxLegauxEnVigueur } from "@/src/lib/tva";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import FormArticle from "@/app/(admin)/boutique/articles/FormArticle";

export const dynamic = "force-dynamic";

/**
 * Nouvelle fourniture.
 *
 * Le MÊME formulaire que celui d'un article, paramétré sur le périmètre de
 * l'atelier — pas une seconde saisie qui finirait par diverger. Ce qui ne
 * concerne que la vente en disparaît : ni prix de vente, ni catégorie de
 * vente, ni vitrine. Ce qui reste est ce qu'on sait d'une sangle : son nom,
 * son unité, son prix d'achat, son fournisseur, son seuil.
 *
 * On repart ensuite vers la liste des fournitures, pas vers le magasin.
 */
export default async function NouvelleFournituraPage() {
  await exigerAccesAdmin("perm_atelier");

  const [{ data: fournisseurs }, tauxLegaux] = await Promise.all([
    supabaseAdmin.from("fournisseurs").select("id, nom").eq("actif", true).order("nom"),
    tauxLegauxEnVigueur(),
  ]);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto">
        <EnTete
          titre="🧵 Nouvelle fourniture"
          sousTitre="Ce que vous transformez : sangle, bouclerie, rivets, puces. La photo se dépose ensuite, sur la fiche."
          action={<Bouton href="/atelier/fournitures" variante="secondaire">← Fournitures</Bouton>}
        />
        <Carte>
          <FormArticle
            fournisseurs={(fournisseurs ?? []) as { id: string; nom: string }[]}
            tauxLegaux={tauxLegaux}
            perimetre="atelier"
          />
        </Carte>
      </div>
    </main>
  );
}
