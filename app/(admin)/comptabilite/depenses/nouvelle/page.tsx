import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { aujourdhuiISO } from "@/src/lib/dates";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import { listerArticles } from "@/src/lib/boutique";
import type { ArticleEntree } from "@/app/components/EntreeEnStock";
import FormDepense, { type FournisseurChoix } from "../FormDepense";

export const dynamic = "force-dynamic";

export default async function NouvelleDepensePage() {
  await exigerAccesAdmin("perm_depenses");

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
          articles={articles.map((a) => ({
            id: a.id, nom: a.nom, reference: a.reference,
            unite: a.unite, categorie: a.categorie, composant: a.composant,
          })) as ArticleEntree[]}
        />
      </div>
    </main>
  );
}
