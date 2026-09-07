import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { articlesVendables } from "@/src/lib/caisse";
import Caisse from "./Caisse";

export const dynamic = "force-dynamic";

export default async function CaissePage() {
  const acces = await exigerAccesAdmin("perm_boutique");

  // Le catalogue part en entier au navigateur : il est court, et la caisse
  // doit répondre au scan sans aller-retour.
  const articles = await articlesVendables();

  return (
    <Caisse
      articles={articles}
      peutFacturer={acces.permissions.perm_encaissements === true}
    />
  );
}
