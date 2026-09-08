import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { droitsNav, type CleEspace } from "@/src/lib/espaces";
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
 * Il passe les DROITS à la barre plutôt qu'une liste d'entrées toute faite :
 * c'est elle qui sait quelle adresse est affichée, et donc quel espace la
 * possède réellement.
 *
 * Aucune adresse ne change : les espaces sont des groupes de routes entre
 * parenthèses, invisibles dans l'URL.
 */
export default async function LayoutEspace({
  cle,
  children,
}: {
  cle: CleEspace;
  children: React.ReactNode;
}) {
  const acces = await exigerAccesAdmin();

  return (
    <div>
      <NavEspace cleParDefaut={cle} droits={droitsNav(acces.permissions, acces.isAdmin)} />
      {children}
    </div>
  );
}
