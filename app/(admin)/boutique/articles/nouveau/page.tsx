import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import FormArticle from "../FormArticle";

export const dynamic = "force-dynamic";

export default async function NouvelArticlePage() {
  await exigerAccesAdmin("perm_boutique_gestion");

  const { data: fournisseurs } = await supabaseAdmin
    .from("fournisseurs")
    .select("id, nom")
    .eq("actif", true)
    .order("nom");

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto">
        <EnTete
          titre="🛒 Nouvel article"
          sousTitre="La photo se dépose ensuite, sur la fiche."
          action={<Bouton href="/boutique/articles" variante="secondaire">← Articles</Bouton>}
        />
        <Carte>
          <FormArticle fournisseurs={(fournisseurs ?? []) as { id: string; nom: string }[]} />
        </Carte>
      </div>
    </main>
  );
}
