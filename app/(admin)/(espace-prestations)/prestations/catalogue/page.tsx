import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import EnTete from "@/app/components/ui/EnTete";
import GestionCatalogue, { type Prestation } from "./GestionCatalogue";

export const dynamic = "force-dynamic";

/**
 * Le catalogue des services vendus aux locataires.
 *
 * Ce sont des SERVICES, pas des articles : ils ne touchent ni au stock ni au
 * compte 3200 de la boutique. Leur produit est 3020 Prestations annexes.
 */
export default async function CataloguePage() {
  await exigerAdminPage();

  const { data } = await supabaseAdmin
    .from("prestations")
    .select("id, nom, description, unite, prix, duree_minutes, taux_tva, motif_tva, actif, ordre")
    .order("ordre")
    .order("nom");

  const prestations = ((data ?? []) as unknown as Prestation[]).map((p) => ({
    ...p,
    prix: Number(p.prix),
    taux_tva: Number(p.taux_tva),
  }));

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", minWidth: 0 }}>
        <EnTete
          titre="🔖 Catalogue des prestations"
          sousTitre="Les services vendus aux locataires de box. Ni stock, ni boutique."
        />
        <GestionCatalogue prestations={prestations} />
      </div>
    </main>
  );
}
