import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import NavBoutique from "./NavBoutique";

/**
 * Espace Boutique : une navigation secondaire au-dessus de tous ses écrans.
 *
 * La garde est ici ET sur chaque page : un layout ne se réexécute pas à chaque
 * navigation côté client. Sans « Boutique — vente », on n'entre pas ; la barre
 * n'affiche ensuite que ce à quoi la personne a droit.
 *
 * La hauteur de cette barre est publiée en variable CSS, pour que la caisse —
 * qui occupe l'écran entier — sache combien retirer de sa propre hauteur.
 */
export default async function BoutiqueLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const acces = await exigerAccesAdmin("perm_boutique_vente");

  return (
    <div style={{ "--nav-boutique": "61px" } as React.CSSProperties}>
      <NavBoutique gestion={acces.permissions.perm_boutique_gestion === true} />
      {children}
    </div>
  );
}
