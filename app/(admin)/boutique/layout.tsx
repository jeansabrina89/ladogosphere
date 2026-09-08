import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { droitsNav, entreesEspace } from "@/src/lib/espaces";
import NavEspace from "@/app/components/NavEspace";

/**
 * Espace Boutique : une navigation secondaire au-dessus de tous ses écrans.
 *
 * La garde est ici ET sur chaque page : un layout ne se réexécute pas à chaque
 * navigation côté client. Sans « Boutique — vente », on n'entre pas ; la barre
 * n'affiche ensuite que ce à quoi la personne a droit.
 *
 * La composition de la barre vit dans src/lib/espaces.ts, avec celle des sept
 * autres espaces : une seule liste, testée, qui se conforme aux gardes des
 * pages plutôt que de les redéfinir.
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
  const entrees = entreesEspace("boutique", droitsNav(acces.permissions, acces.isAdmin));

  return (
    <div style={{ "--nav-boutique": "61px" } as React.CSSProperties}>
      <NavEspace nom="Boutique" entrees={entrees} />
      {children}
    </div>
  );
}
