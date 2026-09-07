import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import NavBoutique from "./NavBoutique";

/**
 * Espace Boutique : une navigation secondaire au-dessus de tous ses écrans.
 *
 * La garde est ici ET sur chaque page : un layout ne se réexécute pas à chaque
 * navigation côté client. Sans perm_boutique, on n'entre pas.
 *
 * La hauteur de cette barre est publiée en variable CSS, pour que la caisse —
 * qui occupe l'écran entier — sache combien retirer de sa propre hauteur.
 */
export default async function BoutiqueLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await exigerAccesAdmin("perm_boutique");

  return (
    <div style={{ "--nav-boutique": "61px" } as React.CSSProperties}>
      <NavBoutique />
      {children}
    </div>
  );
}
