import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { droitsNav, entreesEspace, type CleEspace } from "@/src/lib/espaces";
import NavEspace from "./NavEspace";

/**
 * Le layout commun des huit espaces — celui de la boutique, généralisé.
 *
 * Il pose la barre secondaire au-dessus de tous les écrans de l'espace, avec
 * les seules entrées auxquelles la personne a droit. Il ne remplace PAS la
 * garde de chaque page : un layout ne se réexécute pas à chaque navigation
 * côté client, il ne peut donc pas tenir lieu de verrou. Il vérifie seulement
 * le rôle, comme le layout du groupe (admin).
 *
 * Aucune adresse ne change : les espaces sont des groupes de routes entre
 * parenthèses, invisibles dans l'URL.
 */
export default async function LayoutEspace({
  cle,
  nom,
  children,
}: {
  cle: CleEspace;
  nom: string;
  children: React.ReactNode;
}) {
  const acces = await exigerAccesAdmin();
  const entrees = entreesEspace(cle, droitsNav(acces.permissions, acces.isAdmin));

  return (
    <div>
      <NavEspace nom={nom} entrees={entrees} />
      {children}
    </div>
  );
}
