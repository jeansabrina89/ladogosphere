import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import PageFournisseursDomaine from "@/app/components/fournisseurs/PageFournisseursDomaine";

export const dynamic = "force-dynamic";

/** APP 73 — les fournisseurs de l'atelier. Garde : celle de l'atelier. */
export default async function FournisseursAtelierPage() {
  const acces = await exigerAccesAdmin("perm_atelier");
  return <PageFournisseursDomaine domaine="atelier" acces={acces} />;
}
