import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { articlesVendables } from "@/src/lib/caisse";
import { aplatirContextePrix, contextePrix } from "@/src/lib/prix";
import Caisse from "./Caisse";

export const dynamic = "force-dynamic";

export default async function CaissePage() {
  const acces = await exigerAccesAdmin("perm_boutique_vente");

  // Le catalogue part en entier au navigateur : il est court, et la caisse
  // doit répondre au scan sans aller-retour. Les rubriques en cours et la
  // remise membre par catégorie l'accompagnent, pour que le prix se recalcule
  // dès qu'un client est choisi — par la MÊME fonction que le serveur.
  const [articles, ctx] = await Promise.all([articlesVendables(), contextePrix()]);

  return (
    <Caisse
      articles={articles}
      contexte={aplatirContextePrix(ctx)}
      peutFacturer={acces.permissions.perm_encaissements === true}
    />
  );
}
