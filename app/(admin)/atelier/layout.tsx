import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { droitsNav, entreesEspace } from "@/src/lib/espaces";
import NavEspace from "@/app/components/NavEspace";

/**
 * Espace Atelier : les fournitures de fabrication, séparées du magasin.
 *
 * Sans « Atelier », on n'entre pas — et l'entrée n'apparaît nulle part. La
 * garde est ici ET sur chaque page : un layout ne se réexécute pas à chaque
 * navigation côté client.
 */
export default async function AtelierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const acces = await exigerAccesAdmin("perm_atelier");
  const entrees = entreesEspace("atelier", droitsNav(acces.permissions, acces.isAdmin));

  return (
    <div>
      <NavEspace nom="Atelier" entrees={entrees} />
      {children}
    </div>
  );
}
