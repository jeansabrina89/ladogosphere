import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import PageFournisseursDomaine from "@/app/components/fournisseurs/PageFournisseursDomaine";

export const dynamic = "force-dynamic";

/**
 * APP 73 — les fournisseurs de la boutique. Garde : la GESTION de la
 * boutique — une vendeuse sans gestion ne les voit pas, comme aujourd'hui.
 */
export default async function FournisseursBoutiquePage() {
  const acces = await exigerAccesAdmin("perm_boutique_gestion");
  return <PageFournisseursDomaine domaine="boutique" acces={acces} />;
}
