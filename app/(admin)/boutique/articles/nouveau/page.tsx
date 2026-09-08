import { redirect } from "next/navigation";
import { exigerAccesAdmin, refusStock } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { configPerimetre, type PerimetreStock } from "@/src/lib/perimetreStock";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import FormArticle from "../FormArticle";

export const dynamic = "force-dynamic";

/**
 * Création d'un article — ou d'une fourniture.
 *
 * Un seul écran, deux portes : `?composant=1` arrive de l'atelier et coche la
 * case. Le paramètre choisit ce qu'on crée, pas le droit de le créer : la
 * permission exigée en découle, et l'action serveur la revérifie de son côté.
 */
export default async function NouvelArticlePage({
  searchParams,
}: {
  searchParams: Promise<{ composant?: string }>;
}) {
  const acces = await exigerAccesAdmin();
  const params = await searchParams;

  const perimetre: PerimetreStock = params.composant === "1" ? "atelier" : "boutique";
  const refus = refusStock(acces, perimetre, "gestion");
  if (refus) redirect(refus);

  const config = configPerimetre(perimetre);

  const { data: fournisseurs } = await supabaseAdmin
    .from("fournisseurs")
    .select("id, nom")
    .eq("actif", true)
    .order("nom");

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto">
        <EnTete
          titre={perimetre === "atelier" ? "🧵 Nouvelle fourniture" : "🛒 Nouvel article"}
          sousTitre="La photo se dépose ensuite, sur la fiche."
          action={<Bouton href={config.liste} variante="secondaire">← Retour</Bouton>}
        />
        <Carte>
          <FormArticle
            fournisseurs={(fournisseurs ?? []) as { id: string; nom: string }[]}
            composantParDefaut={perimetre === "atelier"}
          />
        </Carte>
      </div>
    </main>
  );
}
