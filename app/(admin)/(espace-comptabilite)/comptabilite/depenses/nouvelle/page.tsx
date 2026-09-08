import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { aujourdhuiISO } from "@/src/lib/dates";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import { listerArticles } from "@/src/lib/boutique";
import { perimetreDeArticle, accesStockAccorde } from "@/src/lib/perimetreStock";
import type { ArticleEntree } from "@/app/components/EntreeEnStock";
import FormDepense, { type FournisseurChoix } from "../FormDepense";

export const dynamic = "force-dynamic";

export default async function NouvelleDepensePage() {
  const acces = await exigerAccesAdmin("perm_depenses");

  const [{ data: fournisseurs }, articles] = await Promise.all([
    supabaseAdmin
      .from("fournisseurs")
      .select("id, nom, compte_charge_defaut")
      .eq("actif", true)
      .order("nom"),
    listerArticles({ actifsSeulement: true }),
  ]);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-xl mx-auto">
        <EnTete
          titre="🧾 Nouvelle dépense"
          sousTitre="Le justificatif est obligatoire pour valider."
          action={<Bouton href="/comptabilite/depenses" variante="secondaire">← Dépenses</Bouton>}
        />
        <FormDepense
          fournisseurs={(fournisseurs ?? []) as FournisseurChoix[]}
          dateDuJour={aujourdhuiISO()}
          // On ne propose d'entrer en stock que ce qu'on a le droit de toucher :
          // les fournitures demandent l'atelier, les marchandises la gestion
          // boutique. Sans l'un ni l'autre, la section reste vide.
          articles={articles
            .filter((a) => accesStockAccorde(acces.permissions, perimetreDeArticle(a), "gestion"))
            .map((a) => ({
              id: a.id, nom: a.nom, reference: a.reference,
              unite: a.unite, categorie: a.categorie, composant: a.composant,
            })) as ArticleEntree[]}
        />
      </div>
    </main>
  );
}
